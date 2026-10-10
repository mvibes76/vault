export const CAPTURE_LIMIT = 300;
export function cleanMediaUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    if (!["https:","http:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}
export function normalizeCapture(payload) {
  const seen = new Set(), items = [];
  for (const raw of (Array.isArray(payload?.items) ? payload.items : [])) {
    const url = cleanMediaUrl(raw?.url);
    if (!url || seen.has(url) || !["image","video"].includes(raw?.type)) continue;
    seen.add(url);
    items.push({
      url, type: raw.type,
      title: String(raw.title || "").trim().slice(0,180) || (raw.type === "image" ? "Captured image" : "Captured video"),
      thumbnail: cleanMediaUrl(raw.thumbnail) || (raw.type === "image" ? url : ""),
      sourcePage: cleanMediaUrl(raw.sourcePage) || url,
    });
    if (items.length >= CAPTURE_LIMIT) break;
  }
  return items;
}
export function captureKey(url) {
  let hash = 0;
  for (let i=0;i<url.length;i++) { hash = (hash << 5) - hash + url.charCodeAt(i); hash |= 0; }
  return "k" + Math.abs(hash);
}
