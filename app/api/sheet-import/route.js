import { NextResponse } from "next/server";

function itemKey(url) {
  let h = 0;
  const s = String(url || "");
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return `k${Math.abs(h)}`;
}

function normalizeUrl(value) {
  const raw = String(value || "").trim().replace(/^"|"$/g, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(www\.|drive\.google\.com|youtu\.be|youtube\.com|vimeo\.com)/i.test(raw)) return `https://${raw}`;
  return "";
}

function parseCSV(csv) {
  const rows = [];
  let row = [], cur = "", inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    const next = csv[i + 1];
    if (ch === '"' && inQuotes && next === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { row.push(cur); cur = ""; continue; }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = ""; continue;
    }
    cur += ch;
  }
  row.push(cur); rows.push(row);
  return rows.filter((r) => r.some((c) => String(c || "").trim()));
}

function headerIndex(headers, aliases) {
  return headers.findIndex((h) => aliases.includes(h));
}

function parseSheetRows(csv, tabName) {
  const rows = parseCSV(csv);
  if (rows.length < 2) return { items: [], skipped: 0 };
  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase().replace(/\s+/g, "_"));
  const urlIdx = headerIndex(headers, ["url", "link", "file", "file_url", "drive_link", "gdrive", "google_drive", "source_url"]);
  const titleIdx = headerIndex(headers, ["title", "name", "label", "file_name"]);
  const folderIdx = headerIndex(headers, ["folder", "tab", "category", "collection", "section"]);
  const tagsIdx = headerIndex(headers, ["tags", "tag", "keywords"]);
  const noteIdx = headerIndex(headers, ["note", "notes", "description", "desc", "caption", "comment"]);
  const typeIdx = headerIndex(headers, ["type", "media_type"]);
  const sourceIdx = headerIndex(headers, ["source", "platform", "provider"]);
  const thumbIdx = headerIndex(headers, ["thumbnail", "thumb", "image", "poster"]);

  if (urlIdx < 0) return { items: [], skipped: Math.max(0, rows.length - 1), warning: `No URL column found on ${tabName}.` };

  const items = [];
  let skipped = 0;
  const clean = (row, idx) => idx >= 0 ? String(row[idx] || "").trim() : "";

  for (const row of rows.slice(1)) {
    const url = normalizeUrl(clean(row, urlIdx));
    if (!url) { skipped++; continue; }
    const title = clean(row, titleIdx) || url;
    const folder = clean(row, folderIdx) || tabName;
    const tags = clean(row, tagsIdx).split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    items.push({
      key: itemKey(url),
      id: `${tabName}-${itemKey(url)}`,
      url,
      title,
      folder: folder === "Vault Library" || folder === "Vault Import" ? null : folder,
      tags,
      note: clean(row, noteIdx),
      type: clean(row, typeIdx) || "link",
      source: clean(row, sourceIdx) || undefined,
      thumbnail: clean(row, thumbIdx),
      thumbnail_source: clean(row, thumbIdx) ? "sheet" : null,
      importedFrom: tabName,
      addedAt: new Date().toISOString(),
      isVaultItem: true,
    });
  }
  return { items, skipped };
}

async function fetchTab(sheetId, tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch tab "${tabName}" (${res.status}). Share the sheet as Anyone with link can view.`);
  const text = await res.text();
  if (text.trim().startsWith("<!")) throw new Error(`Tab "${tabName}" is not public or does not exist.`);
  return text;
}

export async function POST(request) {
  try {
    const { sheetId, tabNames = [] } = await request.json();
    if (!sheetId) return NextResponse.json({ error: "Missing sheetId" }, { status: 400 });
    const tabs = Array.isArray(tabNames) && tabNames.length ? tabNames : ["Vault Import", "Vault Library"];
    const all = [];
    const errors = [];
    let skipped = 0;

    for (const tabName of tabs) {
      try {
        const csv = await fetchTab(sheetId, tabName);
        const parsed = parseSheetRows(csv, tabName);
        all.push(...parsed.items);
        skipped += parsed.skipped || 0;
        if (parsed.warning) errors.push(parsed.warning);
      } catch (e) {
        errors.push(e.message);
      }
    }

    const byKey = new Map();
    all.forEach((item) => byKey.set(item.key, item));
    return NextResponse.json({ items: [...byKey.values()], skipped, errors });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Sheet import failed." }, { status: 500 });
  }
}
