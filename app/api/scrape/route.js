import { NextResponse } from "next/server";
import { safeFetch, validatePublicUrl, readTextLimited } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const MAX_HTML_BYTES = 1_000_000;
const MAX_JSON_BYTES = 1_000_000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  try { await guardProxyRequest(request, "discovery"); }
  catch (error) { return securityErrorResponse(error, "Preview unavailable"); }

  const checked = await validatePublicUrl(url);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  const parsed = checked.url;
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  const cached = cache.get(parsed.href);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const result = { title: null, image: null, images: null, video: null, description: null, embed: null };

    // ── Reddit ──────────────────────────────────────────────────────────────
    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
      const jsonUrl = parsed.href.replace(/\/?$/, "") + ".json";
      const r = await safeFetch(jsonUrl, { headers: { "User-Agent": "MediaVault/1.0" }, timeoutMs: 8000, maxBytes: MAX_JSON_BYTES });
      if (r.ok) {
        const j = JSON.parse(await readTextLimited(r, MAX_JSON_BYTES));
        const post = j?.[0]?.data?.children?.[0]?.data;
        if (post) {
          result.title = post.title;
          result.image = post.thumbnail?.startsWith("http") ? post.thumbnail : null;
          if (post.preview?.images?.[0]?.source?.url) {
            result.image = post.preview.images[0].source.url.replace(/&amp;/g, "&");
          }
          const rv = post.media?.reddit_video || post.secure_media?.reddit_video;
          if (rv?.fallback_url) result.video = rv.fallback_url.split("?")[0];
          // Reddit gallery
          if (post.is_gallery && post.media_metadata) {
            result.images = Object.values(post.media_metadata)
              .filter((m) => m.status === "valid" && m.e === "Image")
              .map((m) => (m.s?.u || m.s?.gif || "").replace(/&amp;/g, "&"))
              .filter(Boolean);
          }
        }
        cache.set(parsed.href, { at: Date.now(), data: result });
        return NextResponse.json(result);
      }
    }

    // ── Instagram ────────────────────────────────────────────────────────────
    // Server-side scraping is blocked by Instagram. Use their public embed endpoint.
    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      const sc = parsed.href.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)?.[1];
      if (sc) {
        result.embed = `https://www.instagram.com/p/${sc}/embed/`;
        result.title = "Instagram Post";
      }
      cache.set(parsed.href, { at: Date.now(), data: result });
      return NextResponse.json(result);
    }

    // ── TikTok ───────────────────────────────────────────────────────────────
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      try {
        const oe = await safeFetch(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.href)}`,
          { headers: { "User-Agent": "Mozilla/5.0" }, timeoutMs: 5000, maxBytes: MAX_JSON_BYTES }
        );
        if (oe.ok) {
          const d = JSON.parse(await readTextLimited(oe, MAX_JSON_BYTES));
          result.title       = d.title || null;
          result.image       = d.thumbnail_url || null;
          result.description = d.author_name ? `@${d.author_name}` : null;
          if (d.html) {
            const srcMatch = d.html.match(/src="([^"]+)"/);
            if (srcMatch) result.embed = decodeEntities(srcMatch[1]);
          }
        }
      } catch {}
      cache.set(parsed.href, { at: Date.now(), data: result });
      return NextResponse.json(result);
    }

    // ── Generic OG scraping ──────────────────────────────────────────────────
    const res = await safeFetch(parsed.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      timeoutMs: 8000,
      maxBytes: MAX_HTML_BYTES,
    });

    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const html = (await readTextLimited(res, MAX_HTML_BYTES)).slice(0, 300000);

    const meta = (prop) => {
      const patterns = [
        new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"),
        new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, "i"),
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m) return decodeEntities(m[1]);
      }
      return null;
    };

    result.title       = meta("og:title") || meta("twitter:title") || extractTitle(html);
    result.image       = meta("og:image") || meta("og:image:url") || meta("twitter:image");
    result.video       = meta("og:video") || meta("og:video:url") || meta("og:video:secure_url") || meta("twitter:player:stream");
    result.description = meta("og:description") || meta("description");

    if (!result.video) {
      const vm = html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)['"]/i) ||
                 html.match(/<video[^>]+src=["']([^"']+\.mp4[^"']*)['"]/i);
      if (vm) result.video = decodeEntities(vm[1]);
    }

    // ── Gallery extraction ───────────────────────────────────────────────────
    const ogImages = [];
    const ogRx = /<meta[^>]+(?:property=["']og:image["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+property=["']og:image["'])/gi;
    let ogM;
    while ((ogM = ogRx.exec(html)) !== null) {
      const src = decodeEntities(ogM[1] || ogM[2]);
      if (src && !ogImages.includes(src)) ogImages.push(src);
    }

    const pageImages = [];
    const imgRx = /<img[^>]+src=["']([^"']+)["'][^>]*(?:width=["'](\d+)["'])?/gi;
    let imgM;
    while ((imgM = imgRx.exec(html)) !== null) {
      const src = imgM[1];
      const w   = imgM[2] ? parseInt(imgM[2]) : 999;
      if (
        src && src.startsWith("http") && w > 200 &&
        !/logo|icon|avatar|sprite|pixel|tracking|badge|button/i.test(src) &&
        /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(src) &&
        !pageImages.includes(src)
      ) pageImages.push(src);
    }

    const allImages = [...new Set([...ogImages, ...pageImages])];
    // Only populate images when there is no video — prevents gallery from
    // hijacking video posts that also have preview images.
    if (allImages.length >= 3 && !result.video) result.images = allImages.slice(0, 40);

    // Resolve relative URLs
    const base = new URL(res.url || parsed.href);
    const abs = (u) => { if (!u) return null; try { return new URL(u, base).href; } catch { return u; } };
    result.image  = abs(result.image);
    result.video  = abs(result.video);
    result.images = result.images?.map(abs).filter(Boolean) || null;

    cache.set(parsed.href, { at: Date.now(), data: result });
    return NextResponse.json(result);

  } catch (err) {
    const fallback = { title: null, image: null, images: null, video: null, embed: null, error: "Preview unavailable" };
    cache.set(parsed.href, { at: Date.now(), data: fallback });
    return NextResponse.json(fallback);
  }
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}
