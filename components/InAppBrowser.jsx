"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { itemKey, sourceIdOf } from "@/lib/utils";

const HISTORY_KEY = "vv_browser_history";

function isLikelyUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return false;
  if (/^https?:\/\//i.test(raw)) return true;
  return /^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw);
}

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw)) return `https://${raw}`;
  return "";
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function shouldSkipIframe(url) {
  const host = hostOf(url);
  return /(^|\.)(google\.com|duckduckgo\.com|bing\.com|youtube\.com|youtu\.be|reddit\.com|instagram\.com|tiktok\.com|facebook\.com|x\.com|twitter\.com)$/i.test(host);
}

export default function InAppBrowser({ onClose, onSave, folders = [], isMobile = false, onCreateFolder }) {
  const [address, setAddress] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [frameBlocked, setFrameBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [metaState, setMetaState] = useState("idle");
  const [folder, setFolder] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState("idle");
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")); } catch { setHistory([]); }
    inputRef.current?.focus();
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (!currentUrl) return;
    setMetadata(null);
    setMetaState("checking");
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/metadata?url=${encodeURIComponent(currentUrl)}`, { signal: controller.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not read link");
        setMetadata(j);
        setMetaState("ok");
      } catch (e) {
        if (e.name !== "AbortError") {
          setMetadata(null);
          setMetaState("fail");
        }
      }
    }, 200);
    return () => { clearTimeout(t); controller.abort(); };
  }, [currentUrl]);

  useEffect(() => {
    if (!loadingFrame) return;
    const t = setTimeout(() => {
      setLoadingFrame(false);
      setFrameBlocked(true);
    }, 6500);
    return () => clearTimeout(t);
  }, [loadingFrame, currentUrl]);

  const currentHost = useMemo(() => hostOf(currentUrl), [currentUrl]);

  const commitHistory = (url, meta = null) => {
    const row = { url, title: meta?.title || hostOf(url) || url, visitedAt: new Date().toISOString() };
    const next = [row, ...history.filter((h) => h.url !== url)].slice(0, 80);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  };

  const runSearch = async (query) => {
    const q = String(query || "").trim();
    if (!q) return;
    setSearchQuery(q);
    setCurrentUrl("");
    setMetadata(null);
    setMetaState("idle");
    setSearchState("loading");
    setSearchError("");
    setShowHistory(false);
    try {
      const r = await fetch(`/api/browser-search?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Search failed");
      setSearchResults(Array.isArray(j.results) ? j.results : []);
      setSearchState("done");
    } catch (e) {
      setSearchResults([]);
      setSearchError(e.message || "Search failed");
      setSearchState("fail");
    }
  };

  const openUrl = (url, { addHistory = true } = {}) => {
    const target = normalizeUrl(url);
    if (!target) return;
    setCurrentUrl(target);
    setAddress(target);
    setSearchQuery("");
    setShowHistory(false);
    setFrameBlocked(shouldSkipIframe(target));
    setLoadingFrame(!shouldSkipIframe(target));
    if (addHistory) commitHistory(target);
  };

  const go = (value = address) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    if (isLikelyUrl(raw)) openUrl(raw);
    else runSearch(raw);
  };

  const removeHistoryItem = (url) => {
    const next = history.filter((h) => h.url !== url);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creatingFolder) return;
    setCreatingFolder(true);
    try {
      await onCreateFolder?.(name);
      setFolder(name);
      setNewFolderName("");
    } finally {
      setCreatingFolder(false);
    }
  };

  const saveUrl = async (url, meta = {}) => {
    if (!url) return;
    setSaving(true);
    try {
      let finalMeta = meta;
      if (!finalMeta.title) {
        try {
          const r = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
          if (r.ok) finalMeta = await r.json();
        } catch {}
      }
      const item = {
        id: `browser-${Date.now()}`,
        key: itemKey(url),
        url,
        title: finalMeta.title || hostOf(url) || url,
        note: finalMeta.description || finalMeta.snippet || "",
        tags: [],
        source: sourceIdOf(url),
        folder: folder || null,
        tab: folder || "Vault Library",
        thumbnail: finalMeta.thumbnail || "",
        type: finalMeta.type || "link",
        siteName: finalMeta.siteName || finalMeta.host || hostOf(url),
        isVaultItem: true,
        addedAt: new Date().toISOString(),
      };
      await onSave?.(item);
      commitHistory(url, finalMeta);
    } finally {
      setSaving(false);
    }
  };

  const saveCurrent = async () => saveUrl(currentUrl, metadata || {});
  const saveResult = async (result) => saveUrl(result.url, { title: result.title, description: result.snippet, host: result.host });

  const openExternal = (url = currentUrl) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const previewResult = (result) => openUrl(result.url);

  const selectedTitle = metadata?.title || currentHost || (searchQuery ? `Search: ${searchQuery}` : "No page selected");
  const selectedDesc = metadata?.description || (currentUrl ? currentUrl : searchQuery ? "Choose a result below, or save a result directly." : "Search or paste a link to begin.");

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1198, background: "rgba(0,0,0,0.68)", backdropFilter: "blur(8px)" }} />
      <div style={{
        position: "fixed", zIndex: 1199, inset: isMobile ? "0" : "4vh 4vw", background: "rgba(9,9,9,0.98)",
        border: `1px solid ${T.border}`, borderRadius: isMobile ? 0 : 18, boxShadow: "0 30px 90px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Inter, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "10px" : "12px 14px", borderBottom: `1px solid ${T.borderSub}`, background: "rgba(255,255,255,0.03)" }}>
          <button onClick={onClose} style={toolBtn} title="Close"><Icon name="x" size={16} /></button>
          <form onSubmit={(e) => { e.preventDefault(); go(); }} style={{ flex: 1, minWidth: 0, display: "flex", gap: 8 }}>
            <input ref={inputRef} value={address} onChange={(e) => setAddress(e.target.value)} onFocus={() => setShowHistory(true)} placeholder="Search or paste a link..." style={inputStyle} />
            <button type="submit" style={{ ...toolBtn, width: 42 }} title="Search"><Icon name="search" size={15} /></button>
          </form>
          {!isMobile && <button onClick={() => openExternal()} disabled={!currentUrl} style={toolBtn} title="Open original"><Icon name="external" size={15} /></button>}
          <button onClick={() => setShowHistory((v) => !v)} style={toolBtn} title="History"><Icon name="clock" size={15} /></button>
        </div>

        {showHistory && (
          <div style={{ borderBottom: `1px solid ${T.borderSub}`, background: "rgba(12,12,12,0.98)", maxHeight: isMobile ? 220 : 260, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", color: T.text4, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <span>Browser history</span>
              {history.length > 0 && <button onClick={clearHistory} style={plainBtn}>Clear all</button>}
            </div>
            {history.length === 0 ? <div style={{ padding: "18px 14px", color: T.text4, fontSize: 13 }}>No history yet.</div> : history.map((h) => (
              <div key={h.url} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 14px", borderTop: `1px solid ${T.borderSub}` }}>
                <button onClick={() => openUrl(h.url)} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: T.text2, textAlign: "left", cursor: "pointer" }}>
                  <div style={ellipsis}>{h.title || h.url}</div>
                  <div style={{ ...ellipsis, fontSize: 11, color: T.text4 }}>{h.url}</div>
                </button>
                <button onClick={() => removeHistoryItem(h.url)} style={{ ...toolBtn, width: 30, height: 30 }} title="Delete"><Icon name="trash" size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 340px" }}>
          <div style={{ minHeight: 0, background: "#050505", position: "relative", overflowY: "auto" }}>
            {!currentUrl && !searchQuery ? (
              <EmptySearch />
            ) : searchQuery ? (
              <SearchResults state={searchState} error={searchError} query={searchQuery} results={searchResults} onPreview={previewResult} onSave={saveResult} onOpen={openExternal} saving={saving} />
            ) : frameBlocked ? (
              <BlockedPreview url={currentUrl} host={currentHost} onOpen={() => openExternal(currentUrl)} />
            ) : (
              <>
                {loadingFrame && <div style={loadBadge}>Loading...</div>}
                <iframe src={currentUrl} onLoad={() => { setLoadingFrame(false); setFrameBlocked(false); }} title="In-app browser" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer-when-downgrade" style={{ width: "100%", height: "100%", minHeight: isMobile ? 420 : 620, border: "none", background: "#fff" }} />
              </>
            )}
          </div>

          <div style={{ borderLeft: isMobile ? "none" : `1px solid ${T.borderSub}`, borderTop: isMobile ? `1px solid ${T.borderSub}` : "none", padding: 14, background: "rgba(255,255,255,0.025)", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>Quick save</div>
              {metaState === "checking" && <span style={{ fontSize: 11, color: T.text4 }}>Reading link...</span>}
              {metaState === "fail" && <span style={{ fontSize: 11, color: T.text4 }}>Manual save</span>}
            </div>

            {metadata?.thumbnail && <img src={`/api/media?url=${encodeURIComponent(metadata.thumbnail)}`} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 10 }} />}

            <div style={{ fontSize: 15, fontWeight: 600, color: T.text1, lineHeight: 1.3, marginBottom: 6, wordBreak: "break-word" }}>{selectedTitle}</div>
            <div style={{ fontSize: 12, color: T.text4, lineHeight: 1.45, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{selectedDesc}</div>

            <FolderPicker folders={folders} folder={folder} setFolder={setFolder} newFolderName={newFolderName} setNewFolderName={setNewFolderName} handleCreateFolder={handleCreateFolder} creatingFolder={creatingFolder} />

            <button onClick={saveCurrent} disabled={!currentUrl || saving} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: currentUrl ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: currentUrl ? T.text1 : T.text4, cursor: currentUrl ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14 }}>
              {saving ? "Saving..." : "Save current link"}
            </button>

            <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)", color: T.text4, fontSize: 11, lineHeight: 1.45 }}>
              Search now uses a server-side US/English results list. Preview opens only when the destination site allows iframe viewing. Saving does not depend on preview loading.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FolderPicker({ folders, folder, setFolder, newFolderName, setNewFolderName, handleCreateFolder, creatingFolder }) {
  return <>
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 10 }}>
      <select value={folder} onChange={(e) => setFolder(e.target.value)} style={{ width: "100%", minWidth: 0, padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}>
        <option value="" style={{ background: "#111" }}>No folder</option>
        {folders.map((f) => <option key={f.name} value={f.name} style={{ background: "#111" }}>{f.name}</option>)}
      </select>
      <button onClick={() => setNewFolderName((v) => v ? "" : " ")} style={{ padding: "0 11px", borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.07)", color: T.text1, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ Folder</button>
    </div>
    {newFolderName !== "" && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 10 }}>
        <input value={newFolderName.trimStart()} onChange={(e) => setNewFolderName(e.target.value)} placeholder="New folder name" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateFolder(); } }} style={inputStyle} />
        <button onClick={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder} style={{ padding: "0 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: newFolderName.trim() ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: newFolderName.trim() ? T.text1 : T.text4, cursor: newFolderName.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700 }}>{creatingFolder ? "Adding..." : "Add"}</button>
      </div>
    )}
  </>;
}

function EmptySearch() {
  return <div style={{ height: "100%", minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
    <div><Icon name="search" size={34} style={{ color: T.text4, marginBottom: 12 }} /><div style={{ color: T.text2, fontSize: 15, fontWeight: 600 }}>Quick search</div><div style={{ color: T.text4, fontSize: 12, marginTop: 6 }}>Search the web, preview safe pages, then save links into your vault.</div></div>
  </div>;
}

function SearchResults({ state, error, query, results, onPreview, onSave, onOpen, saving }) {
  return <div style={{ padding: 16 }}>
    <div style={{ color: T.text1, fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Search results</div>
    <div style={{ color: T.text4, fontSize: 12, marginBottom: 14 }}>US/English results for “{query}”</div>
    {state === "loading" && <div style={panel}>Searching...</div>}
    {state === "fail" && <div style={panel}>{error || "Search failed"}</div>}
    {state === "done" && results.length === 0 && <div style={panel}>No results found. Try a more specific search.</div>}
    <div style={{ display: "grid", gap: 10 }}>
      {results.map((r) => <div key={r.url} style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 14, background: "rgba(255,255,255,0.035)" }}>
        <button onClick={() => onPreview(r)} style={{ background: "transparent", border: "none", color: T.text1, padding: 0, textAlign: "left", fontSize: 14, fontWeight: 750, cursor: "pointer", lineHeight: 1.25 }}>{r.title}</button>
        <div style={{ color: T.text4, fontSize: 11, marginTop: 5 }}>{r.host}</div>
        {r.snippet && <div style={{ color: T.text3, fontSize: 12, lineHeight: 1.45, marginTop: 7 }}>{r.snippet}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={() => onSave(r)} disabled={saving} style={smallAction}>{saving ? "Saving..." : "Save"}</button>
          <button onClick={() => onPreview(r)} style={smallAction}>Preview</button>
          <button onClick={() => onOpen(r.url)} style={smallAction}>Open</button>
        </div>
      </div>)}
    </div>
  </div>;
}

function BlockedPreview({ url, host, onOpen }) {
  return <div style={{ minHeight: 420, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
    <div style={{ maxWidth: 360 }}>
      <Icon name="external" size={34} style={{ color: T.text4, marginBottom: 12 }} />
      <div style={{ color: T.text1, fontSize: 16, fontWeight: 800 }}>Preview blocked</div>
      <div style={{ color: T.text4, fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>{host || "This site"} does not allow in-app iframe viewing. You can still save the link or open it externally.</div>
      <button onClick={onOpen} style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.1)", color: T.text1, fontWeight: 700 }}>Open original</button>
    </div>
  </div>;
}

const inputStyle = { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.06)", color: T.text1, fontSize: 13, outline: "none" };
const plainBtn = { background: "transparent", border: "none", color: T.text3, cursor: "pointer", fontSize: 11 };
const ellipsis = { fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const loadBadge = { position: "absolute", top: 10, left: 10, zIndex: 2, padding: "5px 8px", borderRadius: 999, background: "rgba(0,0,0,0.72)", color: T.text3, fontSize: 11 };
const panel = { padding: 14, border: `1px solid ${T.border}`, borderRadius: 14, color: T.text3, background: "rgba(255,255,255,0.035)", fontSize: 13 };
const smallAction = { padding: "7px 10px", borderRadius: 9, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.07)", color: T.text2, fontSize: 12, fontWeight: 700, cursor: "pointer" };
const toolBtn = { width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
