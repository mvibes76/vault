import { NextResponse } from "next/server";

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const result = { title: null, image: null, images: null, video: null, description: null, embed: null };

    // ── Reddit ──────────────────────────────────────────────────────────────
    if (url.includes("reddit.com")) {
      const jsonUrl = url.replace(/\/?$/, "") + ".json";
      const r = await fetch(jsonUrl, { headers: { "User-Agent": "MediaVault/1.0" } });
      if (r.ok) {
        const j = await r.json();
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
        cache.set(url, { at: Date.now(), data: result });
        return NextResponse.json(result);
      }
    }

    // ── Instagram ────────────────────────────────────────────────────────────
    // Server-side scraping is blocked by Instagram. Use their public embed endpoint.
    if (url.includes("instagram.com")) {
      const sc = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)?.[1];
      if (sc) {
        result.embed = `https://www.instagram.com/p/${sc}/embed/`;
        result.title = "Instagram Post";
      }
      cache.set(url, { at: Date.now(), data: result });
      return NextResponse.json(result);
    }

    // ── TikTok ───────────────────────────────────────────────────────────────
    if (url.includes("tiktok.com")) {
      try {
        const oe = await fetch(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
          { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
        );
        if (oe.ok) {
          const d = await oe.json();
          result.title       = d.title || null;
          result.image       = d.thumbnail_url || null;
          result.description = d.author_name ? `@${d.author_name}` : null;
          if (d.html) {
            const srcMatch = d.html.match(/src="([^"]+)"/);
            if (srcMatch) result.embed = decodeEntities(srcMatch[1]);
          }
        }
      } catch {}
      cache.set(url, { at: Date.now(), data: result });
      return NextResponse.json(result);
    }

    // ── Generic OG scraping ──────────────────────────────────────────────────
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const html = (await res.text()).slice(0, 300000);

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
    if (allImages.length >= 3) result.images = allImages.slice(0, 40);

    // Resolve relative URLs
    const base = new URL(url);
    const abs = (u) => { if (!u) return null; try { return new URL(u, base).href; } catch { return u; } };
    result.image  = abs(result.image);
    result.video  = abs(result.video);
    result.images = result.images?.map(abs).filter(Boolean) || null;

    cache.set(url, { at: Date.now(), data: result });
    return NextResponse.json(result);

  } catch (err) {
    const fallback = { title: null, image: null, images: null, video: null, embed: null, error: err.message };
    cache.set(url, { at: Date.now(), data: fallback });
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
