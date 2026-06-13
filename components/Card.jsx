"use client";
import { useState, useRef, useEffect } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { getThumb, getSourceMeta } from "@/lib/sources";

export default function Card({
  item, onOpen, viewMode = "grid",
  userData, onToggleFavorite, folders = [], onAssignFolder,
  isMobile, onRemoveQuickAdd, onMarkWatched,
  onSelect, selected,
}) {
  const meta  = getSourceMeta(item.url);
  const thumb = getThumb(item.url);
  const u     = userData?.[item.key] || {};
  const fav   = !!u.favorite;
  const progress = u.progress > 0 && u.duration > 0 ? Math.min(1, u.progress / u.duration) : 0;
  const watched = progress > 0.95;
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
          <div style={{ fontSize: 11, color: T.text4, marginTop: 2 }}>{meta.name}{watched ? " • watched" : ""}</div>
        </div>
        <CardMenuButton {...{ item, fav, folders, onToggleFavorite, onAssignFolder, isQuickAdd, onRemoveQuickAdd, onMarkWatched, menuOpen, setMenuOpen, menuRef }} />
      </div>
    );
  }

  // ── Card views (showcase / grid / compact) ────────────────────────────
  const aspect = viewMode === "compact" ? "1 / 1" : "16 / 10";

  return (
    <div
      onClick={() => (onSelect ? onSelect(item) : onOpen(item))}
      style={{
        position: "relative",
        background: T.bgCard,
        border: `1px solid ${selected ? T.borderHov : T.border}`,
        borderRadius: T.r10,
        overflow: "hidden",
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
          border: `1px solid ${meta.color}33`,
          textTransform: "uppercase",
        }}>{meta.name}</div>

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
            {item.tab && item.tab !== "Quick Adds" && (
              <div style={{ fontSize: 10, color: T.text4, marginTop: 3 }}>{item.tab}</div>
            )}
          </div>
          <CardMenuButton {...{ item, fav, folders, onToggleFavorite, onAssignFolder, isQuickAdd, onRemoveQuickAdd, onMarkWatched, menuOpen, setMenuOpen, menuRef }} />
        </div>
      )}

      <style jsx>{`
        div:hover > .play-overlay { opacity: 1; }
      `}</style>
    </div>
  );
}

function CardMenuButton({ item, fav, folders, onToggleFavorite, onAssignFolder, isQuickAdd, onRemoveQuickAdd, onMarkWatched, menuOpen, setMenuOpen, menuRef }) {
  return (
    <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
        style={{ background: "rgba(255,255,255,0.05)", border: "none", color: T.text3, cursor: "pointer", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="more" size={14} />
      </button>
      {menuOpen && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", top: 28, right: 0, zIndex: 50,
          background: T.bgMenu, border: `1px solid ${T.border}`,
          borderRadius: 10, boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
          minWidth: 180, padding: 4,
        }}>
          <MenuItem icon="star" label={fav ? "Unfavorite" : "Favorite"} onClick={() => { onToggleFavorite?.(item.key, fav); setMenuOpen(false); }} />
          <MenuItem icon="check" label="Mark watched" onClick={() => { onMarkWatched?.(item.key); setMenuOpen(false); }} />
          {folders.length > 0 && <div style={{ height: 1, background: T.borderSub, margin: "4px 0" }} />}
          {folders.map((f) => (
            <MenuItem key={f.name} icon="folder" label={f.name} onClick={() => { onAssignFolder?.(item.key, f.name); setMenuOpen(false); }} />
          ))}
          {isQuickAdd && <>
            <div style={{ height: 1, background: T.borderSub, margin: "4px 0" }} />
            <MenuItem icon="trash" label="Remove" danger onClick={() => { onRemoveQuickAdd?.(item.key); setMenuOpen(false); }} />
          </>}
        </div>
      )}
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
