"use client";
import { useState } from "react";
import Icon from "./Icons";
import Thumbnail from "./Thumbnail";
import { typeLabel, typeColor } from "@/lib/utils";
import { T } from "@/lib/theme";

export default function DetailPanel({
  item, userData, scraped, folders,
  onOpen, onClose, onToggleFavorite, onAssignFolder
}) {
  const [folderOpen, setFolderOpen] = useState(false);
  const data     = userData?.[item.key];
  const isFav    = data?.favorite;
  const progress = data?.progress && data?.duration ? data.progress / data.duration : 0;
  const color    = typeColor[item.type] || "#555";

  const fmt = (s) => {
    if (!s) return "";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2,"0")}`;
  };

  const progressLabel = data?.progress && data?.duration
    ? `${fmt(data.progress)} / ${fmt(data.duration)} · ${Math.round(progress * 100)}% watched`
    : null;

  return (
    <div style={{
      width: 300, flexShrink: 0,
      borderLeft: `1px solid ${T.border}`,
      background: "rgba(6,6,6,0.6)",
      backdropFilter: "blur(24px)",
      display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0,
      overflowY: "auto",
      fontFamily: "Inter, sans-serif",
      animation: "slideIn 0.18s ease"
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      {/* Close */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 14px 0" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.text4, cursor: "pointer", padding: 4 }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Thumbnail */}
      <div style={{ borderRadius: 10, overflow: "hidden", margin: "8px 14px 0", position: "relative" }}>
        <Thumbnail item={item} scraped={scraped} />
        {progress > 0.02 && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.4)" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: T.green, opacity: 0.75 }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "14px 16px 0" }}>
        {/* Type chip */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 10, color: T.text4, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
            {typeLabel[item.type]}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text1, lineHeight: 1.3, letterSpacing: -0.2, marginBottom: 8 }}>
          {scraped?.title || item.title}
        </div>

        {/* Note */}
        {item.note && (
          <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.5, marginBottom: 10 }}>
            {item.note}
          </div>
        )}

        {/* Tags */}
        {item.tags?.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
            {item.tags.map((t) => (
              <span key={t} style={{ fontSize: 10, color: T.text4, background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 10 }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Progress */}
        {progressLabel && (
          <div style={{ fontSize: 11, color: T.text4, marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}>
            <Icon name="clock" size={11} />
            {progressLabel}
          </div>
        )}

        {/* Collection */}
        {item.tab && (
          <div style={{ fontSize: 11, color: T.text4, marginBottom: 14 }}>
            <span style={{ color: T.text3 }}>{item.tab}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: T.borderSub, margin: "0 16px 14px" }} />

      {/* Actions */}
      <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Primary: Open */}
        <button onClick={() => onOpen(item)} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "11px", background: "rgba(255,255,255,0.1)",
          border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 10,
          color: T.text1, fontSize: 13, fontWeight: 600, cursor: "pointer",
          width: "100%"
        }}>
          <Icon name="play" size={14} />
          Open
        </button>

        {/* Secondary row */}
        <div style={{ display: "flex", gap: 8 }}>
          <ActionBtn onClick={() => onToggleFavorite(item.key, isFav)} active={isFav} title={isFav ? "Unsave" : "Save"} icon="star" filled={isFav} />

          {/* List assignment */}
          <div style={{ position: "relative", flex: 1 }}>
            <ActionBtn onClick={() => setFolderOpen(!folderOpen)} title="Add to list" icon="listMusic" wide />
            {folderOpen && folders?.length > 0 && (
              <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "rgba(14,14,14,0.97)", backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", zIndex: 10, boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}>
                {folders.map((f) => (
                  <button key={f.name} onClick={() => { onAssignFolder(item.key, data?.folder === f.name ? null : f.name); setFolderOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", padding: "9px 12px", background: "transparent", border: "none", color: data?.folder === f.name ? T.text1 : T.text2, fontSize: 12, cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    {data?.folder === f.name && <Icon name="star" size={10} filled style={{ color: T.green }} />}
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ActionBtn onClick={() => window.open(item.url, "_blank")} title="Open externally" icon="external" />
        </div>
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}

function ActionBtn({ onClick, title, icon, active, filled, wide }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
      padding: wide ? "9px 12px" : "9px",
      flex: wide ? 1 : "0 0 40px",
      background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${active ? "rgba(255,255,255,0.16)" : T.border}`,
      borderRadius: 8, cursor: "pointer",
      color: active ? T.text1 : T.text3
    }}>
      <Icon name={icon} size={15} filled={!!filled} />
    </button>
  );
}
