import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("preview resolver gives image items their own URL and supports exact-name image matching", () => {
  const source = read("lib/media-preview.js");
  assert.match(source, /isImageItem\(item\)/);
  assert.match(source, /display_thumbnail:\s*item\.thumbnail \|\| item\.url/);
  assert.match(source, /display_thumbnail_source:\s*item\.thumbnail \? \(item\.thumbnail_source \|\| "item"\) : "image_source"/);
  assert.match(source, /normalizedMediaName/);
  assert.match(source, /wanted\.has\(name\)/);
  assert.match(source, /otherFolder === folder/);
  assert.match(source, /display_thumbnail_source:\s*"named_image"/);
});

test("manual and Cover Library previews take precedence before provider/name matching", () => {
  const source = read("lib/media-preview.js");
  const manualAt = source.indexOf('mode === "manual"');
  const coverAt = source.indexOf('matchesCoverRule(item, entry)');
  const providerAt = source.indexOf('getThumbCandidates(item.url || "")[0]');
  const namedAt = source.indexOf('findNamedImagePreview(item, items)');
  assert.ok(manualAt >= 0 && coverAt > manualAt && providerAt > coverAt && namedAt > providerAt);
  assert.match(source, /display_thumbnail_source:\s*"cover_library"/);
});

test("integrated player keeps relay status transient and image loading proxied", () => {
  const source = read("components/Player.jsx");
  assert.match(source, /variant = "legacy"/);
  assert.match(source, /variant === "integrated"/);
  assert.match(source, /setTimeout\(\(\) => setRelayReason\(""\), timeoutMs\)/);
  assert.match(source, /showRelayNotice\("Direct playback was blocked\. Secure relay enabled\."\)/);
  assert.match(source, /proxiedMediaUrl\(embed\.src\)/);
  assert.match(source, /videoWidth === 0 && current\.videoHeight === 0/);
  assert.match(source, /integratedPlayerSurface/);
});

test("relay normalizes generic content types and preserves media range semantics", () => {
  const source = read("app/api/stream/route.js");
  assert.match(source, /normalizeMediaContentType/);
  assert.match(source, /\["\.mp4", "video\/mp4"\]/);
  assert.match(source, /\["\.mov", "video\/quicktime"\]/);
  assert.match(source, /out\.set\("Content-Disposition", "inline"\)/);
  assert.match(source, /out\.set\("Vary", "Range, Accept"\)/);
  assert.match(source, /upstream\.status === 206 && !out\.has\("Accept-Ranges"\)/);
  assert.match(source, /X-Vault-Relay/);
});

test("player-created Moment Marks trigger detail refresh", () => {
  const vault = read("components/vault-v2/VaultV2.jsx");
  const detail = read("components/vault-v2/DetailDrawer.jsx");
  assert.match(vault, /setActivityRevision\(\(n\)=>n\+1\)/);
  assert.match(vault, /activityRevision=\{activityRevision\}/);
  assert.match(detail, /\[item, userId, activityRevision\]/);
  assert.doesNotMatch(detail, /Add mark<\/button>/);
});

test("V2 reloads existing Cover Library rules for automatic display previews", () => {
  const vault = read("components/vault-v2/VaultV2.jsx");
  assert.match(vault, /getCoverLibrary/);
  assert.match(vault, /resolveMediaPreviews\(items, coverLibrary\)/);
});
