"use client";
import { useState } from "react";
import Thumbnail from "./Thumbnail";
import Icon from "./Icons";
import CardMenu from "./CardMenu";
import { typeLabel } from "@/lib/utils";
import { T } from "@/lib/theme";

export default function Card({
  item, onOpen, viewMode = "grid", userData, onToggleFavorite,
  folders, onAssignFolder, scraped, onPlayMusic, isMobile = false,
  onRemoveQuickAdd, onMarkWatched, onSelect, selected = false
}) {
  const [hov,      setHov]      = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const data     = userData?.[item.key];
  const isFav    = data?.favorite;
  const progress = data?.progress && data?.duration ? data.progress / data.duration : 0;
  const isMusic  = ["audio","music"].includes(item.type);
  const canEmbed = ["youtube","vimeo","gdrive","image","gallery","video","audio","music","instagram","tiktok"].includes(item.type) || scraped?.video || scraped?.image || (scraped?.images?.length >= 3) || scraped?.embed;

  const handleClick = (e) => {
    if (menuOpen) return;
    if (isMusic && onPlayMusic) { onPlayMusic(item); return; }
    if (!isMobile && onSelect) {
      // Desktop: single click = select (show in detail panel)
      onSelect(item);
    } else {
      canEmbed ? onOpen(item) : window.open(item.url, "_blank");
    }
  };

  const handleDoubleClick = (e) => {
    if (isMobile || !onSelect) return; // mobile handled by handleClick
    if (menuOpen) return;
    if (isMusic && onPlayMusic) { onPlayMusic(item); return; }
    canEmbed ? onOpen(item) : window.open(item.url, "_blank");
  };

  const menuTrigger = (e) => { e.stopPropagation(); setMenuOpen(true); };

  // ─── Showcase ─────────────────────────────────────────────────────────────
  if (viewMode === "showcase") {
    return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        onClick={handleClick} onDoubleClick={handleDoubleClick} style={{ position: "relative", borderRadius: T.r12, overflow: "visible", aspectRatio: "16/9", cursor: "pointer" }}>
        <div style={{ borderRadius: T.r12, overflow: "hidden", width: "100%", height: "100%", position: "relative", border: `1px solid ${hov ? T.borderHov : T.border}`, boxShadow: hov ? "0 12px 40px rgba(0,0,0,0.6)" : "0 2px 12px rgba(0,0,0,0.4)", transition: "all 0.2s", background: T.bgCard }}>
          <div style={{ position: "absolute", inset: 0 }}><Thumbnail item={item} scraped={scraped} /></div>
          <div style={{ position: "absolute", inset: 0, background: hov ? "linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.3) 50%,rgba(0,0,0,0.05) 80%)" : "linear-gradient(to top,rgba(0,0,0,0.74) 0%,rgba(0,0,0,0.1) 55%,transparent 80%)", transition: "background 0.2s" }} />
          <TypeChip item={item} />
          {progress > 0.02 && <ProgressBar pct={progress} />}
        </div>
        {/* Always-visible three-dot */}
        <ThreeDot onPress={menuTrigger} visible={hov || isMobile} />
        {/* Bottom info */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px 14px", pointerEvents: "none" }}>
          {hov && item.tags?.length > 0 && <TagRow tags={item.tags} />}
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text1, lineHeight: 1.35, letterSpacing: -0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {scraped?.title || item.title}
          </div>
        </div>
        {menuOpen && <CardMenu item={item} data={data} folders={folders} onAssignFolder={onAssignFolder} onToggleFavorite={onToggleFavorite} onClose={() => setMenuOpen(false)} isMobile={isMobile} onRemoveQuickAdd={onRemoveQuickAdd} onMarkWatched={onMarkWatched} />}
      </div>
    );
  }

  // ─── List ─────────────────────────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={handleClick}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: hov ? "rgba(255,255,255,0.03)" : "transparent", borderBottom: `1px solid ${T.borderSub}`, cursor: "pointer", transition: "background 0.12s", position: "relative" }}>
        <div style={{ width: 64, height: 40, borderRadius: T.r6, overflow: "hidden", flexShrink: 0, background: T.bgCard, position: "relative" }}>
          <Thumbnail item={item} scraped={scraped} />
          {progress > 0.02 && <ProgressBar pct={progress} thin />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 400, color: T.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
            {isFav && <Icon name="star" size={10} filled style={{ color: T.amber, flexShrink: 0 }} />}
            {scraped?.title || item.title}
          </div>
          <div style={{ fontSize: 10, color: T.text4, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 }}>{typeLabel[item.type]}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {(hov || isMobile) && <ThreeDotInline onPress={menuTrigger} />}
        </div>
        {menuOpen && <CardMenu item={item} data={data} folders={folders} onAssignFolder={onAssignFolder} onToggleFavorite={onToggleFavorite} onClose={() => setMenuOpen(false)} isMobile={isMobile} onRemoveQuickAdd={onRemoveQuickAdd} onMarkWatched={onMarkWatched} />}
      </div>
    );
  }

  // ─── Compact ──────────────────────────────────────────────────────────────
  if (viewMode === "compact") {
    return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={handleClick} title={scraped?.title || item.title}
        style={{ borderRadius: T.r6, overflow: "hidden", cursor: "pointer", border: `1px solid ${hov ? T.borderHov : T.borderSub}`, transition: "border-color 0.15s", position: "relative", background: T.bgCard }}>
        <Thumbnail item={item} scraped={scraped} />
        {progress > 0.02 && <ProgressBar pct={progress} />}
      </div>
    );
  }

  // ─── Grid ─────────────────────────────────────────────────────────────────
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => { setHov(false); setMenuOpen(false); }} onClick={handleClick} onDoubleClick={handleDoubleClick}
      style={{ background: T.bgCard, borderRadius: T.r10, overflow: "visible", border: `1px solid ${hov ? T.borderHov : T.border}`, boxShadow: hov ? "0 6px 24px rgba(0,0,0,0.4)" : "none", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ borderRadius: `${T.r10}px ${T.r10}px 0 0`, overflow: "hidden", position: "relative" }}>
        <Thumbnail item={item} scraped={scraped} />
        <TypeChip item={item} />
        {isFav && !hov && <div style={{ position: "absolute", top: 7, right: 7, color: T.amber }}><Icon name="star" size={12} filled /></div>}
        {progress > 0.02 && <ProgressBar pct={progress} />}
      </div>
      <div style={{ padding: "9px 11px 10px", flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 400, color: T.text1, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {scraped?.title || item.title || "Untitled"}
        </div>
        {item.note && <div style={{ fontSize: 10, color: T.text4, marginTop: 3 }}>{item.note}</div>}
      </div>
      {/* Three-dot always on mobile, hover on desktop */}
      <div style={{ position: "absolute", top: 6, right: 6 }}>
        {(hov || isMobile) && <ThreeDotInline onPress={menuTrigger} />}
      </div>
      {menuOpen && <CardMenu item={item} data={data} folders={folders} onAssignFolder={onAssignFolder} onToggleFavorite={onToggleFavorite} onClose={() => setMenuOpen(false)} isMobile={isMobile} onRemoveQuickAdd={onRemoveQuickAdd} onMarkWatched={onMarkWatched} />}
    </div>
  );
}

// Shared small components
const TypeChip = ({ item }) => (
  <div style={{ position: "absolute", top: 7, left: 7, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", color: T.text4, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: T.r4, letterSpacing: 0.5, textTransform: "uppercase" }}>
    {typeLabel[item.type]}
  </div>
);

const ProgressBar = ({ pct, thin }) => (
  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: thin ? 2 : 2, background: "rgba(0,0,0,0.3)" }}>
    <div style={{ height: "100%", width: `${pct * 100}%`, background: T.green, opacity: 0.7 }} />
  </div>
);

const TagRow = ({ tags }) => (
  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 5 }}>
    {tags.slice(0, 3).map((t) => <span key={t} style={{ fontSize: 9, color: T.text3, letterSpacing: 0.3 }}>#{t}</span>)}
  </div>
);

// Three-dot button — overlaid on card (showcase/compact)
const ThreeDot = ({ onPress, visible }) => visible ? (
  <button onClick={onPress} style={{ position: "absolute", top: 8, right: 8, zIndex: 5, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.text1 }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
  </button>
) : null;

// Three-dot inline (list/grid)
const ThreeDotInline = ({ onPress }) => (
  <button onClick={onPress} style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,0.07)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.text3 }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
  </button>
);
