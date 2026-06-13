import { NextResponse } from "next/server";
import { safeFetch, validatePublicUrl } from "@/lib/server/safe-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_HTML_BYTES = 1_000_000;

export async function GET(request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const checked = await validatePublicUrl(target);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  try {
    const res = await safeFetch(checked.url.href, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": checked.url.origin + "/",
      },
      signal: AbortSignal.timeout(8000),
    });

    const contentType = res.headers.get("content-type") || "";
    const finalUrl = res.url || checked.url.href;

    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed (${res.status})`, url: finalUrl }, { status: 502 });
    }

    if (contentType.startsWith("image/") && !contentType.includes("svg")) {
      const path = new URL(finalUrl).pathname;
      const name = decodeURIComponent(path.split("/").pop() || "Image");
      return NextResponse.json({ url: finalUrl, title: name, type: "image", thumbnail: finalUrl, description: "", siteName: new URL(finalUrl).hostname, contentType }, { headers: { "Cache-Control": "no-store" } });
    }

    if (/^(video|application\/(x-mpegurl|vnd\.apple\.mpegurl))/i.test(contentType)) {
      const path = new URL(finalUrl).pathname;
      const name = decodeURIComponent(path.split("/").pop() || "Video");
      return NextResponse.json({ url: finalUrl, title: name, type: "video", thumbnail: "", description: "", siteName: new URL(finalUrl).hostname, contentType }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!contentType.includes("html") && !contentType.includes("xml")) {
      return NextResponse.json({ url: finalUrl, title: new URL(finalUrl).hostname, type: "link", thumbnail: "", description: "", siteName: new URL(finalUrl).hostname, contentType }, { headers: { "Cache-Control": "no-store" } });
    }

    const html = await readLimitedText(res, MAX_HTML_BYTES);
    const meta = {
      url: finalUrl,
      title: first([metaContent(html, "property", "og:title"), metaContent(html, "name", "twitter:title"), titleTag(html), checked.url.hostname]),
      description: first([metaContent(html, "property", "og:description"), metaContent(html, "name", "description"), metaContent(html, "name", "twitter:description"), ""]),
      thumbnail: absolutize(first([metaContent(html, "property", "og:image:secure_url"), metaContent(html, "property", "og:image"), metaContent(html, "name", "twitter:image"), metaContent(html, "name", "twitter:image:src"), ""]), finalUrl),
      siteName: first([metaContent(html, "property", "og:site_name"), checked.url.hostname]),
      type: contentKind(html, checked.url.href),
      contentType,
    };

    return NextResponse.json(meta, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Metadata fetch failed" }, { status: e.status || 502 });
  }
}

async function readLimitedText(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) break;
    chunks.push(value);
  }
  return new TextDecoder().decode(concat(chunks));
}

function concat(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

function first(values) { return values.find((v) => typeof v === "string" && v.trim())?.trim() || ""; }

function attrValue(tag, attr) {
  const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}=["']([^"']+)["']`, "i").exec(tag)?.[1] || "";
}

function metaContent(html, attr, value) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if ((attrValue(tag, attr) || "").toLowerCase() === value.toLowerCase()) return decodeHtml(attrValue(tag, "content"));
  }
  return "";
}

function titleTag(html) {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
  return decodeHtml(t.replace(/\s+/g, " ").trim());
}

function absolutize(raw, base) { if (!raw) return ""; try { return new URL(raw, base).href; } catch { return ""; } }

function contentKind(html, url) {
  const ogType = metaContent(html, "property", "og:type").toLowerCase();
  if (ogType.includes("video")) return "video";
  if (ogType.includes("image")) return "image";
  if (/\.(mp4|webm|m3u8|mov|m4v|ogg|ogv)(\?|$)/i.test(url)) return "video";
  if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url)) return "image";
  return "link";
}

function decodeHtml(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
