"use client";
import { useState, useEffect, useRef } from "react";
import { extractSheetId, extractSheetGid, splitKeywords, normalizeCoverUrl, proxiedMediaUrl, DEFAULT_SHEET_SOURCE, mergeSheetSources, normalizeSheetSource } from "@/lib/utils";
import Icon from "./Icons";
import { T } from "@/lib/theme";

const isPublishedExportUrl = (val) =>
  /\/spreadsheets\/d\/e\//.test(val) || val.includes("pubhtml") || val.includes("pub?");

const MATCH_OPTIONS = [
  { id: "any", label: "Any field", help: "Title, tags, note, folder, source, or URL" },
  { id: "tag", label: "Tag", help: "Best for subjects like Darth Maul or Spider-Man" },
  { id: "title", label: "Title", help: "Matches words in item titles" },
  { id: "folder", label: "Folder", help: "Applies to a whole folder" },
  { id: "source", label: "Source", help: "Matches YouTube, Drive, image, etc." },
  { id: "url", label: "URL", help: "Matches part of a URL" },
];

const emptyCover = {
  id: null,
  label: "",
  thumbnail: "",
  match_type: "any",
  keywordsText: "",
  note: "",
  priority: 100,
  enabled: true,
  cover_fit: "cover",
  cover_position_x: 50,
  cover_position_y: 50,
};

function coverToForm(cover) {
  if (!cover) return emptyCover;
  return {
    id: cover.id || null,
    label: cover.label || "",
    thumbnail: cover.thumbnail || "",
    match_type: cover.match_type || "any",
    keywordsText: Array.isArray(cover.keywords) ? cover.keywords.join(", ") : "",
    note: cover.note || "",
    priority: Number.isFinite(Number(cover.priority)) ? Number(cover.priority) : 100,
    enabled: cover.enabled !== false,
    cover_fit: cover.cover_fit || "cover",
    cover_position_x: Number.isFinite(Number(cover.cover_position_x)) ? Number(cover.cover_position_x) : 50,
    cover_position_y: Number.isFinite(Number(cover.cover_position_y)) ? Number(cover.cover_position_y) : 50,
  };
}

export default function ConfigModal({
  onSave,
  onClose,
  savedId,
  needsManualTabs,
  coverRules = [],
  onSaveCoverRules,
  coverLibrary = [],
  onSaveCover,
  onDeleteCover,
  diagnostics = {},
  sheetSources = [],
  defaultSheetSourceId = DEFAULT_SHEET_SOURCE.id,
  onSaveSheetSources,
  onExportJSON,
  onExportCSV,
}) {
  const [activeTab, setActiveTab] = useState(needsManualTabs ? "sheet" : "covers");
  const [val, setVal] = useState(savedId || "");
  const [tabsInput, setTabsInput] = useState("");
  const [warning, setWarning] = useState(needsManualTabs ? "manual" : "");
  const [coverInput, setCoverInput] = useState(() => (coverRules || []).map((r) => `${r.tag}=${r.thumbnail}`).join("\n"));
  const [sourceForm, setSourceForm] = useState(() => normalizeSheetSource(DEFAULT_SHEET_SOURCE));
  const resolvedSheetSources = mergeSheetSources(sheetSources);
  const [coverForm, setCoverForm] = useState(emptyCover);
  const ref = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");

  useEffect(() => {
    const sync = () => setIsMobile(window.innerWidth < 640);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (activeTab !== "diagnostics") return;
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => { if (alive) { setHealth(json); setHealthError(""); } })
      .catch((e) => { if (alive) setHealthError(e.message || "Health check failed"); });
    return () => { alive = false; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "sheet") ref.current?.focus();
    const h = (e) => { if (e.key === "Escape" && savedId && !needsManualTabs) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, savedId, needsManualTabs, activeTab]);

  const handleChange = (v) => {
    setVal(v);
    if (isPublishedExportUrl(v))      setWarning("published");
    else if (needsManualTabs)         setWarning("manual");
    else                              setWarning("");
  };

  const handleSave = () => {
    if (!val.trim() || isPublishedExportUrl(val)) return;
    const manualTabs = tabsInput.trim()
      ? tabsInput.split(",").map((t) => t.trim()).filter(Boolean)
      : null;
    onSave(extractSheetId(val), manualTabs);
  };

  const saveSheetSource = () => {
    const url = String(sourceForm.url || "").trim();
    const sheetId = String(sourceForm.sheetId || extractSheetId(url) || "").trim();
    const gid = String(sourceForm.gid || extractSheetGid(url) || "").trim();
    if (!sheetId) return;
    const nextSource = normalizeSheetSource({
      ...sourceForm,
      sheetId,
      gid,
      tab: sourceForm.tab || (gid ? `gid:${gid}` : "Vault Import"),
      tabsText: sourceForm.tabsText || (gid ? `gid:${gid}` : "Vault Import, Vault Library"),
    });
    const next = mergeSheetSources([nextSource, ...resolvedSheetSources.filter((s) => s.id !== nextSource.id)]);
    onSaveSheetSources?.(next, defaultSheetSourceId || DEFAULT_SHEET_SOURCE.id);
    setSourceForm(normalizeSheetSource(DEFAULT_SHEET_SOURCE));
  };

  const deleteSheetSource = (id) => {
    if (id === DEFAULT_SHEET_SOURCE.id) return;
    const next = resolvedSheetSources.filter((s) => s.id !== id);
    const nextDefault = defaultSheetSourceId === id ? DEFAULT_SHEET_SOURCE.id : defaultSheetSourceId;
    onSaveSheetSources?.(next, nextDefault);
  };

  const setDefaultSheetSource = (id) => {
    onSaveSheetSources?.(resolvedSheetSources, id);
  };

  const handleSaveLegacyCovers = () => {
    const rules = coverInput.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("=");
        if (idx === -1) return null;
        return { tag: line.slice(0, idx).trim(), thumbnail: line.slice(idx + 1).trim() };
      })
      .filter((r) => r?.tag && /^https?:\/\//i.test(r.thumbnail));
    onSaveCoverRules?.(rules);
  };

  const saveCover = () => {
    const label = coverForm.label.trim();
    const thumbnail = normalizeCoverUrl(coverForm.thumbnail.trim());
    const keywords = splitKeywords(coverForm.keywordsText || label);
    if (!label || !/^https?:\/\//i.test(thumbnail)) return;
    onSaveCover?.({
      id: coverForm.id,
      label,
      thumbnail,
      match_type: coverForm.match_type || "any",
      keywords,
      note: coverForm.note.trim(),
      priority: Number.isFinite(Number(coverForm.priority)) ? Number(coverForm.priority) : 100,
      enabled: coverForm.enabled !== false,
      cover_fit: coverForm.cover_fit || "cover",
      cover_position_x: Number(coverForm.cover_position_x) || 50,
      cover_position_y: Number(coverForm.cover_position_y) || 50,
    });
    setCoverForm(emptyCover);
  };

  const canSaveSheet = val.trim() && !isPublishedExportUrl(val);
  const canSaveSource = !!String(sourceForm.url || sourceForm.sheetId || "").trim();
  const canSaveCover = coverForm.label.trim() && /^https?:\/\//i.test(normalizeCoverUrl(coverForm.thumbnail.trim()));
  const previewUrl = coverForm.thumbnail ? proxiedMediaUrl(normalizeCoverUrl(coverForm.thumbnail)) : "";

  return (
    <>
      <div onClick={() => savedId && !needsManualTabs && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1098, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} />
      <div style={{
        position: "fixed",
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(96vw, 760px)", maxHeight: "92dvh", overflow: "auto", zIndex: 1099,
        background: T.bgRaised, borderRadius: 16,
        border: `1px solid ${T.border}`,
        padding: isMobile ? 16 : 22,
        fontFamily: "Inter, sans-serif",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text1 }}>Vault Settings</div>
            <div style={{ fontSize: 12, color: T.text4, marginTop: 4 }}>Connect Sheets and manage uniform card covers.</div>
          </div>
          {savedId && !needsManualTabs && <button onClick={onClose} style={iconBtn}><Icon name="x" size={18} /></button>}
        </div>

        <div style={{ display: "flex", gap: 7, marginBottom: 16, borderBottom: `1px solid ${T.borderSub}`, paddingBottom: 8, overflowX: "auto" }}>
          <TabButton active={activeTab === "sheet"} onClick={() => setActiveTab("sheet")}>Google Sheet</TabButton>
          <TabButton active={activeTab === "covers"} onClick={() => setActiveTab("covers")}>Covers</TabButton>
          <TabButton active={activeTab === "diagnostics"} onClick={() => setActiveTab("diagnostics")}>Diagnostics</TabButton>
          <TabButton active={activeTab === "backup"} onClick={() => setActiveTab("backup")}>Backup</TabButton>
          <TabButton active={activeTab === "legacy"} onClick={() => setActiveTab("legacy")}>Legacy Rules</TabButton>
        </div>

        {activeTab === "sheet" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={panelStyle}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text1, marginBottom: 5 }}>Sheet sources</div>
              <div style={{ fontSize: 12, color: T.text4, lineHeight: 1.5, marginBottom: 12 }}>Save the Sheets you use for collecting links. Import can read by tab name or by gid. No OAuth needed, but the sheet must be viewable by link.</div>
              <div style={{ display: "grid", gap: 8 }}>
                {resolvedSheetSources.map((source) => (
                  <div key={source.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: 8, alignItems: "center", padding: 10, border: `1px solid ${source.id === defaultSheetSourceId ? T.borderHov : T.borderSub}`, borderRadius: 12, background: source.id === defaultSheetSourceId ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: T.text1, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.name}</div>
                        {source.id === defaultSheetSourceId && <span style={{ fontSize: 9, color: "#111", background: "#fff", borderRadius: 999, padding: "2px 6px", fontWeight: 900 }}>DEFAULT</span>}
                      </div>
                      <div style={{ fontSize: 10, color: T.text4, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.tabsText || source.tab || source.gid || "Vault Import"}</div>
                      <div style={{ fontSize: 10, color: T.text4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.sheetId}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => setDefaultSheetSource(source.id)} style={smallBtn}>Default</button>
                      <button onClick={() => setSourceForm(source)} style={smallBtn}>Edit</button>
                      {source.id !== DEFAULT_SHEET_SOURCE.id && <button onClick={() => { if (window.confirm(`Delete sheet source "${source.name}"?`)) deleteSheetSource(source.id); }} style={{ ...smallBtn, color: "#ff9b9b" }}>Delete</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text1, marginBottom: 5 }}>{sourceForm.id && resolvedSheetSources.some((s) => s.id === sourceForm.id) ? "Edit Sheet source" : "Add Sheet source"}</div>
              <label style={label}>Source name</label>
              <input value={sourceForm.name || ""} onChange={(e) => setSourceForm((f) => ({ ...f, name: e.target.value }))} placeholder="Vault Library" style={inputStyle(isMobile)} />
              <label style={{ ...label, marginTop: 9 }}>Sheet URL or ID</label>
              <input value={sourceForm.url || ""} onChange={(e) => {
                const url = e.target.value;
                setSourceForm((f) => ({ ...f, url, sheetId: extractSheetId(url), gid: extractSheetGid(url) || f.gid, tab: extractSheetGid(url) ? `gid:${extractSheetGid(url)}` : f.tab }));
              }} placeholder="https://docs.google.com/spreadsheets/d/..." style={inputStyle(isMobile)} />
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginTop: 9 }}>
                <div>
                  <label style={label}>Default tab / gid</label>
                  <input value={sourceForm.tab || ""} onChange={(e) => setSourceForm((f) => ({ ...f, tab: e.target.value }))} placeholder="gid:355378672 or Vault Import" style={inputStyle(isMobile)} />
                </div>
                <div>
                  <label style={label}>Tabs to scan</label>
                  <input value={sourceForm.tabsText || ""} onChange={(e) => setSourceForm((f) => ({ ...f, tabsText: e.target.value }))} placeholder="gid:355378672, Vault Import" style={inputStyle(isMobile)} />
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: T.text4, lineHeight: 1.5 }}>Use <b>gid:355378672</b> for a specific tab from the URL. You can also use regular tab names.</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={saveSheetSource} disabled={!canSaveSource} style={{ ...btnPrimary, opacity: canSaveSource ? 1 : 0.45 }}>{sourceForm.id && resolvedSheetSources.some((s) => s.id === sourceForm.id) ? "Save Source" : "Add Source"}</button>
                <button onClick={() => setSourceForm(normalizeSheetSource(DEFAULT_SHEET_SOURCE))} style={btnSecondary}>Reset Form</button>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ fontSize: 12, color: T.text4, lineHeight: 1.5 }}>
                Legacy single Sheet ID remains below for older installs. The new import flow uses Sheet Sources above.
              </div>
              <input
                ref={ref}
                value={val}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Legacy Sheet URL / ID"
                style={{ ...inputStyle(isMobile), marginTop: 10 }}
              />
              {(needsManualTabs || warning === "manual") && (
                <input
                  value={tabsInput}
                  onChange={(e) => setTabsInput(e.target.value)}
                  placeholder="Tab1, Tab2, Tab3"
                  style={{ ...inputStyle(isMobile), marginTop: 8 }}
                />
              )}
              {warning === "published" && <div style={warnBox}>That's a "Publish to web" URL. Use the regular share URL instead.</div>}
              <button onClick={handleSave} disabled={!canSaveSheet} style={{ ...btnSecondary, opacity: canSaveSheet ? 1 : 0.4, marginTop: 10 }}>Save legacy Sheet ID</button>
            </div>
          </div>
        )}

        {activeTab === "covers" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 0.9fr) minmax(320px, 1.1fr)", gap: 16 }}>
            <div style={panelStyle}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text1, marginBottom: 5 }}>{coverForm.id ? "Edit cover" : "Add cover"}</div>
              <div style={{ fontSize: 11, color: T.text4, lineHeight: 1.45, marginBottom: 10 }}>Store the cover once. Then match it by subject, tag, title, folder, source, or URL.</div>

              <label style={label}>Cover name</label>
              <input value={coverForm.label} onChange={(e) => setCoverForm((f) => ({ ...f, label: e.target.value }))} placeholder="Darth Maul" style={inputStyle(isMobile)} />

              <label style={{ ...label, marginTop: 9 }}>Image URL / Google Drive image</label>
              <input value={coverForm.thumbnail} onChange={(e) => setCoverForm((f) => ({ ...f, thumbnail: e.target.value }))} placeholder="https://.../cover.jpg" style={inputStyle(isMobile)} />

              {previewUrl && (
                <div style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", border: `1px solid ${T.borderSub}`, background: "rgba(255,255,255,0.035)", aspectRatio: "4 / 5" }}>
                  <img src={previewUrl} alt="Cover preview" style={{ width: "100%", height: "100%", objectFit: coverForm.cover_fit || "cover", objectPosition: `${coverForm.cover_position_x || 50}% ${coverForm.cover_position_y || 50}%`, display: "block" }} />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setCoverForm((f) => ({ ...f, cover_fit: "cover" }))} style={{ padding: "8px 10px", borderRadius: 9, border: `1px solid ${coverForm.cover_fit !== "contain" ? T.borderHov : T.border}`, background: coverForm.cover_fit !== "contain" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: coverForm.cover_fit !== "contain" ? T.text1 : T.text4, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Fill crop</button>
                <button type="button" onClick={() => setCoverForm((f) => ({ ...f, cover_fit: "contain" }))} style={{ padding: "8px 10px", borderRadius: 9, border: `1px solid ${coverForm.cover_fit === "contain" ? T.borderHov : T.border}`, background: coverForm.cover_fit === "contain" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: coverForm.cover_fit === "contain" ? T.text1 : T.text4, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Fit full</button>
              </div>
              {(coverForm.cover_fit || "cover") !== "contain" && (
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <label style={{ fontSize: 10, color: T.text4 }}>Horizontal crop {coverForm.cover_position_x || 50}%</label>
                  <input type="range" min="0" max="100" value={coverForm.cover_position_x || 50} onChange={(e) => setCoverForm((f) => ({ ...f, cover_position_x: e.target.value }))} />
                  <label style={{ fontSize: 10, color: T.text4 }}>Vertical crop {coverForm.cover_position_y || 50}%</label>
                  <input type="range" min="0" max="100" value={coverForm.cover_position_y || 50} onChange={(e) => setCoverForm((f) => ({ ...f, cover_position_y: e.target.value }))} />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, marginTop: 10 }}>
                <div>
                  <label style={label}>Match against</label>
                  <select value={coverForm.match_type} onChange={(e) => setCoverForm((f) => ({ ...f, match_type: e.target.value }))} style={inputStyle(isMobile)}>
                    {MATCH_OPTIONS.map((o) => <option key={o.id} value={o.id} style={{ background: "#111" }}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Priority</label>
                  <input type="number" value={coverForm.priority} onChange={(e) => setCoverForm((f) => ({ ...f, priority: e.target.value }))} style={inputStyle(isMobile)} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: T.text4, marginTop: 5 }}>{MATCH_OPTIONS.find((o) => o.id === coverForm.match_type)?.help}</div>

              <label style={{ ...label, marginTop: 10 }}>Keywords / tags / subjects</label>
              <input value={coverForm.keywordsText} onChange={(e) => setCoverForm((f) => ({ ...f, keywordsText: e.target.value }))} placeholder="Darth Maul, Maul, Sith" style={inputStyle(isMobile)} />

              <label style={{ ...label, marginTop: 10 }}>Note</label>
              <textarea value={coverForm.note} onChange={(e) => setCoverForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional note for yourself" rows={2} style={{ ...inputStyle(isMobile), resize: "vertical", fontFamily: "Inter, sans-serif" }} />

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, color: T.text3, fontSize: 12 }}>
                <input type="checkbox" checked={coverForm.enabled} onChange={(e) => setCoverForm((f) => ({ ...f, enabled: e.target.checked }))} /> Enabled
              </label>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {coverForm.id && <button onClick={() => setCoverForm(emptyCover)} style={btnSecondary}>New</button>}
                <button onClick={saveCover} disabled={!canSaveCover} style={{ ...btnPrimary, flex: 1, opacity: canSaveCover ? 1 : 0.45, cursor: canSaveCover ? "pointer" : "not-allowed" }}>{coverForm.id ? "Save cover" : "Add cover"}</button>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text1 }}>Cover Library</div>
                  <div style={{ fontSize: 11, color: T.text4, marginTop: 3 }}>{coverLibrary.length} saved covers</div>
                </div>
              </div>
              <div style={{ display: "grid", gap: 8, maxHeight: isMobile ? 330 : 540, overflow: "auto", paddingRight: 2 }}>
                {coverLibrary.length === 0 && <div style={{ padding: 18, border: `1px dashed ${T.border}`, borderRadius: 12, color: T.text4, fontSize: 12 }}>No covers yet. Add one for Star Wars, Spider-Man, Darth Maul, client projects, or any subject you save often.</div>}
                {coverLibrary.map((cover) => (
                  <CoverRow key={cover.id} cover={cover} onEdit={() => setCoverForm(coverToForm(cover))} onDelete={() => { if (window.confirm(`Delete cover "${cover.label}"?`)) onDeleteCover?.(cover.id); }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "diagnostics" && (
          <DiagnosticsTab diagnostics={diagnostics} health={health} healthError={healthError} />
        )}

        {activeTab === "backup" && (
          <div style={panelStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text1, marginBottom: 5 }}>Backup / export</div>
            <div style={{ fontSize: 12, color: T.text4, lineHeight: 1.5, marginBottom: 14 }}>Export your vault before risky changes. JSON is best for recovery. CSV is best for spreadsheet review.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={onExportJSON} style={btnPrimary}>Export JSON backup</button>
              <button onClick={onExportCSV} style={btnSecondary}>Export CSV</button>
            </div>
            <div style={{ marginTop: 14, fontSize: 11, color: T.text4, lineHeight: 1.5 }}>Exports stay local in your browser. They do not change Supabase or Google Sheets.</div>
          </div>
        )}

        {activeTab === "legacy" && (
          <div style={panelStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 6 }}>Legacy cover rules</div>
            <div style={{ fontSize: 11, color: T.text4, lineHeight: 1.45, marginBottom: 8 }}>
              Older text rules still work, but the Cover Library is cleaner. One per line: <b>tag or keyword=image URL</b>.
            </div>
            <textarea
              value={coverInput}
              onChange={(e) => setCoverInput(e.target.value)}
              placeholder={"Star Wars=https://.../star-wars-cover.jpg\nDarth Maul=https://.../maul.jpg"}
              rows={6}
              style={{ ...inputStyle(isMobile), minHeight: 140, resize: "vertical", fontFamily: "monospace" }}
            />
            <button onClick={handleSaveLegacyCovers} style={{ ...btnSecondary, marginTop: 8, width: "100%" }}>Save legacy rules</button>
          </div>
        )}
      </div>
    </>
  );
}

function DiagnosticsTab({ diagnostics, health, healthError }) {
  const checks = [
    ["Supabase client", diagnostics.supabaseConfigured ? "Configured" : "Local-only / missing env", diagnostics.supabaseConfigured],
    ["Sheet webhook", health ? (health.sheetWebhookConfigured ? "Configured" : "Missing") : "Checking...", health ? health.sheetWebhookConfigured : null],
    ["Relay size cap", health ? `${Math.round((health.mediaRelayMaxBytes || 0) / 1024 / 1024)} MB` : "Checking...", true],
    ["Items", String(diagnostics.itemCount || 0), true],
    ["Folders", String(diagnostics.folderCount || 0), true],
    ["Covers", String(diagnostics.coverCount || 0), true],
    ["Comments table", "Run latest schema if comments fail", true],
  ];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={panelStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text1, marginBottom: 5 }}>Diagnostics</div>
        <div style={{ fontSize: 12, color: T.text4, lineHeight: 1.5, marginBottom: 12 }}>Quick health check for the vault. This does not repair anything automatically, but it tells you where to look first.</div>
        <div style={{ display: "grid", gap: 7 }}>
          {checks.map(([label, value, ok]) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, alignItems: "center", padding: "9px 10px", border: `1px solid ${T.borderSub}`, borderRadius: 10, background: "rgba(255,255,255,0.035)" }}>
              <div style={{ fontSize: 11, color: T.text4, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 800 }}>{label}</div>
              <div style={{ fontSize: 12, color: ok === false ? "#ff9b9b" : T.text2 }}>{value}</div>
            </div>
          ))}
        </div>
        {healthError && <div style={{ ...warnBox, color: "#ff9b9b", borderColor: "rgba(255,80,80,0.18)", background: "rgba(255,80,80,0.08)" }}>{healthError}</div>}
      </div>
      <div style={panelStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text1, marginBottom: 5 }}>Last runtime error</div>
        <RuntimeErrorReadout />
      </div>
    </div>
  );
}

function RuntimeErrorReadout() {
  const [err, setErr] = useState(null);
  useEffect(() => {
    try { setErr(JSON.parse(localStorage.getItem("vv_last_runtime_error") || "null")); } catch { setErr(null); }
  }, []);
  if (!err) return <div style={{ fontSize: 12, color: T.text4 }}>No caught runtime error stored.</div>;
  return (
    <div>
      <div style={{ fontSize: 11, color: T.text4, marginBottom: 8 }}>{err.at}</div>
      <pre style={{ maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 11, color: "#ffb4b4", background: "rgba(255,80,80,0.06)", border: "1px solid rgba(255,80,80,0.14)", borderRadius: 10, padding: 10 }}>{err.message}</pre>
      <button onClick={() => { localStorage.removeItem("vv_last_runtime_error"); setErr(null); }} style={{ ...btnSecondary, marginTop: 8 }}>Clear stored error</button>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return <button onClick={onClick} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${active ? T.borderHov : T.border}`, background: active ? "rgba(255,255,255,0.12)" : "transparent", color: active ? T.text1 : T.text4, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{children}</button>;
}

function CoverRow({ cover, onEdit, onDelete }) {
  const keywords = Array.isArray(cover.keywords) ? cover.keywords : [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "58px 1fr auto", gap: 10, alignItems: "center", padding: 9, border: `1px solid ${T.borderSub}`, borderRadius: 12, background: cover.enabled === false ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.045)", opacity: cover.enabled === false ? 0.55 : 1 }}>
      <div style={{ width: 58, aspectRatio: "4 / 5", borderRadius: 9, overflow: "hidden", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.borderSub}` }}>
        <img src={proxiedMediaUrl(normalizeCoverUrl(cover.thumbnail))} alt="" style={{ width: "100%", height: "100%", objectFit: cover.cover_fit || "cover", objectPosition: `${cover.cover_position_x || 50}% ${cover.cover_position_y || 50}%`, display: "block" }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: T.text1, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cover.label}</div>
          <span style={{ fontSize: 9, color: T.text4, border: `1px solid ${T.border}`, borderRadius: 999, padding: "2px 6px", textTransform: "uppercase" }}>{cover.match_type || "any"}</span>
        </div>
        <div style={{ fontSize: 10, color: T.text4, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {keywords.length ? keywords.join(", ") : "Uses cover name as keyword"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button onClick={onEdit} style={smallBtn}>Edit</button>
        <button onClick={onDelete} style={{ ...smallBtn, color: "#ff8c8c" }}>Delete</button>
      </div>
    </div>
  );
}

const inputStyle = (mobile) => ({
  width: "100%",
  padding: mobile ? "13px 14px" : "11px 13px",
  background: T.bgInput,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.text1,
  fontSize: mobile ? 16 : 13,
  outline: "none",
  boxSizing: "border-box",
});

const label = { display: "block", fontSize: 10, color: T.text4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 800, marginBottom: 5 };
const panelStyle = { border: `1px solid ${T.border}`, borderRadius: 14, padding: 13, background: "rgba(255,255,255,0.03)" };
const iconBtn = { width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: `1px solid ${T.border}`, color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const btnPrimary = { padding: "11px 18px", background: "#fff", color: "#000", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700 };
const btnSecondary = { padding: "11px 16px", background: "transparent", border: `1px solid ${T.border}`, color: T.text2, borderRadius: 8, fontSize: 13, cursor: "pointer" };
const smallBtn = { background: "rgba(255,255,255,0.08)", border: `1px solid ${T.border}`, color: T.text2, borderRadius: 8, padding: "7px 8px", fontSize: 11, cursor: "pointer" };
const warnBox = { marginTop: 10, padding: "9px 12px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)", borderRadius: 8, fontSize: 12, color: "rgba(251,191,36,0.8)", lineHeight: 1.4 };
