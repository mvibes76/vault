"use client";
import { useState, useEffect, useRef } from "react";
import Icon from "./Icons";
import { itemKey } from "@/lib/utils";
import { getSourceMeta, isPlayable } from "@/lib/sources";
import { T } from "@/lib/theme";

export default function QuickAddModal({ onAdd, onClose }) {
  const [url, setUrl]     = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote]   = useState("");
  const [tags, setTags]   = useState("");
  const [pasting, setPasting] = useState(false);
  const urlRef = useRef(null);

  // Read clipboard on mount
  useEffect(() => {
    const read = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text?.startsWith("http")) setUrl(text.trim());
      } catch {}
      urlRef.current?.focus();
    };
    read();
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const meta = url ? getSourceMeta(url) : null;
  const playable = url ? isPlayable(url) : false;

  const handlePaste = async () => {
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (text?.trim()) setUrl(text.trim());
    } catch {}
    setPasting(false);
  };

  const handleAdd = async () => {
    if (!url.trim() || !playable) return;
    const item = {
      id: `qa-${Date.now()}`,
      key: itemKey(url.trim()),
      url: url.trim(),
      title: title.trim() || url.trim(),
      note: note.trim(),
      tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      source: meta?.id,
      tab: "Quick Adds",
      isQuickAdd: true,
      addedAt: new Date().toISOString(),
    };
    onAdd(item);
    // Fire-and-forget sheet sync (optional Apps Script webhook)
    fetch("/api/sheets-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "quick_add",
        url: item.url, title: item.title, note: item.note,
        tags: item.tags.join(", "), type: item.source,
      }),
    }).catch(() => {});
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
        fontFamily: "Inter, sans-serif",
        maxWidth: 540, margin: "0 auto",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ padding: "4px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.text1 }}>Add to Vault</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ padding: "0 20px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={urlRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a video URL..."
              style={{ flex: 1, padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 14, outline: "none", fontFamily: "monospace" }}
            />
            <button onClick={handlePaste} disabled={pasting} style={{ padding: "11px 14px", background: "rgba(255,255,255,0.07)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text2, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              Paste
            </button>
          </div>

          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            style={{ padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 14, outline: "none" }}
          />

          <input
            value={tags} onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            style={{ padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
          />

          <input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            style={{ padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
          />

          {/* Detected source */}
          {url && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: playable ? T.text3 : "#ff6b6b" }}>
              {playable
                ? <>Detected as <span style={{ color: meta.color, fontWeight: 600 }}>{meta.name}</span></>
                : <>That URL isn't playable inside the vault.</>}
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={!playable}
            style={{
              padding: "13px",
              background: playable ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${playable ? "rgba(255,255,255,0.18)" : T.border}`,
              borderRadius: 12,
              color: playable ? T.text1 : T.text4,
              fontSize: 15, fontWeight: 600,
              cursor: playable ? "pointer" : "not-allowed",
              marginTop: 4,
            }}
          >
            Add to Vault
          </button>
        </div>
      </div>
    </>
  );
}
