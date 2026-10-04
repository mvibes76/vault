import { NextResponse } from "next/server";
import { safeFetch, validatePublicUrl, encodedApiUrl, readTextLimited } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024; // 512 MB safety cap for direct files
const MAX_BYTES = Number(process.env.MEDIA_RELAY_MAX_BYTES || DEFAULT_MAX_BYTES);
const MAX_HLS_BYTES = 2 * 1024 * 1024;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  try { await guardProxyRequest(request, "stream"); }
  catch (error) { return securityErrorResponse(error, "Relay unavailable"); }

  const checked = await validatePublicUrl(rawUrl);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  const range = request.headers.get("range");
  const headers = {
    "User-Agent": UA,
    "Accept": "video/*,application/vnd.apple.mpegurl,application/x-mpegURL,application/octet-stream,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": checked.url.origin + "/",
  };
  if (range) headers.Range = range;

  try {
    const upstream = await safeFetch(checked.url.href, {
      headers,
      timeoutMs: 45000,
      maxBytes: MAX_BYTES,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: `Relay fetch failed (${upstream.status})` }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    const urlLooksHls = /\.m3u8(?:\?|$)/i.test(checked.url.pathname + checked.url.search);
    const isHls = urlLooksHls || /mpegurl|vnd\.apple\.mpegurl/i.test(contentType);

    if (isHls) {
      const playlist = await readTextLimited(upstream, MAX_HLS_BYTES);
      const rewritten = rewriteHlsPlaylist(playlist, upstream.url || checked.url.href);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const directMedia = /^(video|audio)\//i.test(contentType) || /^(application\/(?:octet-stream|x-mpegurl|vnd\.apple\.mpegurl))/i.test(contentType);
    const urlLooksMedia = /\.(mp4|webm|mov|m4v|m3u8|mp3|m4a|aac|ogg)(?:\?|$)/i.test(checked.url.pathname + checked.url.search);
    if (!directMedia && !urlLooksMedia) {
      try { await upstream.body?.cancel(); } catch {}
      return NextResponse.json({ error: "Unsupported relay content type" }, { status: 415 });
    }

    if (contentLength > MAX_BYTES && !range) {
      return NextResponse.json({ error: "Media exceeds relay size limit. Use the original link or a dedicated media worker." }, { status: 413 });
    }

    const out = new Headers();
    [
      "content-type", "content-length", "content-range", "accept-ranges",
      "etag", "last-modified"
    ].forEach((key) => {
      const value = upstream.headers.get(key);
      if (value) out.set(key, value);
    });
    out.set("Cache-Control", "no-store");
    out.set("Cross-Origin-Resource-Policy", "same-origin");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (err) {
    return securityErrorResponse(err, "Relay failed");
  }
}

function rewriteHlsPlaylist(playlist, baseUrl) {
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Rewrite segment / child playlist lines.
      if (!trimmed.startsWith("#")) return relayUrl(trimmed, baseUrl);

      // Rewrite URI="..." attributes used by keys, maps, iframe playlists, media groups.
      return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${relayUrl(uri, baseUrl)}"`);
    })
    .join("\n");
}

function relayUrl(raw, baseUrl) {
  try {
    const absolute = new URL(raw, baseUrl).href;
    return encodedApiUrl("/api/stream", absolute);
  } catch {
    return raw;
  }
}
