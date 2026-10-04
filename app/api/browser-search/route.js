import { NextResponse } from "next/server";
import { safeFetch, readTextLimited } from "@/lib/server/safe-url";
import { guardProxyRequest, securityErrorResponse } from "@/lib/server/proxy-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DDG_HTML = "https://duckduckgo.com/html/";
const DDG_LITE = "https://lite.duckduckgo.com/lite/";
const BING_HTML = "https://www.bing.com/search";
const BING_RSS = "https://www.bing.com/search";
const WIKIPEDIA_OPEN = "https://en.wikipedia.org/w/api.php";
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

function parseBingResults(html) {
  const out = [];
  const blockRe = /<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let blockMatch;
  while ((blockMatch = blockRe.exec(html))) {
    const block = blockMatch[1];
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const url = decodeEntities(linkMatch[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const title = stripTags(linkMatch[2]);
    if (!title || out.some((r) => r.url === url)) continue;
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
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

function parseBingRss(xml) {
  const out = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(xml))) {
    const block = match[1];
    const title = stripTags(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const url = decodeEntities(stripTags(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || ""));
    const snippet = stripTags(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "");
    if (!title || !/^https?:\/\//i.test(url) || out.some((r) => r.url === url)) continue;
    out.push({ title, url, snippet, host: hostOf(url) });
    if (out.length >= 12) break;
  }
  return out;
}

async function searchWikipedia(q) {
  const url = new URL(WIKIPEDIA_OPEN);
  url.searchParams.set("action", "opensearch");
  url.searchParams.set("search", q);
  url.searchParams.set("limit", "10");
  url.searchParams.set("namespace", "0");
  url.searchParams.set("format", "json");

  const upstream = await safeFetch(url.toString(), {
    method: "GET",
    timeoutMs: 7000,
    maxBytes: 300_000,
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0 (compatible; VaultSearch/2.0)",
    },
  });
  if (!upstream.ok) throw new Error(`Wikipedia returned ${upstream.status}`);
  const text = await readTextLimited(upstream, 300_000);
  const data = JSON.parse(text);
  const titles = Array.isArray(data?.[1]) ? data[1] : [];
  const descriptions = Array.isArray(data?.[2]) ? data[2] : [];
  const urls = Array.isArray(data?.[3]) ? data[3] : [];
  return urls.slice(0, 10).map((url, index) => ({
    title: titles[index] || hostOf(url) || url,
    url,
    snippet: descriptions[index] || "",
    host: hostOf(url),
  })).filter((result) => /^https?:\/\//i.test(result.url));
}

async function searchProvider(baseUrl, q, parser, extraParams = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set("q", q);
  if (url.hostname.includes("duckduckgo.com")) url.searchParams.set("kl", "us-en");
  if (url.hostname.includes("bing.com")) {
    url.searchParams.set("setlang", "en-us");
    url.searchParams.set("cc", "us");
  }
  Object.entries(extraParams).forEach(([key, value]) => url.searchParams.set(key, value));

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
  const results = parser(html);
  if (process.env.VERCEL_ENV === "preview") {
    console.info(`[vault-search] provider=${url.hostname}${url.pathname} status=${upstream.status} contentType=${upstream.headers.get("content-type") || ""} parsed=${results.length}`);
  }
  return results;
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
    { provider: "bing-rss", url: BING_RSS, parser: parseBingRss, params: { format: "rss" } },
    { provider: "bing-html", url: BING_HTML, parser: parseBingResults },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const results = await searchProvider(attempt.url, q, attempt.parser, attempt.params || {});
      if (results.length) {
        return NextResponse.json({ query: q, locale: "us-en", provider: attempt.provider, results });
      }
      lastError = new Error("Search provider returned no parseable results");
    } catch (error) {
      lastError = error;
    }
  }

  try {
    const results = await searchWikipedia(q);
    if (process.env.VERCEL_ENV === "preview") {
      console.info(`[vault-search] provider=wikipedia-opensearch status=200 parsed=${results.length}`);
    }
    if (results.length) {
      return NextResponse.json({ query: q, locale: "us-en", provider: "wikipedia-opensearch", scope: "knowledge", results });
    }
  } catch (error) {
    lastError = error;
  }

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  return NextResponse.json({
    query: q,
    locale: "us-en",
    provider: "external-fallback",
    scope: "search-link",
    warning: "Web providers are temporarily unavailable. Open the search externally or save the search URL.",
    results: [{
      title: `Search Google for “${q}”`,
      url: googleUrl,
      snippet: "Open this search in your browser. Vault does not proxy or scrape Google results.",
      host: "google.com",
    }],
  });

}
