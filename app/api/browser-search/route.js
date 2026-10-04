import { NextResponse } from "next/server";
import { safeFetch, readTextLimited } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DDG_HTML = "https://duckduckgo.com/html/";
const DDG_LITE = "https://lite.duckduckgo.com/lite/";
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

function parseLiteResults(html) {
  const out = [];
  const linkRe = /<a[^>]+class=["'][^"']*result-link[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRe.exec(html))) {
    const url = cleanDuckUrl(match[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const title = stripTags(match[2]);
    if (!title || out.some((r) => r.url === url)) continue;

    const tail = html.slice(match.index + match[0].length, match.index + match[0].length + 1800);
    const snippetMatch = tail.match(/<(?:td|div)[^>]+class=["'][^"']*result-snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:td|div)>/i);
    out.push({
      title,
      url,
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
      host: hostOf(url),
    });
    if (out.length >= 12) break;
  }
  return out;
}

async function searchProvider(baseUrl, q, parser) {
  const url = new URL(baseUrl);
  url.searchParams.set("q", q);
  url.searchParams.set("kl", "us-en");

  const upstream = await safeFetch(url.toString(), {
    method: "GET",
    timeoutMs: 7000,
    maxBytes: MAX_SEARCH_HTML_BYTES,
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    },
  });
  if (!upstream.ok) throw new Error(`Search provider returned ${upstream.status}`);
  const html = await readTextLimited(upstream, MAX_SEARCH_HTML_BYTES);
  return parser(html);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ results: [] });
  if (q.length > 180) return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  try { await guardProxyRequest(req, "search"); }
  catch (error) { return securityErrorResponse(error, "Search unavailable"); }

  const attempts = [
    { provider: "duckduckgo-html", url: DDG_HTML, parser: parseResults },
    { provider: "duckduckgo-lite", url: DDG_LITE, parser: parseLiteResults },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const results = await searchProvider(attempt.url, q, attempt.parser);
      if (results.length) {
        return NextResponse.json({ query: q, locale: "us-en", provider: attempt.provider, results });
      }
      lastError = new Error("Search provider returned no parseable results");
    } catch (error) {
      lastError = error;
    }
  }

  const response = securityErrorResponse(lastError, "Search provider temporarily unavailable");
  const data = await response.json();
  return NextResponse.json(
    { ...data, results: [], retryable: true },
    { status: response.status, headers: response.headers }
  );
}
