import { getSource, getSourceMeta, isPlayable } from "./sources";

// Stable key for supabase user_data rows
export const itemKey = (url) => {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h << 5) - h + url.charCodeAt(i);
    h |= 0;
  }
  return `k${Math.abs(h)}`;
};

export const extractSheetId = (val) => {
  const realMatch = val.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
  if (realMatch) return realMatch[1];
  const trimmed = val.trim();
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return trimmed;
};

// Re-export source helpers so existing imports work
export { getSource, getSourceMeta, isPlayable };

export const sourceIdOf = (url) => getSourceMeta(url).id;
export const sourceNameOf = (url) => getSourceMeta(url).name;
export const sourceColorOf = (url) => getSourceMeta(url).color;

export const proxiedMediaUrl = (url) => {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return `/api/media?url=${encodeURIComponent(url)}`;
};

export const proxiedStreamUrl = (url) => {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return `/api/stream?url=${encodeURIComponent(url)}`;
};

export const normalizeDriveImageUrl = (url, size = 1600) => {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  const match = raw.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([a-zA-Z0-9_-]{20,})/);
  if (!match) return raw;
  return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w${size}`;
};

export const normalizeCoverUrl = (url) => normalizeDriveImageUrl(url);

export const splitKeywords = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  return String(value || "").split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
};

export const matchesCoverRule = (item, cover) => {
  if (!item || !cover || cover.enabled === false) return false;
  const keywords = splitKeywords(cover.keywords?.length ? cover.keywords : cover.label).map((k) => k.toLowerCase());
  if (!keywords.length) return false;
  const tags = Array.isArray(item.tags) ? item.tags.map((t) => String(t || "").toLowerCase()) : [];
  const title = String(item.title || "").toLowerCase();
  const note = String(item.note || "").toLowerCase();
  const url = String(item.url || "").toLowerCase();
  const folder = String(item.folder || item.tab || "").toLowerCase();
  const source = String(item.source || sourceIdOf(item.url || "") || "").toLowerCase();
  const anyText = [title, note, url, folder, source, tags.join(" ")].join(" ");
  const type = String(cover.match_type || "any").toLowerCase();
  return keywords.some((kw) => {
    if (!kw) return false;
    if (type === "tag") return tags.some((t) => t === kw || t.includes(kw));
    if (type === "title") return title.includes(kw);
    if (type === "folder") return folder === kw || folder.includes(kw);
    if (type === "source") return source === kw || source.includes(kw);
    if (type === "url") return url.includes(kw);
    return anyText.includes(kw);
  });
};

// ─── Sheet CSV parsing ───────────────────────────────────────────────────────

const parseSheetCSV = (csv, tabName) => {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));

  const urlIdx   = headers.findIndex((h) => ["url","link","src","source"].includes(h));
  const titleIdx = headers.findIndex((h) => ["title","name","label"].includes(h));
  const noteIdx  = headers.findIndex((h) => ["note","notes","description","desc"].includes(h));
  const tagsIdx  = headers.findIndex((h) => ["tags","tag","category","categories"].includes(h));

  if (urlIdx === -1) return [];

  return lines
    .slice(1)
    .map((line, i) => {
      const cols = [];
      let cur = "", inQ = false;
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
        else { cur += ch; }
      }
      cols.push(cur);

      const clean = (idx) => idx >= 0 ? (cols[idx] || "").trim().replace(/^"|"$/g, "") : "";

      const url = clean(urlIdx);
      if (!url || !url.startsWith("http")) return null;
      // Vault is video-only. Silently drop rows pointing at non-playable URLs.
      if (!isPlayable(url)) return null;

      const tags = clean(tagsIdx)
        .split(/[,;]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const title = clean(titleIdx) || url;
      const source = sourceIdOf(url);

      return {
        id: `${tabName}-${i}`,
        key: itemKey(url),
        url, title,
        note: clean(noteIdx),
        tags,
        source,
        tab: tabName,
      };
    })
    .filter(Boolean);
};

export const fetchTabData = async (sheetId, tabName) => {
  const res = await fetch(`/api/sheet?id=${encodeURIComponent(sheetId)}&tab=${encodeURIComponent(tabName)}`);
  if (!res.ok) return [];
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("json")) return [];
  const csv = await res.text();
  return parseSheetCSV(csv, tabName);
};
