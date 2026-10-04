import { NextResponse } from "next/server";
import { safeFetch, readTextLimited } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const MAX_BYTES = Number(process.env.MEDIA_RELAY_MAX_BYTES || DEFAULT_MAX_BYTES);
const MAX_CONFIRM_HTML_BYTES = 1_000_000;

// Proxies Google Drive files with byte-range support.
// Three.js model loaders can fetch through this to avoid CORS.
// HTML5 video needs Range support or large Drive videos feel like they never load.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("id");

  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }
  try { await guardProxyRequest(request, "file"); }
  catch (error) { return securityErrorResponse(error, "File unavailable"); }

  try {
    const range = request.headers.get("range");
    const upstreamHeaders = {
      "User-Agent": "Mozilla/5.0",
    };
    if (range) upstreamHeaders.Range = range;

    const resolvedUrl = await resolveDriveDownloadUrl(fileId);
    const res = await safeFetch(resolvedUrl, {
      headers: upstreamHeaders,
      timeoutMs: 60000,
      maxBytes: MAX_BYTES,
    });

    if (!res.ok && res.status !== 206) {
      throw new Error(`Download failed (${res.status})`);
    }

    const headers = new Headers();
    const passthrough = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag",
    ];

    for (const key of passthrough) {
      const value = res.headers.get(key);
      if (value) headers.set(key, value);
    }

    headers.set("Cache-Control", "private, max-age=900");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    headers.set("Access-Control-Allow-Headers", "Range, Content-Type");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
    if (!headers.has("Accept-Ranges")) headers.set("Accept-Ranges", "bytes");

    return new NextResponse(res.body, {
      status: res.status,
      headers,
    });
  } catch (err) {
    return securityErrorResponse(err, "File unavailable");
  }
}

async function resolveDriveDownloadUrl(fileId) {
  let url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res = await safeFetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeoutMs: 30000,
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    try { await res.body?.cancel(); } catch {}
    return res.url || url;
  }

  const html = await readTextLimited(res, MAX_CONFIRM_HTML_BYTES);
  const confirmMatch =
    html.match(/confirm=([a-zA-Z0-9-_]+)/) ||
    html.match(/name="confirm" value="([^"]+)"/);
  const uuidMatch = html.match(/name="uuid" value="([^"]+)"/);

  if (!confirmMatch) {
    throw new Error("File requires authentication, is not public, or Google Drive blocked direct download.");
  }

  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmMatch[1]}${uuidMatch ? `&uuid=${uuidMatch[1]}` : ""}`;
}
