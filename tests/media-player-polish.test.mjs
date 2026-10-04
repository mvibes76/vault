import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const read = (path) => fs.readFileSync(path, "utf8");
const preview = await import(pathToFileURL(process.cwd() + "/lib/media-preview.js").href);

test("image items always expose their own URL as a display preview", () => {
  const item = { key:"img-1", title:"Launch Poster", url:"https://example.com/launch-poster.jpg", type:"image" };
  const resolved = preview.resolveMediaPreview(item, [item], []);
  assert.equal(resolved.display_thumbnail, item.url);
  assert.equal(resolved.display_thumbnail_source, "image_source");
});

test("same-name saved image can supply a display-only preview without rewriting the item thumbnail", () => {
  const video = { key:"vid-1", title:"Summer Campaign", url:"https://example.com/video.mp4", type:"video", folder:"Ideas" };
  const image = { key:"img-1", title:"Summer Campaign Cover.jpg", url:"https://example.com/poster.jpg", type:"image", folder:"Ideas" };
  const resolved = preview.resolveMediaPreview(video, [video,image], []);
  assert.equal(resolved.display_thumbnail, image.url);
  assert.equal(resolved.display_thumbnail_source, "named_image");
  assert.equal(resolved.thumbnail, undefined);
});

test("manual thumbnails still win over automatic matching", () => {
  const video = { key:"vid-1", title:"Summer Campaign", url:"https://example.com/video.mp4", type:"video", thumbnail:"https://example.com/manual.jpg", thumbnail_source:"manual", cover_mode:"manual" };
  const image = { key:"img-1", title:"Summer Campaign", url:"https://example.com/other.jpg", type:"image" };
  const resolved = preview.resolveMediaPreview(video, [video,image], []);
  assert.equal(resolved.display_thumbnail, video.thumbnail);
  assert.equal(resolved.display_thumbnail_source, "manual");
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
