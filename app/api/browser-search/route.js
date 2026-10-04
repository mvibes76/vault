import { NextResponse } from "next/server";
import { safeFetch, readTextLimited } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DDG_HTML = "https://html.duckduckgo.com/html/";
const MAX_SEARCH_HTML_BYTES = 1_000_000;

function decodeEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value = "") {
  return decodeEntities(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function cleanDuckUrl(href = "") {
  const decoded = decodeEntities(href);
  try {
    const u = new URL(decoded, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {}
  return decoded;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function parseResults(html) {
  const out = [];
  const blockRe = /<div class="result[\s\S]*?<\/div>\s*<\/div>/gi;
  const blocks = html.match(blockRe) || [];
  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const url = cleanDuckUrl(linkMatch[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const title = stripTags(linkMatch[2]);
    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";
    const host = hostOf(url);
    if (!title || out.some((r) => r.url === url)) continue;
    out.push({ title, url, snippet, host });
    if (out.length >= 12) break;
  }
  return out;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ results: [] });
  if (q.length > 180) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  try { await guardProxyRequest(req, "search"); }
  catch (error) { return securityErrorResponse(error, "Search unavailable"); }

  try {
    const body = new URLSearchParams({
      q,
      kl: "us-en",
      kad: "en_US",
      k1: "-1",
    });
    const upstream = await safeFetch(DDG_HTML, {
      method: "POST",
      body: body.toString(),
      timeoutMs: 7000,
      maxBytes: MAX_SEARCH_HTML_BYTES,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; VideoVaultSearch/1.0)",
      },
    });
    if (!upstream.ok) throw new Error("Search provider unavailable");
    const html = await readTextLimited(upstream, MAX_SEARCH_HTML_BYTES);
    const results = parseResults(html);
    return NextResponse.json({ query: q, locale: "us-en", results });
  } catch (error) {
    const response = securityErrorResponse(error, "Search failed");
    const data = await response.json();
    return NextResponse.json({ ...data, results: [] }, { status: response.status, headers: response.headers });
  }
}
