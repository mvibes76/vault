"use client";
import { useState, useEffect, useRef } from "react";
import Icon from "./Icons";
import { detectType, typeLabel, itemKey } from "@/lib/utils";
import { T } from "@/lib/theme";

const SUPPORTED_TYPES = ["youtube","vimeo","video","audio","music","image","gallery","instagram","tiktok","link"];

export default function QuickAddModal({ onAdd, onClose }) {
  const [url,   setUrl]   = useState("");
  const [title, setTitle] = useState("");
  const [type,  setType]  = useState("");
  const [note,  setNote]  = useState("");
  const [tags,  setTags]  = useState("");
  const [pasting, setPasting] = useState(false);
  const urlRef = useRef(null);

  // Read clipboard on mount
  useEffect(() => {
    const read = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text?.startsWith("http")) {
          setUrl(text.trim());
          const detected = detectType(text.trim());
          setType(detected);
        }
      } catch {}
      urlRef.current?.focus();
    };
    read();
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Re-detect type when URL changes
  useEffect(() => {
    if (url) setType(detectType(url));
  }, [url]);

  const handlePaste = async () => {
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (text?.trim()) {
        setUrl(text.trim());
        setType(detectType(text.trim()));
      }
    } catch {}
    setPasting(false);
  };

  const handleAdd = async () => {
    if (!url.trim()) return;
    const finalType = SUPPORTED_TYPES.includes(type) ? type : detectType(url) || "link";
    const item = {
      id: `qa-${Date.now()}`,
      key: itemKey(url.trim()),
      url: url.trim(),
      title: title.trim() || url.trim(),
      note: note.trim(),
      tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      type: finalType,
      tab: "Quick Adds",
      isQuickAdd: true,
      addedAt: new Date().toISOString(),
    };
    onAdd(item);
    // Fire-and-forget — sync to Google Sheet if webhook is configured
    // This routes the item to the "Quick Adds" tab in your linked sheet
    fetch("/api/sheets-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "quick_add",
        url: item.url,
        title: item.title,
        note: item.note,
        tags: item.tags.join(", "),
        type: item.type,
      }),
    }).catch(() => {}); // never block on this
    onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1098, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1099,
        background: "rgba(10,10,10,0.97)", backdropFilter: "blur(24px)",
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: `1px solid ${T.border}`,
        paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
        fontFamily: "Inter, sans-serif"
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ padding: "4px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.text1 }}>Add to Vault</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* URL row */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={urlRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a URL..."
              style={{ flex: 1, padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 14, outline: "none", fontFamily: "monospace" }}
            />
            <button onClick={handlePaste} disabled={pasting} style={{ padding: "11px 14px", background: "rgba(255,255,255,0.07)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text2, fontSize: 12, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}>
              Paste
            </button>
          </div>

          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            style={{ padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 14, outline: "none" }}
          />

          {/* Type + Tags row */}
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={{ flex: 1, padding: "11px 12px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: type ? T.text1 : T.text3, fontSize: 13, outline: "none", cursor: "pointer" }}
            >
              <option value="">Auto-detect type</option>
              {SUPPORTED_TYPES.map((t) => <option key={t} value={t}>{typeLabel[t] || t}</option>)}
            </select>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags (comma-separated)"
              style={{ flex: 1, padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
            />
          </div>

          {/* Note */}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            style={{ padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
          />

          {/* Detected type badge */}
          {url && type && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text3 }}>
              <Icon name="audioLines" size={11} />
              Detected as <span style={{ color: T.text2, fontWeight: 500 }}>{typeLabel[type] || type}</span>
            </div>
          )}

          {/* Add button */}
          <button
            onClick={handleAdd}
            disabled={!url.trim()}
            style={{
              padding: "13px", background: url.trim() ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${url.trim() ? "rgba(255,255,255,0.18)" : T.border}`,
              borderRadius: 12, color: url.trim() ? T.text1 : T.text4,
              fontSize: 15, fontWeight: 600, cursor: url.trim() ? "pointer" : "not-allowed",
              marginTop: 4
            }}
          >
            Add to Vault
          </button>
        </div>
      </div>
    </>
  );
}
