"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icons";
import { getSourceMeta, getThumbCandidates } from "@/lib/sources";
import { proxiedMediaUrl } from "@/lib/utils";
import {
  getItemComments, addItemComment, deleteItemComment,
  getMomentMarks,
} from "@/lib/supabase";

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

function DetailPreview({ item, isImage }) {
  const [metaThumb, setMetaThumb] = useState("");
  const [idx, setIdx] = useState(0);

  const rawCandidates = useMemo(() => {
    const provider = getThumbCandidates(item?.url || "");
    return [...new Set([
      item?.display_thumbnail,
      item?.thumbnail,
      metaThumb,
      ...provider,
      isImage ? item?.url : "",
    ].filter(Boolean))];
  }, [item, isImage, metaThumb]);

  const candidates = useMemo(() => rawCandidates.flatMap((url) => {
    const proxied = proxiedMediaUrl(url);
    return proxied && proxied !== url ? [proxied, url] : [url];
  }), [rawCandidates]);

  useEffect(() => {
    setIdx(0);
    setMetaThumb("");
    if (!item?.url) return;
    let active = true;
    fetch(`/api/metadata?url=${encodeURIComponent(item.url)}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((meta) => {
        if (!active || !meta?.thumbnail) return;
        setMetaThumb(meta.thumbnail);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [item?.key, item?.url]);

  const src = candidates[idx] || "";
  if (!src) return <div className="v2-detail-preview-fallback"><Icon name={isImage ? "grid" : "video"} size={30}/><span>Preview unavailable</span></div>;

  return (
    <img
      key={src}
      src={src}
      alt={item?.title ? `${item.title} preview` : ""}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setIdx((n) => n + 1)}
      style={isImage ? { objectFit:"contain" } : undefined}
    />
  );
}

export default function DetailDrawer({
  item, state = {}, folders = [], userId,
  onClose, onPlay, onFavorite, onFolder, onRating, onEdit, onDelete,
  onNavigate, currentIndex = -1, totalItems = 0,
  activityRevision = 0,
}) {
  const ref = useRef(null);
  const [tab, setTab] = useState("activity");
  const [comments, setComments] = useState([]);
  const [marks, setMarks] = useState([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const swipeStart = useRef(null);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < totalItems - 1;

  const source = useMemo(() => getSourceMeta(item?.url || ""), [item?.url]);
  const isImage = source.id === "image" || String(item?.type || "").toLowerCase().includes("image");
  const duration = Number(state?.duration || 0);
  const progress = Number(state?.progress || 0);
  const progressPct = duration > 0 ? Math.max(0, Math.min(100, progress / duration * 100)) : 0;

  useEffect(() => {
    if (!item || !userId) return;
    let active = true;
    Promise.all([getItemComments(userId, item.key), getMomentMarks(userId, item.key)]).then(([c, m]) => {
      if (!active) return;
      setComments(c || []);
      setMarks(m || []);
    });
    return () => { active = false; };
  }, [item, userId, activityRevision]);

  useEffect(() => {
    if (!item || !ref.current) return;
    const root = ref.current;
    const before = document.activeElement;
    const close = root.querySelector("[data-close]");
    close?.focus();
    const handler = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      const tag = String(document.activeElement?.tagName || "").toLowerCase();
      const editing = tag === "input" || tag === "textarea" || tag === "select" || document.activeElement?.isContentEditable;
      if (!editing && event.key === "ArrowLeft" && hasPrev) { event.preventDefault(); onNavigate?.(currentIndex - 1); return; }
      if (!editing && event.key === "ArrowRight" && hasNext) { event.preventDefault(); onNavigate?.(currentIndex + 1); return; }
      if (event.key !== "Tab") return;
      const nodes = [...root.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); before?.focus?.(); };
  }, [item, onClose, hasPrev, hasNext, currentIndex, onNavigate]);

  if (!item) return null;

  const addComment = async () => {
    const body = comment.trim();
    if (!body || !userId || busy) return;
    setBusy(true);
    try {
      const row = await addItemComment(userId, item.key, body);
      if (row) setComments((x) => [...x, row]);
      setComment("");
    } finally { setBusy(false); }
  };

  const removeComment = async (id) => {
    if (!userId) return;
    await deleteItemComment(userId, id);
    setComments((x) => x.filter((c) => c.id !== id));
  };

  return (
    <>
      <div className="v2-backdrop" onMouseDown={onClose} aria-hidden="true" />
      <aside
        ref={ref}
        className="v2-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v2-detail-title"
        onTouchStart={(e) => {
          const t = e.touches?.[0];
          if (t) swipeStart.current = { x:t.clientX, y:t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = swipeStart.current;
          const t = e.changedTouches?.[0];
          swipeStart.current = null;
          if (!start || !t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) < 72 || Math.abs(dy) > 64) return;
          if (dx < 0 && hasNext) onNavigate?.(currentIndex + 1);
          if (dx > 0 && hasPrev) onNavigate?.(currentIndex - 1);
        }}
      >
        <div className="v2-drawer-head">
          <div className="v2-detail-pager">
            <button type="button" className="v2-iconbtn" onClick={() => onNavigate?.(currentIndex - 1)} disabled={!hasPrev} aria-label="Previous media"><Icon name="chevronLeft" size={18}/></button>
            <span className="v2-hint">{currentIndex >= 0 && totalItems ? `${currentIndex + 1} of ${totalItems}` : "Item detail"}</span>
            <button type="button" className="v2-iconbtn" onClick={() => onNavigate?.(currentIndex + 1)} disabled={!hasNext} aria-label="Next media"><Icon name="chevronRight" size={18}/></button>
          </div>
          <div className="v2-detail-head-actions">
            <button type="button" className="v2-iconbtn v2-iconbtn-danger" onClick={() => setConfirmDelete(true)} aria-label="Delete media"><Icon name="trash" size={17}/></button>
            <button data-close type="button" className="v2-iconbtn" onClick={onClose} aria-label="Close item detail"><Icon name="x" size={18}/></button>
          </div>
        </div>
        <div className="v2-drawer-scroll">
          <div className="v2-detail-art" style={isImage ? { aspectRatio:"4 / 5", maxHeight:520, marginInline:"auto", background:"#080809" } : undefined}>
            <DetailPreview item={item} isImage={isImage} />
          </div>
          <h2 className="v2-detail-title" id="v2-detail-title">{item.title || item.url}</h2>
          <div className="v2-detail-source">{source.name}{item.folder || state.folder ? ` · ${item.folder || state.folder}` : " · Inbox"}</div>

          <div className="v2-action-row">
            <button type="button" className="v2-btn v2-btn-primary" onClick={() => onPlay(item)}><Icon name={isImage ? "zoomIn" : "play"} size={15} filled={!isImage}/> {isImage ? "Open image" : "Open / Play"}</button>
            <button type="button" className="v2-btn" onClick={() => onFavorite(item.key, !!state.favorite)}>
              <Icon name="star" size={15} filled={!!state.favorite}/>{state.favorite ? "Favorited" : "Favorite"}
            </button>
          </div>
          {confirmDelete ? (
            <div className="v2-delete-confirm" role="alert">
              <span>Delete “{item.title || "this item"}” from Vault?</span>
              <div>
                <button type="button" className="v2-btn v2-btn-danger" onClick={() => onDelete(item)}>Delete</button>
                <button type="button" className="v2-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </div>
          ) : null}

          <div className="v2-detail-block">
            <div className="v2-detail-label">Collection</div>
            <select className="v2-select" value={item.folder || state.folder || ""} onChange={(e) => onFolder(item, e.target.value || null)}>
              <option value="">Inbox</option>
              {folders.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          </div>

          <div className="v2-detail-block">
            <div className="v2-detail-label">Progress</div>
            <div style={{ display:"flex", justifyContent:"space-between", gap:12, color:"var(--v2-muted)", fontSize:12 }}>
              <span>{duration > 0 ? `${formatTime(progress)} of ${formatTime(duration)}` : "Not started"}</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div className="v2-progress" style={{ height:5, marginTop:10 }}><span style={{ width:`${progressPct}%` }}/></div>
          </div>

          <div className="v2-detail-block">
            <div className="v2-detail-label">Rating</div>
            <div className="v2-rating" role="group" aria-label="Rate item">
              {[1,2,3,4,5].map((n) => (
                <button type="button" key={n} className="v2-star" data-active={Number(state.rating || 0) >= n} onClick={() => onRating(item.key, n === Number(state.rating) ? null : n)} aria-label={`Rate ${n} out of 5`}>
                  <Icon name="star" size={20} filled={Number(state.rating || 0) >= n}/>
                </button>
              ))}
            </div>
          </div>

          <div className="v2-segmented" role="tablist" aria-label="Item information">
            <button type="button" role="tab" aria-selected={tab==="activity"} onClick={() => setTab("activity")}>Activity</button>
            <button type="button" role="tab" aria-selected={tab==="details"} onClick={() => setTab("details")}>Details</button>
          </div>

          {tab === "activity" ? (
            <div>
              <div className="v2-detail-label">Comments</div>
              {comments.length ? comments.map((c) => (
                <div className="v2-comment" key={c.id}>
                  <div>{c.body}</div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                    <div className="v2-comment-time">{c.created_at ? new Date(c.created_at).toLocaleString() : ""}</div>
                    <button type="button" className="v2-linkbtn" onClick={() => removeComment(c.id)} aria-label="Delete comment">Delete</button>
                  </div>
                </div>
              )) : <p className="v2-hint">No comments yet.</p>}
              <div className="v2-field">
                <label htmlFor="v2-comment">Add comment</label>
                <textarea id="v2-comment" className="v2-textarea" value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Add context, a thought, or follow-up…" />
              </div>
              <button type="button" className="v2-btn" onClick={addComment} disabled={!comment.trim() || busy}>Add comment</button>

              <div className="v2-detail-block" style={{ marginTop:18 }}>
                <div className="v2-detail-label">Moment marks</div>
                {marks.length ? marks.map((m) => (
                  <div className="v2-comment" key={m.id}>
                    <strong>{formatTime(m.seconds)}</strong>{m.rating ? <span style={{ color:"var(--v2-muted)" }}> · ★ {m.rating}</span> : null}{m.note ? <span style={{ color:"var(--v2-muted)" }}> · {m.note}</span> : null}
                  </div>
                )) : <p className="v2-hint">No moments marked yet.</p>}
                {!isImage ? <p className="v2-hint" style={{ marginTop:10 }}>Add Moment Marks while the media is playing. They appear here automatically.</p> : null}
              </div>
            </div>
          ) : (
            <div>
              <div className="v2-detail-kv"><span>Notes</span><span>{item.note || "—"}</span></div>
              <div className="v2-detail-kv"><span>Tags</span><span>{item.tags?.length ? item.tags.join(", ") : "—"}</span></div>
              <div className="v2-detail-kv"><span>Source</span><span>{source.name}</span></div>
              <div className="v2-detail-kv"><span>URL</span><span>{item.url}</span></div>
              <div className="v2-detail-kv"><span>Added</span><span>{item.addedAt ? new Date(item.addedAt).toLocaleDateString() : "—"}</span></div>
              <div className="v2-detail-kv"><span>Cover</span><span>{item.cover_mode || "automatic"}</span></div>
              <button type="button" className="v2-btn" style={{ marginTop:14 }} onClick={() => onEdit(item)}>Edit details</button>
              <div className="v2-detail-block" style={{ marginTop:18 }}>
                {confirmDelete ? (
  <div style={{ display:"grid", gap:8 }}>
    <div className="v2-hint">This removes the item from Vault. This action cannot be undone.</div>
    <div style={{ display:"flex", gap:8 }}>
      <button type="button" className="v2-btn v2-btn-danger" onClick={() => onDelete(item)}>Confirm delete</button>
      <button type="button" className="v2-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
    </div>
  </div>
) : <button type="button" className="v2-btn v2-btn-danger" onClick={() => setConfirmDelete(true)}>Delete from Vault</button>}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
