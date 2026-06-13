"use client";
import { useState } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";

function NavItem({ id, icon, label, count, activeView, collapsed, mobile, onNavigate, onClose }) {
  const active = activeView === id;
  return (
    <button
      onClick={() => { onNavigate(id); if (mobile) onClose?.(); }}
      style={{
        display: "flex", alignItems: "center", gap: 9,
        width: "100%", padding: collapsed ? "9px 0" : mobile ? "11px 14px" : "7px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        border: "none", borderRadius: T.r6,
        color: active ? T.text1 : T.text3,
        cursor: "pointer", fontSize: mobile ? 15 : 13,
        fontWeight: active ? 500 : 400,
        textAlign: "left", transition: "background 0.12s, color 0.12s",
        marginBottom: 1
      }}
    >
      <Icon name={icon} size={14} filled={icon === "star"} style={{ opacity: active ? 0.9 : 0.55, flexShrink: 0 }} />
      {!collapsed && (
        <>
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          {count !== undefined && count > 0 && (
            <span style={{ fontSize: 10, color: T.text4, fontVariantNumeric: "tabular-nums" }}>{count}</span>
          )}
        </>
      )}
    </button>
  );
}

function SectionLabel({ collapsed, children }) {
  if (collapsed) return <div style={{ height: 10 }} />;
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
      color: T.text4, padding: "14px 12px 5px", textTransform: "uppercase"
    }}>
      {children}
    </div>
  );
}

export default function Sidebar({
  tabs, activeView, onNavigate, folders, onCreateFolder, onDeleteFolder,
  counts, onSignOut, userEmail, collapsed, onToggleCollapse,
  mobile = false, open = true, onClose
}) {
  const [newFolder, setNewFolder] = useState("");
  const [adding, setAdding] = useState(false);
  const np = { activeView, collapsed, mobile, onNavigate, onClose };

  return (
    <>
      {mobile && open && (
        <button aria-label="Close navigation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 790, background: "rgba(0,0,0,0.5)", border: "none", padding: 0 }} />
      )}
      <div style={{
        width: mobile ? "min(80vw, 300px)" : collapsed ? 52 : 224, flexShrink: 0,
        background: mobile ? "rgba(10,10,10,0.96)" : "rgba(8,8,8,0.88)",
        backdropFilter: "blur(24px) saturate(1.2)",
        WebkitBackdropFilter: "blur(24px) saturate(1.2)",
        borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column",
        height: mobile ? "100dvh" : "100vh",
        position: mobile ? "fixed" : "sticky", top: 0, left: 0,
        zIndex: mobile ? 800 : "auto",
        transform: mobile && !open ? "translateX(-105%)" : "translateX(0)",
        transition: mobile ? "transform 0.22s ease" : "width 0.18s ease",
        boxShadow: mobile && open ? "24px 0 80px rgba(0,0,0,0.6)" : "none"
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed ? "16px 0" : mobile ? "18px 16px" : "16px 14px",
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: `1px solid ${T.borderSub}`
        }}>
          {!collapsed && (
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text1, letterSpacing: -0.3 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Icon name="vault" size={16} /> Vault
              </span>
            </div>
          )}
          <button onClick={mobile ? onClose : onToggleCollapse} style={{ background: "none", border: "none", color: T.text4, cursor: "pointer", padding: 4, borderRadius: T.r4 }}>
            <Icon name={mobile ? "x" : collapsed ? "chevronRight" : "chevronLeft"} size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          <SectionLabel collapsed={collapsed}>Library</SectionLabel>
          <NavItem id="all"       icon="home"    label="Everything"        count={counts.all}       {...np} />
          <NavItem id="favorites" icon="star"    label="Favorites"         count={counts.favorites}  {...np} />
          <NavItem id="continue"  icon="clock"   label="Continue Watching"  count={counts.continue}  {...np} />
          <NavItem id="history"   icon="history" label="History"                                     {...np} />

          <SectionLabel collapsed={collapsed}>Browse</SectionLabel>
          <NavItem id="type:Videos"  icon="video"    label="Videos"  count={counts.Videos}  {...np} />
          <NavItem id="type:Photos"  icon="image"    label="Photos"  count={counts.Photos}  {...np} />
          <NavItem id="type:Music"   icon="music"    label="Music"   count={counts.Music}   {...np} />
          <NavItem id="type:Reading" icon="bookOpen" label="Reading" count={counts.Reading} {...np} />
          <NavItem id="type:Links"   icon="link"     label="Links"   count={counts.Links}   {...np} />

          {tabs.length > 0 && <>
            <SectionLabel collapsed={collapsed}>Collections</SectionLabel>
            {tabs.map((t) => (
              <NavItem key={t.name} id={`tab:${t.name}`} icon="chevronRight" label={t.name} count={t.items.length} {...np} />
            ))}
          </>}

          <SectionLabel collapsed={collapsed}>My Lists</SectionLabel>
          {folders.map((f) => (
            <div key={f.name} style={{ position: "relative" }}>
              <NavItem id={`folder:${f.name}`} icon="listMusic" label={f.name} count={counts[`folder:${f.name}`]} {...np} />
              {!collapsed && (
                <button onClick={() => onDeleteFolder(f.name)} title="Delete list" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.text4, cursor: "pointer", padding: 4, opacity: 0, transition: "opacity 0.12s" }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "0"}
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
          ))}
          {!collapsed && (
            adding ? (
              <div style={{ padding: "4px 4px" }}>
                <input
                  autoFocus value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFolder.trim()) { onCreateFolder(newFolder.trim()); setNewFolder(""); setAdding(false); }
                    if (e.key === "Escape") setAdding(false);
                  }}
                  placeholder="List name"
                  style={{ width: "100%", padding: "7px 10px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: T.r6, color: T.text1, fontSize: 12, outline: "none" }}
                />
              </div>
            ) : (
              <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "7px 12px", background: "transparent", border: "none", color: T.text4, cursor: "pointer", fontSize: 12, textAlign: "left", borderRadius: T.r6 }}>
                <Icon name="plus" size={12} /> New list
              </button>
            )
          )}

          <SectionLabel collapsed={collapsed}>More</SectionLabel>
          <NavItem id="drive"    icon="drive"    label="Google Drive"   {...np} />
          <NavItem id="settings" icon="settings" label="Sheet Settings" {...np} />
        </div>

        {/* User footer */}
        <div style={{ padding: collapsed ? "10px 0" : "10px 14px", borderTop: `1px solid ${T.borderSub}`, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
          {!collapsed && (
            <div style={{ fontSize: 10, color: T.text4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {userEmail || "Local mode"}
            </div>
          )}
          {onSignOut && (
            <button onClick={onSignOut} title="Sign out" style={{ background: "none", border: "none", color: T.text4, cursor: "pointer", padding: 4 }}>
              <Icon name="logout" size={13} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
