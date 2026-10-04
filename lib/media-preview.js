import { getSourceMeta, getThumbCandidates } from "./sources";
import { matchesCoverRule } from "./utils";

const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:\?|$)/i;
const TRAILING_ART_WORDS = /\b(?:cover|thumb|thumbnail|poster|preview|image|photo|artwork|still)\b/g;

export function isImageItem(item) {
  const type = String(item?.type || "").toLowerCase();
  const source = getSourceMeta(item?.url || "").id;
  return type.includes("image") || source === "image" || IMAGE_EXT_RE.test(String(item?.url || ""));
}

export function normalizedMediaName(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      raw = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    }
  } catch {}
  return raw
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(TRAILING_ART_WORDS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function candidateNames(item) {
  return [...new Set([
    normalizedMediaName(item?.title),
    normalizedMediaName(item?.url),
  ].filter(Boolean))];
}

export function findNamedImagePreview(item, items = []) {
  if (!item || isImageItem(item)) return null;
  const wanted = new Set(candidateNames(item));
  if (!wanted.size) return null;
  const folder = String(item.folder || "").trim().toLowerCase();

  const candidates = items
    .filter((other) => other?.key !== item.key && isImageItem(other))
    .map((other) => {
      const names = candidateNames(other);
      const exact = names.some((name) => wanted.has(name));
      if (!exact) return null;
      const otherFolder = String(other.folder || "").trim().toLowerCase();
      return {
        item: other,
        score: folder && otherFolder === folder ? 2 : 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const match = candidates[0]?.item;
  return match ? (match.thumbnail || match.url || null) : null;
}

export function resolveMediaPreview(item, items = [], coverLibrary = []) {
  if (!item) return item;
  if (isImageItem(item)) {
    return {
      ...item,
      display_thumbnail: item.thumbnail || item.url || "",
      display_thumbnail_source: item.thumbnail ? (item.thumbnail_source || "item") : "image_source",
    };
  }

  const mode = item.cover_mode || (item.thumbnail_source === "manual" || item.thumbnail_source === "sheet" ? "manual" : "auto");

  if (mode === "manual" || item.thumbnail_source === "manual" || item.thumbnail_source === "sheet") {
    return { ...item, display_thumbnail: item.thumbnail || "", display_thumbnail_source: item.thumbnail_source || "manual" };
  }

  if (mode !== "original") {
    const cover = [...coverLibrary]
      .filter((entry) => entry?.enabled !== false && entry?.thumbnail)
      .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100))
      .find((entry) => matchesCoverRule(item, entry));
    if (cover?.thumbnail) {
      return { ...item, display_thumbnail: cover.thumbnail, display_thumbnail_source: "cover_library", cover_label: cover.label };
    }
  }

  if (item.thumbnail) {
    return { ...item, display_thumbnail: item.thumbnail, display_thumbnail_source: item.thumbnail_source || "item" };
  }

  const providerPreview = getThumbCandidates(item.url || "")[0];
  if (providerPreview) {
    return { ...item, display_thumbnail: providerPreview, display_thumbnail_source: "provider" };
  }

  const namedImage = findNamedImagePreview(item, items);
  if (namedImage) {
    return { ...item, display_thumbnail: namedImage, display_thumbnail_source: "named_image" };
  }

  return { ...item, display_thumbnail: "", display_thumbnail_source: null };
}

export function resolveMediaPreviews(items = [], coverLibrary = []) {
  return items.map((item) => resolveMediaPreview(item, items, coverLibrary));
}
