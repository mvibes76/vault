"use client";
import { useState } from "react";
import { getGDriveFolderId, detectType, itemKey } from "@/lib/utils";
import Icon from "./Icons";
import { T } from "@/lib/theme";

const guessType = (name) => {
  const n = name.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(n)) return "image";
  if (/\.(mp4|mov|webm|m4v)$/.test(n))           return "video";
  if (/\.(mp3|flac|m4a|wav|aac|opus)$/.test(n))  return "audio";
  return "file";
};

const typeIcon = { image:"image", video:"video", audio:"headphones", file:"document" };

const COLOR = { image:"rgba(235,235,245,0.35)", video:"rgba(235,235,245,0.35)", audio:"rgba(235,235,245,0.35)", file:"rgba(235,235,245,0.2)" };

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes > 1e9) return `${(bytes/1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes/1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes/1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function DriveBrowser({ onOpenItem, mobile = false, onOpenMenu }) {
  const [folderInput, setFolderInput] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("name"); // "name" | "type" | "size"
  const [sortDir, setSortDir] = useState(1); // 1 asc, -1 desc

  const loadFolder = async (folderId, name = "Drive") => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/drive?id=${encodeURIComponent(folderId)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setFiles(json.files || []);
      const existing = breadcrumbs.findIndex((b) => b.id === folderId);
      if (existing >= 0) setBreadcrumbs(breadcrumbs.slice(0, existing + 1));
      else setBreadcrumbs([...breadcrumbs, { id: folderId, name }]);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleLoad = () => {
    const id = getGDriveFolderId(folderInput) || folderInput.trim();
    if (!id) return;
    setBreadcrumbs([]);
    loadFolder(id, "Drive");
  };

  const handleFileClick = (f) => {
    if (f.isFolder) { loadFolder(f.id, f.name); return; }
    const ft = guessType(f.name);
    const url = `https://drive.google.com/file/d/${f.id}/view`;
    onOpenItem({
      id: `drive-${f.id}`,
      key: itemKey(url),
      url, title: f.name, note: "", tags: [],
      type: ft === "file" ? "gdrive" : ft,
      tab: "Drive",
    });
  };

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => -d);
    else { setSortBy(col); setSortDir(1); }
  };

  const sorted = [...files].sort((a, b) => {
    // Folders always first
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    if (sortBy === "type") {
      const ta = a.isFolder ? "" : guessType(a.name);
      const tb = b.isFolder ? "" : guessType(b.name);
      return ta.localeCompare(tb) * sortDir;
    }
    if (sortBy === "size") return ((a.size || 0) - (b.size || 0)) * sortDir;
    return a.name.localeCompare(b.name) * sortDir;
  });

  const SortHeader = ({ col, label }) => (
    <button onClick={() => toggleSort(col)} style={{
      background: "none", border: "none", color: sortBy === col ? "#f5f5f7" : "rgba(235,235,245,0.28)",
      cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: 1.1,
      textTransform: "uppercase", display: "flex", alignItems: "center", gap: 3, padding: 0
    }}>
      {label}
      {sortBy === col && <Icon name={sortDir === 1 ? "chevronUp" : "chevronDown"} size={10} />}
    </button>
  );

  return (
    <div style={{ padding: mobile ? 12 : 24, fontFamily: "Inter, sans-serif" }}>
      {mobile && (
        <button onClick={onOpenMenu} aria-label="Open navigation" style={{ width: 36, height: 36, borderRadius: 9, marginBottom: 12, background: "rgba(255,255,255,0.06)", color: "#f5f5f7", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}>
          <Icon name="menu" size={18} />
        </button>
      )}
      <h2 style={{ margin: "0 0 4px", fontSize: mobile ? 17 : 18, fontWeight: 700, color: "#f5f5f7" }}>Google Drive</h2>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "rgba(235,235,245,0.28)" }}>
        Paste a public Drive folder link to browse files.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, maxWidth: 620, flexDirection: mobile ? "column" : "row" }}>
        <input
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleLoad(); }}
          placeholder="https://drive.google.com/drive/folders/..."
          style={{
            flex: 1, padding: "10px 14px", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
            color: "#f5f5f7", fontSize: mobile ? 16 : 13, outline: "none", fontFamily: "monospace"
          }}
        />
        <button onClick={handleLoad} style={{ padding: mobile ? "12px 20px" : "10px 20px", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#f5f5f7", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
          Browse
        </button>
      </div>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 16, fontSize: 12, alignItems: "center", flexWrap: "wrap" }}>
          {breadcrumbs.map((b, i) => (
            <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <Icon name="chevronRight" size={11} style={{ color: "#333" }} />}
              <button onClick={() => loadFolder(b.id, b.name)} style={{ background: "none", border: "none", color: i === breadcrumbs.length - 1 ? "#f5f5f7" : "rgba(235,235,245,0.45)", cursor: "pointer", fontSize: 12, padding: 0, fontWeight: i === breadcrumbs.length - 1 ? 600 : 400 }}>
                {b.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {loading && <div style={{ color: "rgba(235,235,245,0.25)", fontSize: 13, padding: 40, textAlign: "center" }}>Reading folder...</div>}
      {error && <div style={{ background: "rgba(255,60,60,0.07)", border: "1px solid rgba(255,60,60,0.18)", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#ff6b6b" }}>{error}</div>}

      {/* Table view */}
      {!loading && sorted.length > 0 && (
        <div style={{ background: "transparent", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 90px 80px", gap: 12, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", alignItems: "center", background: "rgba(255,255,255,0.02)" }}>
            <div />
            <SortHeader col="name" label="Name" />
            <SortHeader col="type" label="Type" />
            <SortHeader col="size" label="Size" />
          </div>
          {/* Rows */}
          {sorted.map((f) => {
            const ft = f.isFolder ? "folder" : guessType(f.name);
            const col = f.isFolder ? "#FBBC05" : (COLOR[ft] || "#555");
            return (
              <button key={f.id} onClick={() => handleFileClick(f)} style={{
                display: "grid", gridTemplateColumns: "28px 1fr 90px 80px", gap: 12,
                width: "100%", textAlign: "left", padding: "10px 14px",
                background: "transparent", border: "none", cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                alignItems: "center", transition: "background 0.1s"
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <Icon name={f.isFolder ? "folder" : (typeIcon[ft] || "document")} size={16} style={{ color: col }} />
                <span style={{ fontSize: 13, color: "rgba(235,235,245,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </span>
                <span style={{ fontSize: 10, color: col, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {f.isFolder ? "Folder" : ft.toUpperCase()}
                </span>
                <span style={{ fontSize: 10, color: "rgba(235,235,245,0.2)" }}>
                  {f.size ? formatSize(f.size) : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && breadcrumbs.length > 0 && sorted.length === 0 && !error && (
        <div style={{ color: "rgba(235,235,245,0.25)", fontSize: 13, padding: 40, textAlign: "center" }}>Folder is empty.</div>
      )}
    </div>
  );
}
