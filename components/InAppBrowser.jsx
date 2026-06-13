"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { itemKey, sourceIdOf } from "@/lib/utils";

const HISTORY_KEY = "vv_browser_history";
const SEARCH_BASE = "https://www.google.com/search?igu=1&q=";

function normalizeTarget(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw)) return `https://${raw}`;
  return `${SEARCH_BASE}${encodeURIComponent(raw)}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export default function InAppBrowser({ onClose, onSave, folders = [], isMobile = false }) {
  const [address, setAddress] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [metaState, setMetaState] = useState("idle");
  const [folder, setFolder] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
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
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [currentUrl]);

  const currentHost = useMemo(() => hostOf(currentUrl), [currentUrl]);

  const commitHistory = (url, meta = null) => {
    const row = {
      url,
      title: meta?.title || hostOf(url) || url,
      visitedAt: new Date().toISOString(),
    };
    const next = [row, ...history.filter((h) => h.url !== url)].slice(0, 80);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  };

  const go = (value = address) => {
    const target = normalizeTarget(value);
    if (!target) return;
    setCurrentUrl(target);
    setAddress(target);
    setShowHistory(false);
    setLoadingFrame(true);
    commitHistory(target);
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

  const saveCurrent = async () => {
    if (!currentUrl) return;
    setSaving(true);
    try {
      const meta = metadata || {};
      const item = {
        id: `browser-${Date.now()}`,
        key: itemKey(currentUrl),
        url: currentUrl,
        title: meta.title || currentHost || currentUrl,
        note: meta.description || "",
        tags: [],
        source: sourceIdOf(currentUrl),
        folder: folder || null,
        tab: folder || "Vault Library",
        thumbnail: meta.thumbnail || "",
        type: meta.type || "link",
        siteName: meta.siteName || currentHost,
        isVaultItem: true,
        addedAt: new Date().toISOString(),
      };
      await onSave?.(item);
      commitHistory(currentUrl, meta);
    } finally {
      setSaving(false);
    }
  };

  const openExternal = () => {
    if (currentUrl) window.open(currentUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1198, background: "rgba(0,0,0,0.68)", backdropFilter: "blur(8px)" }} />
      <div style={{
        position: "fixed",
        zIndex: 1199,
        inset: isMobile ? "0" : "4vh 4vw",
        background: "rgba(9,9,9,0.98)",
        border: `1px solid ${T.border}`,
        borderRadius: isMobile ? 0 : 18,
        boxShadow: "0 30px 90px rgba(0,0,0,0.7)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "10px 10px" : "12px 14px", borderBottom: `1px solid ${T.borderSub}`, background: "rgba(255,255,255,0.03)" }}>
          <button onClick={onClose} style={toolBtn} title="Close"><Icon name="x" size={16} /></button>
          <form onSubmit={(e) => { e.preventDefault(); go(); }} style={{ flex: 1, minWidth: 0, display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onFocus={() => setShowHistory(true)}
              placeholder="Search or paste a link..."
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.06)", color: T.text1, fontSize: 13, outline: "none" }}
            />
            <button type="submit" style={{ ...toolBtn, width: 42 }} title="Go"><Icon name="search" size={15} /></button>
          </form>
          {!isMobile && <button onClick={openExternal} disabled={!currentUrl} style={toolBtn} title="Open original"><Icon name="external" size={15} /></button>}
          <button onClick={() => setShowHistory((v) => !v)} style={toolBtn} title="History"><Icon name="clock" size={15} /></button>
        </div>

        {showHistory && (
          <div style={{ borderBottom: `1px solid ${T.borderSub}`, background: "rgba(12,12,12,0.98)", maxHeight: isMobile ? 220 : 260, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", color: T.text4, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <span>Browser history</span>
              {history.length > 0 && <button onClick={clearHistory} style={{ background: "transparent", border: "none", color: T.text3, cursor: "pointer", fontSize: 11 }}>Clear all</button>}
            </div>
            {history.length === 0 ? (
              <div style={{ padding: "18px 14px", color: T.text4, fontSize: 13 }}>No history yet.</div>
            ) : history.map((h) => (
              <div key={h.url} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 14px", borderTop: `1px solid ${T.borderSub}` }}>
                <button onClick={() => go(h.url)} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: T.text2, textAlign: "left", cursor: "pointer" }}>
                  <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title || h.url}</div>
                  <div style={{ fontSize: 11, color: T.text4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.url}</div>
                </button>
                <button onClick={() => removeHistoryItem(h.url)} style={{ ...toolBtn, width: 30, height: 30 }} title="Delete"><Icon name="trash" size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 320px" }}>
          <div style={{ minHeight: 0, background: "#050505", position: "relative" }}>
            {!currentUrl ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
                <div>
                  <Icon name="search" size={34} style={{ color: T.text4, marginBottom: 12 }} />
                  <div style={{ color: T.text2, fontSize: 15, fontWeight: 600 }}>Quick search</div>
                  <div style={{ color: T.text4, fontSize: 12, marginTop: 6 }}>Find a page, preview it, then save the link into your vault.</div>
                </div>
              </div>
            ) : (
              <>
                {loadingFrame && <div style={{ position: "absolute", top: 10, left: 10, zIndex: 2, padding: "5px 8px", borderRadius: 999, background: "rgba(0,0,0,0.72)", color: T.text3, fontSize: 11 }}>Loading...</div>}
                <iframe
                  src={currentUrl}
                  onLoad={() => setLoadingFrame(false)}
                  title="In-app browser"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
                />
              </>
            )}
          </div>

          <div style={{ borderLeft: isMobile ? "none" : `1px solid ${T.borderSub}`, borderTop: isMobile ? `1px solid ${T.borderSub}` : "none", padding: 14, background: "rgba(255,255,255,0.025)", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>Quick save</div>
              {metaState === "checking" && <span style={{ fontSize: 11, color: T.text4 }}>Reading link...</span>}
              {metaState === "fail" && <span style={{ fontSize: 11, color: T.text4 }}>Manual save</span>}
            </div>

            {metadata?.thumbnail && (
              <img src={`/api/media?url=${encodeURIComponent(metadata.thumbnail)}`} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 10 }} />
            )}

            <div style={{ fontSize: 15, fontWeight: 600, color: T.text1, lineHeight: 1.3, marginBottom: 6, wordBreak: "break-word" }}>
              {metadata?.title || currentHost || "No page selected"}
            </div>
            <div style={{ fontSize: 12, color: T.text4, lineHeight: 1.45, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {metadata?.description || (currentUrl ? currentUrl : "Search or paste a link to begin.")}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 10 }}>
              <select value={folder} onChange={(e) => setFolder(e.target.value)} style={{ width: "100%", minWidth: 0, padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}>
                <option value="" style={{ background: "#111" }}>No folder</option>
                {folders.map((f) => <option key={f.name} value={f.name} style={{ background: "#111" }}>{f.name}</option>)}
              </select>
              <button onClick={() => setNewFolderName((v) => v ? "" : " ")} style={{ padding: "0 11px", borderRadius: 10, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.07)", color: T.text1, cursor: "pointer", fontSize: 12, fontWeight: 700 }} title="Add folder">
                + Folder
              </button>
            </div>

            {newFolderName !== "" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 10 }}>
                <input
                  value={newFolderName.trimStart()}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateFolder(); } }}
                  style={{ minWidth: 0, padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
                />
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || creatingFolder}
                  style={{ padding: "0 12px", borderRadius: 10, border: `1px solid ${T.border}`, background: newFolderName.trim() ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: newFolderName.trim() ? T.text1 : T.text4, cursor: newFolderName.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700 }}
                >
                  {creatingFolder ? "Adding..." : "Add"}
                </button>
              </div>
            )}

            <button onClick={saveCurrent} disabled={!currentUrl || saving} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: currentUrl ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: currentUrl ? T.text1 : T.text4, cursor: currentUrl ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14 }}>
              {saving ? "Saving..." : "Save link to Vault"}
            </button>

            <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)", color: T.text4, fontSize: 11, lineHeight: 1.45 }}>
              Some sites block iframe viewing. The save button still uses server-side metadata, so you can save the link even when the preview refuses to load.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const toolBtn = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)",
  color: T.text2,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
