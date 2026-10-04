import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("detail view supports previous/next navigation, swipe, keyboard arrows and visible delete", () => {
  const source = read("components/vault-v2/DetailDrawer.jsx");
  assert.match(source, /currentIndex = -1, totalItems = 0/);
  assert.match(source, /Previous media/);
  assert.match(source, /Next media/);
  assert.match(source, /event\.key === "ArrowLeft"/);
  assert.match(source, /event\.key === "ArrowRight"/);
  assert.match(source, /Math\.abs\(dx\) < 72/);
  assert.match(source, /aria-label="Delete media"/);
  assert.match(source, /Delete “\{item\.title/);
});

test("detail preview has metadata, proxy and direct-image fallback paths", () => {
  const source = read("components/vault-v2/DetailDrawer.jsx");
  assert.match(source, /\/api\/metadata\?url=/);
  assert.match(source, /proxiedMediaUrl\(url\)/);
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.match(source, /onError=\{\(\) => setIdx/);
  assert.match(source, /Preview unavailable/);
});

test("Vault passes a route-aware browsing context into detail", () => {
  const source = read("components/vault-v2/VaultV2.jsx");
  assert.match(source, /const detailContextItems = useMemo/);
  assert.match(source, /if \(route === "inbox"\) return inboxItems/);
  assert.match(source, /route === "collections" && selectedCollection/);
  assert.match(source, /currentIndex=\{detailIndex\}/);
  assert.match(source, /totalItems=\{detailContextItems\.length\}/);
  assert.match(source, /onNavigate=\{\(idx\)=>/);
});

test("player adapts direct media and Shorts to portrait layouts", () => {
  const source = read("components/Player.jsx");
  assert.match(source, /const \[mediaOrientation, setMediaOrientation\] = useState\("wide"\)/);
  assert.match(source, /ratio < 0\.86 \? "portrait"/);
  assert.ok(source.includes('youtube\\.com\\/shorts\\//i.test'));
  assert.match(source, /mediaShell\(isFullscreen, mediaOrientation\)/);
  assert.match(source, /orientation === "portrait"/);
});

test("Search exposes the protected external browser flow", () => {
  const vault = read("components/vault-v2/VaultV2.jsx");
  const browser = read("components/InAppBrowser.jsx");
  const route = read("app/api/browser-search/route.js");
  assert.match(vault, /Search outside Vault/);
  assert.match(vault, /<InAppBrowser/);
  assert.match(vault, /initialQuery=\{query\}/);
  assert.match(browser, /\/api\/browser-search\?q=/);
  assert.match(browser, /initialQuery = ""/);
  assert.match(route, /guardProxyRequest\(req, "search"\)/);
  assert.match(route, /searchProvider\\(attempt\\.url, q, attempt\\.parser, attempt\\.params \\|\\| \\{\\}\\)/);
  assert.match(route, /duckduckgo-html/);
  assert.match(route, /duckduckgo-lite/);
  assert.match(route, /bing-html/);
  assert.match(route, /parseBingResults/);
  assert.match(route, /method:\s*"GET"/);
  assert.doesNotMatch(route, /method:\s*"POST"/);
  assert.doesNotMatch(route, /fetch\(DDG_HTML/);
});


test("mobile form controls stay at 16px to prevent iOS focus zoom", () => {
  const css = read("app/vault-v2.css");
  assert.match(css, /@media \(max-width:899px\)\{[\s\S]*input,select,textarea\{font-size:16px!important\}/);
});


test("web search always has machine-readable and graceful fallbacks", () => {
  const route = read("app/api/browser-search/route.js");
  assert.match(route, /bing-rss/);
  assert.match(route, /wikipedia-opensearch/);
  assert.match(route, /Search Google for/);
  assert.match(route, /Web providers are temporarily unavailable/);
  assert.doesNotMatch(route, /return NextResponse\.json\([\s\S]*Search provider temporarily unavailable/);
});

test("mobile in-app browser collapses quick save while keyboard is open", () => {
  const source = read("components/InAppBrowser.jsx");
  assert.match(source, /visualViewport/);
  assert.match(source, /setKeyboardOpen/);
  assert.match(source, /keyboardOpen && isMobile \? "none" : "block"/);
  assert.match(source, /fontSize: 16/);
});
