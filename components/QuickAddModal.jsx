"use client";
import { useState, useEffect, useRef } from "react";
import Icon from "./Icons";
import { itemKey } from "@/lib/utils";
import { getSourceMeta } from "@/lib/sources";
import { T } from "@/lib/theme";

export default function QuickAddModal({ onAdd, onClose, folders = [], onCreateFolder, initialItem = null, mode = "add" }) {
  const [url, setUrl]     = useState(initialItem?.url || "");
  const [title, setTitle] = useState(initialItem?.title || "");
  const [note, setNote]   = useState(initialItem?.note || "");
  const [tags, setTags]   = useState(Array.isArray(initialItem?.tags) ? initialItem.tags.join(", ") : "");
  const [folder, setFolder] = useState(initialItem?.folder || "");
  const [coverMode, setCoverMode] = useState(initialItem?.cover_mode || (initialItem?.thumbnail_source === "manual" || initialItem?.thumbnail_source === "sheet" ? "manual" : "auto"));
  const [thumbnail, setThumbnail] = useState(initialItem?.thumbnail_source === "cover_library" ? "" : (initialItem?.thumbnail || ""));
  const [coverFit, setCoverFit] = useState(initialItem?.cover_fit || "cover");
  const [coverX, setCoverX] = useState(Number.isFinite(Number(initialItem?.cover_position_x)) ? Number(initialItem.cover_position_x) : 50);
  const [coverY, setCoverY] = useState(Number.isFinite(Number(initialItem?.cover_position_y)) ? Number(initialItem.cover_position_y) : 50);
  const [pasting, setPasting] = useState(false);
  const [preflight, setPreflight] = useState({ state: "idle", msg: "" }); // idle | checking | ok | fail
  const [metadata, setMetadata] = useState(null);
  const [metadataState, setMetadataState] = useState("idle");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const urlRef = useRef(null);

  // Read clipboard on mount
  useEffect(() => {
    const read = async () => {
      if (!initialItem) {
        try {
          const text = await navigator.clipboard.readText();
          if (text?.startsWith("http")) setUrl(text.trim());
        } catch {}
      }
      urlRef.current?.focus();
    };
    read();
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, initialItem]);

  const meta = url ? getSourceMeta(url) : null;
  const isKnown = meta && meta.id !== "extract";
  const isExtract = meta?.id === "extract";

  // Pre-flight is informational only. v12 stores any safe URL, playable or not.
  useEffect(() => {
    if (!url.trim()) { setPreflight({ state: "idle", msg: "" }); return; }
    if (isKnown)    { setPreflight({ state: "ok", msg: "" }); return; }
    if (!isExtract) { setPreflight({ state: "fail", msg: "Not a valid URL" }); return; }

    let cancelled = false;
    setPreflight({ state: "checking", msg: "" });
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/extract?url=${encodeURIComponent(url.trim())}`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok && j.sources?.length) {
          setPreflight({ state: "ok", msg: `Found ${j.sources.length} stream${j.sources.length > 1 ? "s" : ""}` });
        } else {
          setPreflight({ state: "fail", msg: j.error || "No playable video found on that page" });
        }
      } catch (e) {
        if (!cancelled) setPreflight({ state: "fail", msg: e.message || "Couldn't check this URL" });
      }
    }, 600); // debounce typing
    return () => { cancelled = true; clearTimeout(t); };
  }, [url, isKnown, isExtract]);

  // Metadata prefill: reads title/description/thumbnail server-side and fills empty fields.
  useEffect(() => {
    const target = url.trim();
    if (!/^https?:\/\//i.test(target)) { setMetadata(null); setMetadataState("idle"); return; }
    let cancelled = false;
    setMetadataState("checking");
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/metadata?url=${encodeURIComponent(target)}`);
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(j.error || "Metadata unavailable");
        setMetadata(j);
        setMetadataState("ok");
        setTitle((prev) => prev || j.title || "");
        setNote((prev) => prev || j.description || "");
        setThumbnail((prev) => prev || (coverMode !== "auto" ? j.thumbnail || "" : ""));
      } catch {
        if (!cancelled) { setMetadata(null); setMetadataState("fail"); }
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [url, coverMode]);

  const canAdd = /^https?:\/\//i.test(url.trim());

  const handlePaste = async () => {
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (text?.trim()) setUrl(text.trim());
    } catch {}
    setPasting(false);
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

  const handleAdd = async () => {
    if (!canAdd) return;
    const manualThumb = thumbnail.trim();
    const autoThumb = metadata?.thumbnail || "";
    const resolvedThumb = coverMode === "manual"
      ? manualThumb
      : coverMode === "original"
        ? (manualThumb || autoThumb || initialItem?.thumbnail || "")
        : (autoThumb || initialItem?.thumbnail || "");
    const thumbSource = coverMode === "manual"
      ? "manual"
      : coverMode === "original"
        ? (manualThumb ? "original" : autoThumb ? "metadata" : initialItem?.thumbnail_source || null)
        : (autoThumb ? "metadata" : initialItem?.thumbnail_source || null);
    const item = {
      id: `qa-${Date.now()}`,
      key: itemKey(url.trim()),
      previousKey: initialItem?.key,
      url: url.trim(),
      title: title.trim() || url.trim(),
      note: note.trim(),
      tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      source: meta?.id,
      thumbnail: resolvedThumb,
      thumbnail_source: thumbSource,
      cover_mode: coverMode,
      cover_fit: coverFit,
      cover_position_x: Number(coverX) || 50,
      cover_position_y: Number(coverY) || 50,
      type: metadata?.type || initialItem?.type || "link",
      siteName: metadata?.siteName || "",
      folder: folder || null,
      tab: folder || "Vault Library",
      isVaultItem: true,
      addedAt: initialItem?.addedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onAdd(item);
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
        maxHeight: "92dvh", overflowY: "auto",
        boxShadow: "0 -24px 80px rgba(0,0,0,0.65)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ padding: "4px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text1 }}>{mode === "edit" ? "Edit item" : "Add media"}</div>
            <div style={{ fontSize: 11, color: T.text4, marginTop: 2 }}>{mode === "edit" ? "Update the saved link, cover, folder, or notes." : "Paste once. Supabase saves the real vault record."}</div>
          </div>
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
              placeholder="Paste any media or reference URL..."
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              style={{ minWidth: 0, padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
            >
              <option value="" style={{ background: "#111" }}>No folder</option>
              {folders.map((f) => <option key={f.name} value={f.name} style={{ background: "#111" }}>{f.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setNewFolderName((v) => v ? "" : " ")}
              style={{ padding: "0 12px", background: "rgba(255,255,255,0.08)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 700 }}
              title="Add folder"
            >
              <Icon name="plus" size={14} /> Folder
            </button>
          </div>

          {newFolderName !== "" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input
                value={newFolderName.trimStart()}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder name"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateFolder(); } }}
                style={{ padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                style={{ padding: "0 14px", background: newFolderName.trim() ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 10, color: newFolderName.trim() ? T.text1 : T.text4, cursor: newFolderName.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700 }}
              >
                {creatingFolder ? "Adding..." : "Add"}
              </button>
            </div>
          )}

          <input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            style={{ padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
          />

          <div style={{ border: `1px solid ${T.borderSub}`, borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.035)", display: "grid", gap: 9 }}>
            <div style={{ fontSize: 11, color: T.text3, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Cover behavior</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {[
                ["auto", "Auto"],
                ["original", "Original"],
                ["manual", "Custom"],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setCoverMode(value)} style={{ padding: "8px 6px", borderRadius: 9, border: `1px solid ${coverMode === value ? T.borderHov : T.border}`, background: coverMode === value ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: coverMode === value ? T.text1 : T.text4, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: T.text4, lineHeight: 1.35 }}>
              Auto uses your Cover Library. Original keeps the source/metadata cover. Custom bypasses automatic covers.
            </div>

            {coverMode !== "auto" && (
              <input
                value={thumbnail} onChange={(e) => setThumbnail(e.target.value)}
                placeholder={coverMode === "original" ? "Original cover URL, optional" : "Custom cover image URL"}
                style={{ padding: "11px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" }}
              />
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" onClick={() => setCoverFit("cover")} style={{ padding: "8px 10px", borderRadius: 9, border: `1px solid ${coverFit === "cover" ? T.borderHov : T.border}`, background: coverFit === "cover" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: coverFit === "cover" ? T.text1 : T.text4, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Fill crop</button>
              <button type="button" onClick={() => setCoverFit("contain")} style={{ padding: "8px 10px", borderRadius: 9, border: `1px solid ${coverFit === "contain" ? T.borderHov : T.border}`, background: coverFit === "contain" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", color: coverFit === "contain" ? T.text1 : T.text4, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Fit full</button>
            </div>
            {coverFit === "cover" && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 10, color: T.text4 }}>Horizontal crop {coverX}%</label>
                <input type="range" min="0" max="100" value={coverX} onChange={(e) => setCoverX(e.target.value)} />
                <label style={{ fontSize: 10, color: T.text4 }}>Vertical crop {coverY}%</label>
                <input type="range" min="0" max="100" value={coverY} onChange={(e) => setCoverY(e.target.value)} />
              </div>
            )}
          </div>

          {(thumbnail || metadata?.thumbnail) && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.borderSub}` }}>
              <img src={`/api/media?url=${encodeURIComponent(thumbnail || metadata?.thumbnail)}`} alt="" style={{ width: 72, aspectRatio: "4 / 5", objectFit: coverFit, objectPosition: `${coverX}% ${coverY}%`, borderRadius: 7, flexShrink: 0, background: "#050505" }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title || metadata?.title || "Cover preview"}</div>
                <div style={{ fontSize: 10, color: T.text4, marginTop: 2 }}>{coverMode === "auto" ? "Auto cover preview" : coverMode === "original" ? "Original/source cover" : "Custom cover"}</div>
              </div>
            </div>
          )}

          {url && metadataState === "checking" && <div style={{ color: T.text4, fontSize: 11 }}>Reading title and preview...</div>}

          {/* Detected source + pre-flight status */}
          {url && meta && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
              <span style={{ color: T.text2 }}>{meta.name}</span>
              {isKnown && (
                <span style={{ color: T.green, display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                  <Icon name="check" size={12} strokeWidth={2.5} /> Will play
                </span>
              )}
              {isExtract && preflight.state === "checking" && (
                <span style={{ color: T.text3, display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                  <span style={{ width: 11, height: 11, border: "1.5px solid rgba(255,255,255,0.15)", borderTopColor: T.text2, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Checking...
                </span>
              )}
              {isExtract && preflight.state === "ok" && (
                <span style={{ color: T.green, display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                  <Icon name="check" size={12} strokeWidth={2.5} /> {preflight.msg || "Playable"}
                </span>
              )}
              {isExtract && preflight.state === "fail" && (
                <span style={{ color: T.text4, marginLeft: "auto", textAlign: "right", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Saved as reference
                </span>
              )}
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={!canAdd}
            style={{
              padding: "13px",
              background: canAdd ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${canAdd ? "rgba(255,255,255,0.18)" : T.border}`,
              borderRadius: 12,
              color: canAdd ? T.text1 : T.text4,
              fontSize: 15, fontWeight: 600,
              cursor: canAdd ? "pointer" : "not-allowed",
              marginTop: 4,
            }}
          >
            {mode === "edit" ? "Save Changes" : "Add to Vault"}
          </button>
        </div>
      </div>
    </>
  );
}
