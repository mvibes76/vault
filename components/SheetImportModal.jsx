"use client";
import { useState } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { extractSheetId } from "@/lib/utils";

export default function SheetImportModal({ onClose, onImport, existingCount = 0 }) {
  const [sheetInput, setSheetInput] = useState("");
  const [tabsInput, setTabsInput] = useState("Vault Import, Vault Library");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const tabNames = tabsInput.split(",").map((t) => t.trim()).filter(Boolean);

  const loadPreview = async () => {
    setError(""); setResult(null); setPreview(null);
    const sheetId = extractSheetId(sheetInput || "");
    if (!sheetId) { setError("Paste a Google Sheet URL or Sheet ID."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/sheet-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId, tabNames }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Could not import sheet.");
      setPreview(json);
    } catch (e) {
      setError(e.message || "Could not import sheet.");
    } finally {
      setLoading(false);
    }
  };

  const doImport = async () => {
    if (!preview?.items?.length) return;
    setImporting(true); setError("");
    try {
      const r = await onImport?.(preview.items);
      setResult(r || { imported: preview.items.length });
    } catch (e) {
      setError(e.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text1 }}>Import from Google Sheets</div>
            <div style={{ fontSize: 12, color: T.text4, marginTop: 4 }}>Use Sheets as a collection inbox. Supabase stays the real vault.</div>
          </div>
          <button onClick={onClose} style={iconBtn}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={label}>Sheet URL or ID</label>
          <input value={sheetInput} onChange={(e) => setSheetInput(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." style={input} />

          <label style={label}>Tabs to scan</label>
          <input value={tabsInput} onChange={(e) => setTabsInput(e.target.value)} placeholder="Vault Import, Vault Library" style={input} />
          <div style={hint}>Expected columns: Title, URL, Folder, Tags, Notes, Type, Source, Thumbnail. Optional cover columns: Cover Mode, Cover Fit, Cover X, Cover Y. A Thumbnail column is treated as a custom cover and bypasses automatic cover matching.</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={loadPreview} disabled={loading} style={primaryBtn}>{loading ? "Scanning..." : "Scan Sheet"}</button>
            {preview?.items?.length > 0 && <button onClick={doImport} disabled={importing} style={secondaryBtn}>{importing ? "Importing..." : `Import ${preview.items.length} items`}</button>}
          </div>

          {error && <div style={errorBox}>{error}</div>}
          {result && <div style={successBox}>Imported {result.imported || 0}, updated {result.updated || 0}, skipped {result.skipped || 0}. Created {result.foldersCreated || 0} folders.</div>}

          {preview && (
            <div style={panel}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: T.text2, fontWeight: 600 }}>Preview</div>
                <div style={{ fontSize: 11, color: T.text4 }}>{preview.items.length} usable rows · {preview.skipped || 0} skipped</div>
              </div>
              <div style={{ maxHeight: 260, overflow: "auto", display: "grid", gap: 8 }}>
                {preview.items.slice(0, 40).map((item) => (
                  <div key={item.key} style={row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: T.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title || item.url}</div>
                      <div style={{ fontSize: 10, color: T.text4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.folder || "No folder"} · {item.url}</div>
                    </div>
                  </div>
                ))}
                {preview.items.length > 40 && <div style={{ fontSize: 11, color: T.text4, textAlign: "center", padding: 8 }}>Showing first 40 rows.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const backdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)" };
const modal = { width: "min(720px, 96vw)", maxHeight: "90dvh", overflow: "auto", background: "rgba(14,14,14,0.98)", border: `1px solid ${T.border}`, borderRadius: 18, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.72)" };
const label = { fontSize: 11, color: T.text4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 };
const input = { width: "100%", padding: "12px 13px", background: "rgba(255,255,255,0.07)", border: `1px solid ${T.border}`, borderRadius: 11, color: T.text1, fontSize: 13, outline: "none" };
const hint = { fontSize: 11, color: T.text4, lineHeight: 1.45 };
const primaryBtn = { padding: "10px 15px", background: "#fff", color: "#000", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const secondaryBtn = { padding: "10px 15px", background: "rgba(255,255,255,0.10)", color: T.text1, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const iconBtn = { width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: `1px solid ${T.border}`, color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.035)" };
const row = { display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.borderSub}` };
const errorBox = { padding: 10, borderRadius: 10, background: "rgba(255,80,80,0.10)", color: "#ff9b9b", border: "1px solid rgba(255,80,80,0.18)", fontSize: 12 };
const successBox = { padding: 10, borderRadius: 10, background: "rgba(50,215,75,0.10)", color: "#9af2aa", border: "1px solid rgba(50,215,75,0.18)", fontSize: 12 };
