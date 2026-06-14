"use client";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { getThumb, getSourceMeta } from "@/lib/sources";

export default function Card({
  item, onOpen, viewMode = "grid",
  userData, onToggleFavorite, folders = [], onAssignFolder,
  isMobile, onRemoveQuickAdd, onMarkWatched, onSetRating,
  onSelect, selected, onDragItem,
}) {
  const meta  = getSourceMeta(item.url);
  const thumb = item.thumbnail || getThumb(item.url);
  const u     = userData?.[item.key] || {};
  const fav   = !!u.favorite;
  const progress = u.progress > 0 && u.duration > 0 ? Math.min(1, u.progress / u.duration) : 0;
  const watched = progress > 0.95;
  const rating = u.rating || 0;
  const isQuickAdd = !!item.isQuickAdd || item.tab === "Quick Adds";

  const [menuOpen, setMenuOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  // ── List view ─────────────────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <div
        onClick={() => (onSelect ? onSelect(item) : onOpen(item))}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 14px", borderBottom: `1px solid ${T.borderSub}`,
          background: selected ? "rgba(255,255,255,0.04)" : "transparent",
          cursor: "pointer",
        }}
      >
        <div style={{ width: 56, height: 38, borderRadius: 4, overflow: "hidden", background: meta.color + "22", flexShrink: 0, position: "relative" }}>
          {thumb && !imgFailed
            ? <img src={thumb} onError={() => setImgFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: meta.color }}><Icon name="play" size={14} filled /></div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: T.text1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title || item.url}</div>
          <div style={{ fontSize: 11, color: T.text4, marginTop: 2 }}>{meta.name}{rating ? ` • ★ ${rating}` : ""}{watched ? " • watched" : ""}</div>
        </div>
        <CardMenuButton {...{ item, fav, rating, folders, onToggleFavorite, onAssignFolder, isQuickAdd, onRemoveQuickAdd, onMarkWatched, onSetRating, menuOpen, setMenuOpen, menuRef }} />
      </div>
    );
  }

  // ── Card views (showcase / grid / compact) ────────────────────────────
  const aspect = viewMode === "compact" ? "1 / 1" : "4 / 5";

  return (
    <div
      onClick={() => (onSelect ? onSelect(item) : onOpen(item))}
      draggable={!!onDragItem}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", item.key); e.dataTransfer.effectAllowed = "move"; onDragItem?.(item); }}
      style={{
        position: "relative",
        background: T.bgCard,
        border: `1px solid ${selected ? T.borderHov : T.border}`,
        borderRadius: T.r10,
        overflow: "visible",
        cursor: "pointer",
        transition: "border-color 0.12s",
      }}
    >
      {/* Thumbnail */}
      <div style={{ width: "100%", aspectRatio: aspect, background: meta.color + "1a", position: "relative", overflow: "hidden" }}>
        {thumb && !imgFailed ? (
          <img src={thumb} onError={() => setImgFailed(true)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: meta.color }}>
            <Icon name="play" size={32} filled />
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: meta.color }}>{meta.name}</div>
          </div>
        )}

        {/* Play overlay on hover */}
        <div className="play-overlay" style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0, transition: "opacity 0.15s",
        }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="play" size={20} filled style={{ color: "#000", marginLeft: 2 }} />
          </div>
        </div>

        {/* Source chip */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          padding: "3px 8px", borderRadius: 999, fontSize: 9, fontWeight: 600, letterSpacing: 0.3,
          background: "rgba(0,0,0,0.6)", color: meta.color, backdropFilter: "blur(8px)",
          border: meta.id === "extract" ? `1px dashed ${meta.color}66` : `1px solid ${meta.color}33`,
          textTransform: "uppercase",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          {meta.name}
          {meta.id === "extract" && <span style={{ opacity: 0.7 }}>·?</span>}
        </div>

        {rating > 0 && (
          <div style={{ position: "absolute", bottom: 8, left: 8, padding: "3px 7px", borderRadius: 999, background: "rgba(0,0,0,0.62)", border: "1px solid rgba(255,255,255,0.12)", color: T.amber, fontSize: 10, fontWeight: 700, backdropFilter: "blur(8px)" }}>★ {rating}</div>
        )}

        {/* Favorite */}
        {fav && (
          <div style={{ position: "absolute", top: 8, right: 8, padding: 4, background: "rgba(0,0,0,0.55)", borderRadius: "50%", backdropFilter: "blur(8px)", color: T.amber }}>
            <Icon name="star" size={11} filled />
          </div>
        )}

        {/* Watched check */}
        {watched && (
          <div style={{ position: "absolute", bottom: 8, right: 8, padding: 4, background: T.green, borderRadius: "50%", color: "#000" }}>
            <Icon name="check" size={10} strokeWidth={3} />
          </div>
        )}

        {/* Progress bar */}
        {progress > 0 && !watched && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.4)" }}>
            <div style={{ width: `${progress * 100}%`, height: "100%", background: T.green }} />
          </div>
        )}
      </div>

      {/* Body */}
      {viewMode !== "compact" && (
        <div style={{ padding: "10px 12px 12px", display: "flex", alignItems: "flex-start", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.text1, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {item.title || item.url}
            </div>
            <div style={{ fontSize: 10, color: T.text4, marginTop: 3 }}>{rating ? `★ ${rating}` : (item.folder || item.tab || "")}</div>
          </div>
          <CardMenuButton {...{ item, fav, rating, folders, onToggleFavorite, onAssignFolder, isQuickAdd, onRemoveQuickAdd, onMarkWatched, onSetRating, menuOpen, setMenuOpen, menuRef }} />
        </div>
      )}

      <style jsx>{`
        div:hover > .play-overlay { opacity: 1; }
      `}</style>
    </div>
  );
}

function CardMenuButton({ item, fav, rating = 0, folders, onToggleFavorite, onAssignFolder, isQuickAdd, onRemoveQuickAdd, onMarkWatched, onSetRating, menuOpen, setMenuOpen, menuRef }) {
  const buttonRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 420 });

  useLayoutEffect(() => {
    if (!menuOpen || !buttonRef.current) return;
    const place = () => {
      const r = buttonRef.current.getBoundingClientRect();
      const width = 260;
      const maxHeight = Math.max(180, Math.min(460, window.innerHeight - 24));
      const left = Math.max(10, Math.min(window.innerWidth - width - 10, r.right - width));
      let top = r.bottom + 8;
      if (top + maxHeight > window.innerHeight - 12) top = Math.max(12, r.top - maxHeight - 8);
      setPos({ top, left, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen]);

  const menu = menuOpen && typeof document !== "undefined" ? createPortal(
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", top: pos.top, left: pos.left, zIndex: 10000,
        background: "rgba(18,18,18,0.98)", border: `1px solid ${T.border}`, backdropFilter: "blur(18px)",
        borderRadius: 12, boxShadow: "0 18px 60px rgba(0,0,0,0.72)",
        width: 260, maxHeight: pos.maxHeight, overflowY: "auto", overflowX: "hidden", padding: 7,
        overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", scrollbarWidth: "thin",
      }}
    >
      <MenuItem icon="star" label={fav ? "Unfavorite" : "Favorite"} onClick={() => { onToggleFavorite?.(item.key, fav); setMenuOpen(false); }} />
      <MenuItem icon="check" label="Mark watched" onClick={() => { onMarkWatched?.(item.key); setMenuOpen(false); }} />
      <div style={{ height: 1, background: T.borderSub, margin: "5px 0" }} />
      <div style={{ padding: "7px 10px 5px", color: T.text4, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Rating</div>
      <div style={{ display: "flex", gap: 2, padding: "0 8px 7px" }}>
        {[1,2,3,4,5].map((n) => (
          <button key={n} onClick={() => { onSetRating?.(item.key, rating === n ? null : n); setMenuOpen(false); }} style={{ background: "transparent", border: "none", color: n <= rating ? T.amber : T.text4, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 2 }}>★</button>
        ))}
      </div>
      <div style={{ height: 1, background: T.borderSub, margin: "5px 0" }} />
      <MenuItem icon="folder" label="No folder" onClick={() => { onAssignFolder?.(item.key, null); setMenuOpen(false); }} />
      {folders.map((f) => (
        <MenuItem key={f.name} icon="folder" label={f.name} onClick={() => { onAssignFolder?.(item.key, f.name); setMenuOpen(false); }} />
      ))}
      <div style={{ height: 1, background: T.borderSub, margin: "5px 0" }} />
      <MenuItem
        icon="trash"
        label="Delete item"
        danger
        onClick={() => {
          const ok = window.confirm("Delete this item from your vault? This will also remove it from the Vault Library sheet mirror when the webhook is configured.");
          if (!ok) return;
          onRemoveQuickAdd?.(item.key);
          setMenuOpen(false);
        }}
      />
    </div>,
    document.body
  ) : null;

  return (
    <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
        style={{ background: menuOpen ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.16)", color: T.text1, cursor: "pointer", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 22px rgba(0,0,0,0.35)", position: "relative", zIndex: 5 }}
        aria-label="Item actions"
      >
        <Icon name="more" size={18} />
      </button>
      {menu}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9,
        width: "100%", padding: "8px 10px",
        background: "transparent", border: "none",
        color: danger ? "#ff6b6b" : T.text2,
        fontSize: 12, cursor: "pointer", borderRadius: 6, textAlign: "left",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Icon name={icon} size={12} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}
