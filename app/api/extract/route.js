import { NextResponse } from "next/server";

// Last-resort video extractor. Fetches a page server-side, looks for direct
// video URLs in <video>/<source> tags, OpenGraph meta tags, Twitter player
// stream meta tags, and JSON-LD VideoObject markup. Returns whatever it finds.
//
// IMPORTANT LIMITATIONS:
//   - Tokenized CDN URLs may expire fast. Cache-Control is no-store so the
//     client always re-extracts on each play.
//   - Many CDNs bind the token to the requesting IP. The serverless function
//     fetches from Vercel's IP, the browser plays from yours. Mismatch = 403.
//     Nothing we can do about that here.
//   - Sites with anti-bot perimeters (Cloudflare challenge, Datadome, etc.)
//     return interstitial HTML, not the real page. Detection: no sources
//     found despite 200 OK. The right fix is a headless browser on a
//     long-running worker, which is intentionally out of scope.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET(request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let parsed;
  try { parsed = new URL(target); }
  catch { return NextResponse.json({ error: "Invalid url" }, { status: 400 }); }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Unsupported scheme" }, { status: 400 });
  }

  try {
    const res = await fetch(parsed.href, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": parsed.origin + "/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Page fetch failed (${res.status})` }, { status: 502 });
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("xml")) {
      // Sometimes the URL IS the video. If it's a direct video CT, just hand it back.
      if (/^(video|application\/(x-mpegurl|vnd\.apple\.mpegurl))/i.test(ct)) {
        return NextResponse.json({
          sources: [{ url: parsed.href, resolution: null, type: ct }],
          title: null,
        }, { headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ error: `Not an HTML page (${ct})` }, { status: 415 });
    }

    const html = await res.text();
    const sources = extractSources(html, parsed.href);
    const title = extractTitle(html);

    if (sources.length === 0) {
      return NextResponse.json({ error: "No video found on this page", title }, { status: 404 });
    }

    // Sort by resolution descending so the player picks the highest available
    sources.sort((a, b) => (b.resolution || 0) - (a.resolution || 0));

    return NextResponse.json({ sources, title }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Extraction failed" }, { status: 502 });
  }
}

// ─── Source extraction ───────────────────────────────────────────────────────

function extractSources(html, base) {
  const found = [];
  const seen = new Set();
  const add = (raw, resolution, type) => {
    if (!raw) return;
    const u = absolutize(raw, base);
    if (!u || seen.has(u)) return;
    seen.add(u);
    found.push({ url: u, resolution: resolution || null, type: type || null });
  };

  // <video src="...">
  for (const m of html.matchAll(/<video\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    add(m[1], null, null);
  }

  // <source src="..." type="..." size="720"> (any attribute order)
  for (const m of html.matchAll(/<source\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) continue;
    const type = /\btype=["']([^"']+)["']/i.exec(tag)?.[1] || null;
    // Resolution can show up as size, label, data-res, data-quality, data-height, res
    const resMatch = /\b(?:size|label|res|data-res|data-quality|data-height)=["']?(\d{3,4})\s*p?["']?/i.exec(tag);
    const resolution = resMatch ? parseInt(resMatch[1], 10) : null;
    if (isLikelyVideo(src, type)) add(src, resolution, type);
  }

  // OpenGraph video meta tags
  for (const m of html.matchAll(/<meta\b[^>]*\bproperty=["']og:video(?::(?:url|secure_url))?["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/gi)) {
    if (isLikelyVideo(m[1])) add(m[1], null, null);
  }
  // Content first, property second (attribute order can flip)
  for (const m of html.matchAll(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bproperty=["']og:video(?::(?:url|secure_url))?["'][^>]*>/gi)) {
    if (isLikelyVideo(m[1])) add(m[1], null, null);
  }

  // Twitter card stream
  for (const m of html.matchAll(/<meta\b[^>]*\bname=["']twitter:player:stream["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/gi)) {
    add(m[1], null, null);
  }

  // JSON-LD VideoObject — look for contentUrl / embedUrl
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const items = Array.isArray(data) ? data : [data];
      for (const it of items) {
        const cu = it?.contentUrl || it?.embedUrl;
        if (cu && isLikelyVideo(cu)) add(cu, null, null);
        // Some schemas nest under @graph
        const graph = it?.["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            const gu = g?.contentUrl || g?.embedUrl;
            if (gu && isLikelyVideo(gu)) add(gu, null, null);
          }
        }
      }
    } catch { /* malformed JSON-LD is common, ignore */ }
  }

  // Last-ditch: scan the page for inlined .mp4 / .m3u8 / .webm URLs in JS strings.
  // Tight bounds to keep this from matching documentation links etc.
  for (const m of html.matchAll(/["'](https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8|webm)(?:\?[^"'\s<>]*)?)["']/gi)) {
    add(m[1], null, null);
  }

  return found;
}

function isLikelyVideo(url, type) {
  if (type && /^(?:video|application\/(?:x-mpegurl|vnd\.apple\.mpegurl|dash\+xml))/i.test(type)) return true;
  return /\.(mp4|webm|m3u8|mov|m4v|ogg|ogv|mpd)(\?|$)/i.test(url);
}

function absolutize(u, base) {
  try { return new URL(u, base).href; } catch { return null; }
}

function extractTitle(html) {
  const og = /<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/i.exec(html)?.[1];
  if (og) return decodeHtml(og.trim());
  const t = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
  return t ? decodeHtml(t.trim()) : null;
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
