import dns from "node:dns/promises";
import net from "node:net";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain"]);

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.replace("::ffff:", "");
    if (net.isIP(v4) === 4) return isPrivateIPv4(v4);
  }
  return false;
}

export function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

export async function validatePublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, error: "Invalid url" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, status: 400, error: "Unsupported protocol" };
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".localhost")) {
    return { ok: false, status: 400, error: "Blocked host" };
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) return { ok: false, status: 400, error: "Blocked private address" };
    return { ok: true, url };
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, status: 400, error: "Could not resolve host" };
  }

  if (!records.length) return { ok: false, status: 400, error: "Could not resolve host" };
  if (records.some((r) => isPrivateAddress(r.address))) {
    return { ok: false, status: 400, error: "Host resolves to a private address" };
  }

  return { ok: true, url };
}

export async function safeFetch(rawUrl, options = {}, redirectsLeft = 4) {
  const checked = await validatePublicUrl(rawUrl);
  if (!checked.ok) {
    const err = new Error(checked.error);
    err.status = checked.status;
    throw err;
  }

  const response = await fetch(checked.url.href, {
    ...options,
    redirect: "manual",
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirectsLeft <= 0) {
      const err = new Error("Too many redirects");
      err.status = 400;
      throw err;
    }
    const location = response.headers.get("location");
    if (!location) return response;
    const nextUrl = new URL(location, checked.url.href).href;
    return safeFetch(nextUrl, options, redirectsLeft - 1);
  }

  return response;
}

export function encodedApiUrl(path, targetUrl) {
  return `${path}?url=${encodeURIComponent(targetUrl)}`;
}
