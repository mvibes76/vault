"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icons";
import { itemKey, proxiedMediaUrl } from "@/lib/utils";
import { getSourceMeta } from "@/lib/sources";
import {
  uploadVaultMedia,
  deleteVaultMedia,
  isVaultMediaLocator,
} from "@/lib/supabase";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

function titleFromFile(file) {
  return String(file?.name || "")
    .replace(/\.[A-Za-z0-9]{1,8}$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function readableSize(bytes) {
  const mb = Number(bytes || 0) / (1024 * 1024);
  return mb < 1 ? `${Math.max(1, Math.round(Number(bytes || 0) / 1024))} KB` : `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export default function AddMediaSheet({
  open,
  onClose,
  onSave,
  folders = [],
  onCreateCollection,
  initialItem = null,
  userId = null,
}) {
  const dialogRef = useRef(null);
  const fileInputRef = useRef(null);
  useDialogFocus(open, onClose, dialogRef);

  const [mode, setMode] = useState("url");
  const [file, setFile] = useState(null);
  const [localPreview, setLocalPreview] = useState("");
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
  const [uploadStage, setUploadStage] = useState("");
  const [error, setError] = useState("");
  const [newCollection, setNewCollection] = useState("");

  const initialCanonical = initialItem?.canonical_url || initialItem?.url || "";
  const initialUploaded = !!initialItem?.isUploadedMedia || isVaultMediaLocator(initialCanonical);

  useEffect(() => {
    if (!open) return;
    setMode(initialUploaded ? "upload" : "url");
    setFile(null);
    setLocalPreview("");
    setUrl(initialUploaded ? initialCanonical : (initialItem?.url || ""));
    setTitle(initialItem?.title || "");
    setFolder(initialItem?.folder || "");
    setNote(initialItem?.note || "");
    setTags(Array.isArray(initialItem?.tags) ? initialItem.tags.join(", ") : "");
    setThumbnail(initialItem?.thumbnail || "");
    setCoverMode(initialItem?.cover_mode || "auto");
    setMetadata(null);
    setMetaState("idle");
    setError("");
    setUploadStage("");
    setNewCollection("");
  }, [open, initialItem, initialCanonical, initialUploaded]);

  useEffect(() => {
    if (!file) {
      setLocalPreview("");
      return;
    }
    const next = URL.createObjectURL(file);
    setLocalPreview(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  useEffect(() => {
    if (!open || mode !== "url") return;
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
  }, [url, open, mode]);

  const source = useMemo(() => getSourceMeta(url || ""), [url]);
  const urlPreview = coverMode === "manual"
    ? thumbnail.trim()
    : (metadata?.thumbnail || thumbnail || initialItem?.thumbnail || "");
  const existingUploadPreview = initialUploaded ? (initialItem?.thumbnail || initialItem?.url || "") : "";
  const uploadPreview = localPreview || existingUploadPreview;

  const validUrl = /^https?:\/\//i.test(url.trim());
  const validUpload = !!file || initialUploaded;
  const valid = mode === "upload" ? validUpload : validUrl;

  const selectFile = (nextFile) => {
    setError("");
    if (!nextFile) {
      setFile(null);
      return;
    }
    const mime = String(nextFile.type || "").toLowerCase();
    if (!/^(image|video|audio)\//.test(mime)) {
      setFile(null);
      setError("Choose an image, video, or audio file.");
      return;
    }
    if (Number(nextFile.size || 0) > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError("This file is larger than the 50 MB Supabase Free-plan upload limit.");
      return;
    }
    setFile(nextFile);
    setTitle((current) => current || titleFromFile(nextFile));
    setMode("upload");
  };

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

  const commonFields = () => ({
    note: note.trim(),
    tags: tags.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
    folder: folder || null,
    cover_mode: coverMode,
    cover_fit: initialItem?.cover_fit || "cover",
    cover_position_x: Number(initialItem?.cover_position_x ?? 50),
    cover_position_y: Number(initialItem?.cover_position_y ?? 50),
    isVaultItem: true,
    addedAt: initialItem?.addedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const submitUrl = async () => {
    const cleanUrl = url.trim();
    const resolvedThumb = coverMode === "manual"
      ? thumbnail.trim()
      : (metadata?.thumbnail || thumbnail || initialItem?.thumbnail || "");
    const next = {
      ...(initialItem || {}),
      ...commonFields(),
      id: initialItem?.id || `qa-${Date.now()}`,
      key: itemKey(cleanUrl),
      previousKey: initialItem?.key,
      canonical_url: cleanUrl,
      canonical_thumbnail: resolvedThumb,
      url: cleanUrl,
      title: title.trim() || metadata?.title || cleanUrl,
      source: source.id,
      thumbnail: resolvedThumb,
      thumbnail_source: coverMode === "manual" ? "manual" : (metadata?.thumbnail ? "metadata" : initialItem?.thumbnail_source || null),
      type: metadata?.type || initialItem?.type || "link",
      isUploadedMedia: false,
      storage_path: null,
    };

    await onSave(next);
    if (initialUploaded && userId && initialCanonical && initialCanonical !== cleanUrl) {
      deleteVaultMedia(userId, initialCanonical).catch(() => {});
    }
  };

  const submitUpload = async () => {
    if (!userId) throw new Error("Sign in before uploading files");

    if (!file && initialUploaded) {
      const next = {
        ...(initialItem || {}),
        ...commonFields(),
        title: title.trim() || initialItem?.title || "Uploaded media",
        note: note.trim(),
        tags: tags.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
      };
      await onSave(next);
      return;
    }

    if (!file) throw new Error("Choose a file to upload");
    setUploadStage("Uploading privately…");
    const uploaded = await uploadVaultMedia(userId, file);
    const image = uploaded.type === "image";
    const next = {
      ...(initialItem || {}),
      ...commonFields(),
      id: initialItem?.id || `upload-${Date.now()}`,
      key: itemKey(uploaded.locator),
      previousKey: initialItem?.key,
      canonical_url: uploaded.locator,
      canonical_thumbnail: image ? uploaded.locator : "",
      storage_path: uploaded.path,
      isUploadedMedia: true,
      url: uploaded.signedUrl,
      title: title.trim() || titleFromFile(file) || "Uploaded media",
      source: "upload",
      type: uploaded.type,
      thumbnail: image ? uploaded.signedUrl : "",
      thumbnail_source: image ? "upload" : null,
    };

    try {
      setUploadStage("Saving to Vault…");
      await onSave(next);
      if (initialUploaded && initialCanonical && initialCanonical !== uploaded.locator) {
        deleteVaultMedia(userId, initialCanonical).catch(() => {});
      }
    } catch (e) {
      await deleteVaultMedia(userId, uploaded.locator).catch(() => {});
      throw e;
    }
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    setUploadStage("");
    try {
      if (mode === "upload") await submitUpload();
      else await submitUrl();
      onClose();
    } catch (e) {
      setError(e?.message || "This item was not saved. Your draft is still here.");
    } finally {
      setSaving(false);
      setUploadStage("");
    }
  };

  if (!open) return null;

  const selectedKind = String(file?.type || initialItem?.type || "").split("/")[0] || initialItem?.type || "file";

  return (
    <>
      <div className="v2-backdrop" onMouseDown={onClose} aria-hidden="true" />
      <section ref={dialogRef} className="v2-sheet" role="dialog" aria-modal="true" aria-labelledby="v2-add-title">
        <div className="v2-sheet-head">
          <div>
            <div className="v2-modal-title" id="v2-add-title">{initialItem ? "Edit media" : "Add to Vault"}</div>
            <div className="v2-hint">{mode === "upload" ? "Upload privately to Vault Storage." : "Paste a link. Vault saves it even when a preview is unavailable."}</div>
          </div>
          <button type="button" className="v2-iconbtn" onClick={onClose} aria-label="Close add media">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="v2-sheet-body">
          {error ? <div className="v2-error" role="alert"><span>{error}</span></div> : null}

          <div className="v2-add-paths" role="tablist" aria-label="Add media method">
            <button type="button" role="tab" aria-selected={mode === "url"} className={`v2-add-path ${mode === "url" ? "is-active" : ""}`} onClick={() => setMode("url")}>
              <Icon name="link" size={15}/> Paste URL
            </button>
            <button type="button" role="tab" aria-selected={mode === "upload"} className={`v2-add-path ${mode === "upload" ? "is-active" : ""}`} onClick={() => setMode("upload")}>
              <Icon name="plus" size={15}/> Upload File
            </button>
          </div>

          {mode === "url" ? (
            <>
              <div className="v2-field">
                <label htmlFor="v2-add-url">URL</label>
                <input id="v2-add-url" className="v2-input" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>

              {validUrl ? (
                <div className="v2-add-preview">
                  <div className="v2-add-preview-art">
                    {urlPreview ? <img src={proxiedMediaUrl(urlPreview)} alt="" /> : <Icon name="link" size={24} />}
                  </div>
                  <div>
                    <div className="v2-add-preview-title">{title || metadata?.title || "Untitled media"}</div>
                    <div className="v2-hint" style={{ marginTop: 5 }}>
                      {metaState === "loading" ? "Checking preview…" : metaState === "error" ? "Preview unavailable — reference can still be saved" : source.name}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" hidden onChange={(e) => selectFile(e.target.files?.[0] || null)} />
              <button type="button" className="v2-upload-drop" onClick={() => fileInputRef.current?.click()}>
                <Icon name={selectedKind === "video" ? "video" : selectedKind === "image" ? "grid" : "plus"} size={28}/>
                <strong>{file ? file.name : initialUploaded ? "Replace uploaded file" : "Choose from Photos or Files"}</strong>
                <span>{file ? `${readableSize(file.size)} · ${file.type || "media"}` : "Images, video, or audio · 50 MB max"}</span>
              </button>

              {uploadPreview ? (
                <div className="v2-upload-preview">
                  {String(file?.type || initialItem?.type || "").startsWith("video") || initialItem?.type === "video"
                    ? <video src={uploadPreview} controls playsInline preload="metadata" />
                    : String(file?.type || "").startsWith("audio") || initialItem?.type === "audio"
                      ? <audio src={uploadPreview} controls preload="metadata" />
                      : <img src={uploadPreview} alt="" />}
                </div>
              ) : null}

              {uploadStage ? <div className="v2-upload-status" role="status"><span className="v2-upload-spinner"/>{uploadStage}</div> : null}
            </>
          )}

          <div className="v2-field">
            <label htmlFor="v2-add-title-input">Title</label>
            <input id="v2-add-title-input" className="v2-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === "upload" ? "Defaults to file name" : "Optional — filled from metadata when available"} />
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
            {mode === "url" ? (
              <>
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
              </>
            ) : null}
          </details>
        </div>

        <div className="v2-sheet-foot">
          <button type="button" className="v2-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="v2-btn v2-btn-primary" onClick={submit} disabled={!valid || saving}>
            {saving ? (uploadStage || "Saving…") : initialItem ? "Save changes" : mode === "upload" ? "Upload to Vault" : "Save to Vault"}
          </button>
        </div>
      </section>
    </>
  );
}
