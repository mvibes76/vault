"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icons";
import { itemKey, proxiedMediaUrl } from "@/lib/utils";
import { getSourceMeta } from "@/lib/sources";

function useDialogFocus(open, onClose, ref) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const root = ref.current;
    const first = root.querySelector("input,select,textarea,button,[href]");
    first?.focus();
    const handler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [...root.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!nodes.length) return;
      const firstNode = nodes[0], lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault(); lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault(); firstNode.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, ref]);
}

export default function AddMediaSheet({
  open,
  onClose,
  onSave,
  folders = [],
  onCreateCollection,
  initialItem = null,
}) {
  const dialogRef = useRef(null);
  useDialogFocus(open, onClose, dialogRef);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [coverMode, setCoverMode] = useState("auto");
  const [metadata, setMetadata] = useState(null);
  const [metaState, setMetaState] = useState("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newCollection, setNewCollection] = useState("");

  useEffect(() => {
    if (!open) return;
    setUrl(initialItem?.url || "");
    setTitle(initialItem?.title || "");
    setFolder(initialItem?.folder || "");
    setNote(initialItem?.note || "");
    setTags(Array.isArray(initialItem?.tags) ? initialItem.tags.join(", ") : "");
    setThumbnail(initialItem?.thumbnail || "");
    setCoverMode(initialItem?.cover_mode || "auto");
    setMetadata(null);
    setMetaState("idle");
    setError("");
    setNewCollection("");
  }, [open, initialItem]);

  useEffect(() => {
    if (!open) return;
    const target = url.trim();
    if (!/^https?:\/\//i.test(target)) {
      setMetadata(null); setMetaState("idle"); return;
    }
    let cancelled = false;
    setMetaState("loading");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/metadata?url=${encodeURIComponent(target)}`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || "Preview unavailable");
        setMetadata(data);
        setMetaState("ok");
        setTitle((current) => current || data.title || "");
      } catch {
        if (!cancelled) {
          setMetadata(null);
          setMetaState("error");
        }
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [url, open]);

  const source = useMemo(() => getSourceMeta(url || ""), [url]);
  const preview = coverMode === "manual"
    ? thumbnail.trim()
    : (metadata?.thumbnail || thumbnail || initialItem?.thumbnail || "");
  const valid = /^https?:\/\//i.test(url.trim());

  const createCollection = async () => {
    const name = newCollection.trim();
    if (!name) return;
    try {
      await onCreateCollection?.(name);
      setFolder(name);
      setNewCollection("");
    } catch (e) {
      setError(e?.message || "Could not create collection");
    }
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    const cleanUrl = url.trim();
    const resolvedThumb = coverMode === "manual"
      ? thumbnail.trim()
      : (metadata?.thumbnail || thumbnail || initialItem?.thumbnail || "");
    const next = {
      ...(initialItem || {}),
      id: initialItem?.id || `qa-${Date.now()}`,
      key: itemKey(cleanUrl),
      previousKey: initialItem?.key,
      url: cleanUrl,
      title: title.trim() || metadata?.title || cleanUrl,
      note: note.trim(),
      tags: tags.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
      source: source.id,
      folder: folder || null,
      thumbnail: resolvedThumb,
      thumbnail_source: coverMode === "manual" ? "manual" : (metadata?.thumbnail ? "metadata" : initialItem?.thumbnail_source || null),
      cover_mode: coverMode,
      cover_fit: initialItem?.cover_fit || "cover",
      cover_position_x: Number(initialItem?.cover_position_x ?? 50),
      cover_position_y: Number(initialItem?.cover_position_y ?? 50),
      type: metadata?.type || initialItem?.type || "link",
      isVaultItem: true,
      addedAt: initialItem?.addedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await onSave(next);
      onClose();
    } catch (e) {
      setError(e?.message || "This item was not saved. Your draft is still here.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="v2-backdrop" onMouseDown={onClose} aria-hidden="true" />
      <section
        ref={dialogRef}
        className="v2-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v2-add-title"
      >
        <div className="v2-sheet-head">
          <div>
            <div className="v2-modal-title" id="v2-add-title">{initialItem ? "Edit media" : "Add to Vault"}</div>
            <div className="v2-hint">Paste a link. Vault will save it even if a preview is unavailable.</div>
          </div>
          <button type="button" className="v2-iconbtn" onClick={onClose} aria-label="Close add media">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="v2-sheet-body">
          {error ? <div className="v2-error" role="alert"><span>{error}</span></div> : null}

          <div className="v2-field">
            <label htmlFor="v2-add-url">URL</label>
            <input
              id="v2-add-url"
              className="v2-input"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          {valid ? (
            <div style={{ display: "grid", gridTemplateColumns: "88px minmax(0,1fr)", gap: 13, alignItems: "center", margin: "12px 0 18px" }}>
              <div style={{ width: 88, aspectRatio: "4 / 5", borderRadius: 12, overflow: "hidden", background: "#171719", border: "1px solid var(--v2-border)", display: "grid", placeItems: "center" }}>
                {preview ? <img src={proxiedMediaUrl(preview)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="link" size={24} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 680 }}>{title || metadata?.title || "Untitled media"}</div>
                <div className="v2-hint" style={{ marginTop: 5 }}>
                  {metaState === "loading" ? "Checking preview…" : metaState === "error" ? "Preview unavailable — reference can still be saved" : source.name}
                </div>
              </div>
            </div>
          ) : null}

          <div className="v2-field">
            <label htmlFor="v2-add-title-input">Title</label>
            <input id="v2-add-title-input" className="v2-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional — filled from metadata when available" />
          </div>

          <div className="v2-field">
            <label htmlFor="v2-add-folder">Collection</label>
            <select id="v2-add-folder" className="v2-select" value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">Inbox</option>
              {folders.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "end" }}>
            <div className="v2-field" style={{ marginBottom: 0 }}>
              <label htmlFor="v2-new-collection">New collection</label>
              <input id="v2-new-collection" className="v2-input" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} placeholder="Collection name" />
            </div>
            <button type="button" className="v2-btn" onClick={createCollection} disabled={!newCollection.trim()}>Create</button>
          </div>

          <details className="v2-details">
            <summary>Details</summary>
            <div className="v2-field">
              <label htmlFor="v2-note">Notes</label>
              <textarea id="v2-note" className="v2-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you saved this, context, reference notes…" />
            </div>
            <div className="v2-field">
              <label htmlFor="v2-tags">Tags</label>
              <input id="v2-tags" className="v2-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="reference, lighting, edit" />
            </div>
            <div className="v2-field">
              <label htmlFor="v2-cover-mode">Cover</label>
              <select id="v2-cover-mode" className="v2-select" value={coverMode} onChange={(e) => setCoverMode(e.target.value)}>
                <option value="auto">Automatic preview</option>
                <option value="original">Keep current/original</option>
                <option value="manual">Custom image URL</option>
              </select>
            </div>
            {coverMode === "manual" ? (
              <div className="v2-field">
                <label htmlFor="v2-cover-url">Cover image URL</label>
                <input id="v2-cover-url" className="v2-input" value={thumbnail} onChange={(e) => setThumbnail(e.target.value)} placeholder="https://…" />
              </div>
            ) : null}
          </details>
        </div>

        <div className="v2-sheet-foot">
          <button type="button" className="v2-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="v2-btn v2-btn-primary" onClick={submit} disabled={!valid || saving}>
            {saving ? "Saving…" : initialItem ? "Save changes" : "Save to Vault"}
          </button>
        </div>
      </section>
    </>
  );
}
