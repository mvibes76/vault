import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("Vault V2 exposes the locked desktop and mobile navigation", () => {
  const source = read("components/vault-v2/VaultV2.jsx");
  for (const label of ["Home","Library","Inbox","Collections","Search","Settings"]) {
    assert.match(source, new RegExp('"' + label + '"'));
  }
  assert.match(source, /const MOBILE_NAV = \[[\s\S]*"Home"[\s\S]*"Library"[\s\S]*"Add"[\s\S]*"Collections"[\s\S]*"Search"/);
  assert.doesNotMatch(source, /"Favorites".*"Continue".*"Rated"/s);
});

test("primary App Router destinations exist and remain feature gated", () => {
  for (const route of ["library","inbox","collections","search","settings"]) {
    assert.equal(fs.existsSync("app/" + route + "/page.jsx"), true, route);
  }
  const gate = read("components/VaultExperience.jsx");
  assert.match(gate, /NEXT_PUBLIC_VAULT_UI_V2/);
  assert.match(gate, /redirect\("\/"\)/);
});

test("Home implements the locked priority shelves", () => {
  const source = read("components/vault-v2/VaultV2.jsx");
  const order = ["Continue","Recently Saved","Inbox","Recent Collections","Top Rated"].map((x) => source.indexOf(x));
  assert.ok(order.every((i) => i >= 0), "all locked Home sections must exist");
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], "Home sections should preserve priority order");
});

test("library performance guard uses 200ms search debounce and 60 item batches", () => {
  const source = read("components/vault-v2/VaultV2.jsx");
  assert.match(source, /setTimeout\(\(\) => setDebouncedQuery\(query\), 200\)/);
  assert.match(source, /useState\(60\)/);
  assert.match(source, /slice\(0, visibleLimit\)/);
  assert.match(source, /setVisibleLimit\(\(n\)=>n\+60\)/);
  const card = read("components/vault-v2/MediaCard.jsx");
  assert.match(card, /loading="lazy"/);
  assert.match(card, /decoding="async"/);
});

test("accessibility primitives are present on cards, dialogs, filters and reduced motion", () => {
  const card = read("components/vault-v2/MediaCard.jsx");
  assert.match(card, /aria-label=/);
  const add = read("components/vault-v2/AddMediaSheet.jsx");
  assert.match(add, /role="dialog"/);
  assert.match(add, /aria-modal="true"/);
  assert.match(add, /event\.key === "Escape"/);
  const detail = read("components/vault-v2/DetailDrawer.jsx");
  assert.match(detail, /role="dialog"/);
  assert.match(detail, /role="tablist"/);
  assert.match(detail, /Rate .* out of 5/);
  const css = read("app/vault-v2.css");
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /min-height:44px/);
  const layout = read("app/layout.jsx");
  assert.doesNotMatch(layout, /userScalable\s*:\s*false/);
  assert.doesNotMatch(layout, /maximumScale\s*:\s*1/);
});

test("sync, offline, loading, empty and error states remain visible", () => {
  const source = read("components/vault-v2/VaultV2.jsx");
  assert.match(source, /<SyncStatus/);
  assert.match(source, /Offline · changes will stay pending/);
  assert.match(source, /LoadingGrid/);
  assert.match(source, /EmptyState/);
  assert.match(source, /role="alert"/);
});

test("legacy V11 surfaces are archived outside runtime", () => {
  for (const name of ["HomeView","BrowseView","DetailPanel","CardMenu","VaultXR"]) {
    assert.equal(fs.existsSync("components/" + name + ".jsx"), false, name + " runtime copy");
    assert.equal(fs.existsSync("docs/history/v11-source/" + name + ".jsx"), true, name + " archive copy");
  }
});

test("V2 avoids prompt/confirm browser chrome", () => {
  for (const path of ["components/vault-v2/VaultV2.jsx","components/vault-v2/DetailDrawer.jsx","components/vault-v2/AddMediaSheet.jsx"]) {
    const source = read(path);
    assert.doesNotMatch(source, /window\.prompt|window\.confirm/);
  }
});
