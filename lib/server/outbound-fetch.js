import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import {
  OutboundSecurityError,
  parsePublicHttpUrl,
  isBlockedAddress,
  assertPublicResolution,
  isRedirectStatus,
  safeRedirectUrl,
} from "./safe-url-core.mjs";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_REDIRECTS = 4;

function normalizeHeaders(input) {
  const headers = new Headers(input || {});
  headers.delete("connection");
  headers.delete("proxy-authorization");
  headers.delete("proxy-authenticate");
  headers.delete("upgrade");
  headers.delete("transfer-encoding");
  return headers;
}

function webHeadersFromNode(rawHeaders) {
  const out = new Headers();
  for (const [key, value] of Object.entries(rawHeaders || {})) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((v) => out.append(key, v));
    else out.set(key, String(value));
  }
  return out;
}

function limitedBody(nodeStream, maxBytes) {
  const source = Readable.toWeb(nodeStream);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return source;

  let seen = 0;
  return source.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      const bytes = chunk?.byteLength ?? chunk?.length ?? 0;
      seen += bytes;
      if (seen > maxBytes) {
        controller.error(new OutboundSecurityError("Upstream response exceeded size limit", 413, "BODY_TOO_LARGE"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
}

async function resolvePinned(url, resolver = dns.lookup) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  const family = net.isIP(hostname);
  if (family) {
    if (isBlockedAddress(hostname)) {
      throw new OutboundSecurityError("Blocked private or reserved address", 400, "PRIVATE_ADDRESS");
    }
    return { address: hostname, family };
  }

  let records;
  try {
    records = await resolver(hostname, { all: true, verbatim: true });
  } catch {
    throw new OutboundSecurityError("Could not resolve host", 400, "DNS_ERROR");
  }
  assertPublicResolution(records);

  // Reject the entire answer set if any record is private, then connect to the
  // exact validated address. This prevents a second DNS lookup/rebind.
  return { address: records[0].address, family: records[0].family };
}

function nodeRequest(url, resolved, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;
    const headers = normalizeHeaders(options.headers);
    headers.set("host", url.host);

    const req = transport.request({
      protocol: url.protocol,
      hostname: resolved.address,
      family: resolved.family,
      port: url.port || (isHttps ? 443 : 80),
      path: (url.pathname || "/") + (url.search || ""),
      method: options.method || "GET",
      headers: Object.fromEntries(headers.entries()),
      servername: isHttps ? url.hostname : undefined,
      rejectUnauthorized: true,
      signal: options.signal,
    }, (res) => resolve(res));

    req.on("error", reject);
    req.setTimeout(Number(options.timeoutMs || DEFAULT_TIMEOUT_MS), () => {
      req.destroy(new OutboundSecurityError("Upstream request timed out", 504, "UPSTREAM_TIMEOUT"));
    });

    if (options.body != null) {
      if (typeof options.body === "string" || Buffer.isBuffer(options.body) || options.body instanceof Uint8Array) {
        req.write(options.body);
      } else {
        reject(new OutboundSecurityError("Unsupported outbound request body", 400, "UNSUPPORTED_BODY"));
        req.destroy();
        return;
      }
    }
    req.end();
  });
}

function sanitizeRequestHeadersForRedirect(headers, from, to) {
  const next = normalizeHeaders(headers);
  if (from.origin !== to.origin) {
    next.delete("authorization");
    next.delete("cookie");
  }
  next.delete("host");
  return next;
}

export async function outboundFetch(rawUrl, options = {}) {
  const maxRedirects = Number.isInteger(options.maxRedirects) ? options.maxRedirects : DEFAULT_REDIRECTS;
  return outboundFetchInner(parsePublicHttpUrl(rawUrl), { ...options, maxRedirects }, 0);
}

async function outboundFetchInner(url, options, redirectCount) {
  const resolved = await resolvePinned(url, options.resolver || dns.lookup);
  const nodeRes = await (options.requestImpl || nodeRequest)(url, resolved, options);

  const status = Number(nodeRes.statusCode || nodeRes.status || 502);
  const headers = nodeRes.headers instanceof Headers ? nodeRes.headers : webHeadersFromNode(nodeRes.headers);
  const contentLength = Number(headers.get("content-length") || 0);
  if (Number.isFinite(options.maxBytes) && options.maxBytes > 0 && contentLength > options.maxBytes) {
    nodeRes.destroy?.();
    throw new OutboundSecurityError("Upstream response exceeded size limit", 413, "BODY_TOO_LARGE");
  }

  if (isRedirectStatus(status)) {
    if (redirectCount >= options.maxRedirects) {
      nodeRes.destroy?.();
      throw new OutboundSecurityError("Too many redirects", 400, "TOO_MANY_REDIRECTS");
    }
    const nextUrl = safeRedirectUrl(headers.get("location"), url.href);
    nodeRes.resume?.();

    let method = options.method || "GET";
    let body = options.body;
    if (status === 303 || ((status === 301 || status === 302) && method.toUpperCase() === "POST")) {
      method = "GET";
      body = undefined;
    }

    return outboundFetchInner(nextUrl, {
      ...options,
      method,
      body,
      headers: sanitizeRequestHeadersForRedirect(options.headers, url, nextUrl),
    }, redirectCount + 1);
  }

  const body = nodeRes.body ? nodeRes.body : limitedBody(nodeRes, options.maxBytes);
  const response = new Response(body, { status, headers });
  Object.defineProperty(response, "url", { value: url.href, configurable: true });
  return response;
}

export async function readTextLimited(response, maxBytes) {
  const limit = Number(maxBytes);
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Number.isFinite(limit) && new TextEncoder().encode(text).byteLength > limit) {
      throw new OutboundSecurityError("Upstream response exceeded size limit", 413, "BODY_TOO_LARGE");
    }
    return text;
  }

  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (Number.isFinite(limit) && total > limit) {
      try { await reader.cancel(); } catch {}
      throw new OutboundSecurityError("Upstream response exceeded size limit", 413, "BODY_TOO_LARGE");
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

export async function validatePublicUrl(rawUrl) {
  try {
    const url = parsePublicHttpUrl(rawUrl);
    await resolvePinned(url);
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      status: error?.status || 400,
      error: safeOutboundErrorMessage(error),
      code: error?.code || "OUTBOUND_BLOCKED",
    };
  }
}

export function safeOutboundErrorMessage(error) {
  const known = new Set([
    "INVALID_URL", "UNSUPPORTED_SCHEME", "EMBEDDED_CREDENTIALS", "BLOCKED_HOST",
    "PRIVATE_ADDRESS", "DNS_ERROR", "DNS_EMPTY", "DNS_PRIVATE", "BAD_REDIRECT",
    "TOO_MANY_REDIRECTS", "BODY_TOO_LARGE", "UPSTREAM_TIMEOUT",
  ]);
  if (known.has(error?.code)) return error.message;
  return "Remote resource could not be fetched";
}

export function encodedApiUrl(path, targetUrl) {
  return path + "?url=" + encodeURIComponent(targetUrl);
}
