import { NextResponse } from "next/server";
import { safeFetch, validatePublicUrl } from "@/lib/server/safe-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

// External media proxy for thumbnails and scraped images only.
// Fixes hotlink/referrer/CORS issues from Reddit and similar sites.
// Non-image content types are rejected to prevent accidental video proxying
// through Vercel functions (which burns bandwidth and hits function limits).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const checked = await validatePublicUrl(rawUrl);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  const target = checked.url;

  try {
    const res = await safeFetch(target.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Media fetch failed (${res.status})`);

    const contentType = res.headers.get("content-type") || "application/octet-stream";

    // Hard reject anything that is not a safe raster image — no video, no audio, no SVG, no binary blobs.
    if (contentType.includes("svg")) {
      return NextResponse.json({ error: "SVG proxying is not supported." }, { status: 415 });
    }

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image proxying is supported." },
        { status: 415 }
      );
    }

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image exceeds 20 MB proxy limit." }, { status: 413 });
    }

    const out = new Headers();
    ["content-type", "content-length", "etag", "last-modified"].forEach((key) => {
      const value = res.headers.get(key);
      if (value) out.set(key, value);
    });
    out.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    out.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(res.body, { status: 200, headers: out });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
