"use client";
import { useEffect, useRef } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";

// Mobile bottom sheet / desktop dropdown context menu for cards
export default function CardMenu({ item, data, folders, onAssignFolder, onToggleFavorite, onClose, isMobile, onRemoveQuickAdd, onMarkWatched }) {
  const ref = useRef(null);
  const isFav  = data?.favorite;
  const folder = data?.folder;

  // Close on outside click
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", h); };
  }, [onClose]);

  // Escape key
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(item.url); } catch {}
    onClose();
  };

  const openExternal = () => { window.open(item.url, "_blank"); onClose(); };

  const menuStyle = isMobile ? {
    // Bottom sheet
    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1100,
    background: "rgba(14,14,14,0.97)", backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    border: `1px solid ${T.border}`,
    paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
    fontFamily: "Inter, sans-serif"
  } : {
    // Desktop dropdown
    position: "absolute", top: 32, right: 0, zIndex: 60,
    background: "rgba(14,14,14,0.97)", backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 12, minWidth: 200,
    border: `1px solid ${T.border}`,
    boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
    fontFamily: "Inter, sans-serif"
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isMobile && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1099, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
      )}

      <div ref={ref} style={menuStyle}>
        {/* Handle + title — mobile only */}
        {isMobile && (
          <>
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>
            <div style={{ padding: "6px 20px 14px", borderBottom: `1px solid ${T.borderSub}` }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div style={{ padding: isMobile ? "8px 8px" : "6px 6px" }}>
          <MenuItem icon="star" label={isFav ? "Remove from Saved" : "Save"} onPress={() => { onToggleFavorite(item.key, isFav); onClose(); }} active={isFav} />

          {folders?.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: T.text4, padding: "8px 12px 4px", textTransform: "uppercase", letterSpacing: 0.5 }}>Add to list</div>
              {folders.map((f) => (
                <MenuItem
                  key={f.name}
                  icon={folder === f.name ? "star" : "listMusic"}
                  label={f.name}
                  onPress={() => { onAssignFolder(item.key, folder === f.name ? null : f.name); onClose(); }}
                  active={folder === f.name}
                  indent
                />
              ))}
            </>
          )}

          <div style={{ height: 1, background: T.borderSub, margin: "6px 12px" }} />

          {item.isQuickAdd && onRemoveQuickAdd && (
            <MenuItem icon="x" label="Remove from Vault" onPress={() => { onRemoveQuickAdd(item.key); onClose(); }} />
          )}
          {onMarkWatched && !["audio","music"].includes(item.type) && (
            <MenuItem icon="history" label="Mark as watched" onPress={() => { onMarkWatched(item.key); onClose(); }} />
          )}
          <MenuItem icon="external" label="Open in browser" onPress={openExternal} />
          <MenuItem icon="file"     label="Copy link"        onPress={copyLink} />
        </div>
      </div>
    </>
  );
}

function MenuItem({ icon, label, onPress, active, indent }) {
  return (
    <button onClick={onPress} style={{
      display: "flex", alignItems: "center", gap: 10,
      width: "100%", padding: `10px ${indent ? "18px" : "12px"}`,
      background: "none", border: "none", cursor: "pointer", textAlign: "left",
      borderRadius: 8, color: active ? T.text1 : T.text2,
      fontSize: 14, transition: "background 0.1s"
    }}
      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "none"}
    >
      <Icon name={icon} size={16} style={{ color: active ? T.text1 : T.text3, flexShrink: 0 }} />
      {label}
    </button>
  );
}
