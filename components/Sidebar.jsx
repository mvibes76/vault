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
        width: "100%",
        padding: collapsed ? "9px 0" : mobile ? "11px 14px" : "7px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        border: "none", borderRadius: T.r6,
        color: active ? T.text1 : T.text3,
        cursor: "pointer", fontSize: mobile ? 15 : 13,
        fontWeight: active ? 500 : 400,
        textAlign: "left", transition: "background 0.12s, color 0.12s",
        marginBottom: 1,
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
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, color: T.text4, padding: "14px 12px 5px", textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

export default function Sidebar({
  tabs, activeView, onNavigate, folders, onCreateFolder, onDeleteFolder,
  counts, onSignOut, userEmail, collapsed, onToggleCollapse,
  mobile = false, open = true, onClose,
}) {
  const [newFolder, setNewFolder] = useState("");
  const [adding, setAdding] = useState(false);
  const np = { activeView, collapsed, mobile, onNavigate, onClose };

  return (
    <>
      {mobile && open && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      )}

      <aside style={{
        width: mobile ? 270 : (collapsed ? 56 : 220),
        background: "rgba(13,13,13,0.96)",
        backdropFilter: "blur(20px)",
        borderRight: `1px solid ${T.border}`,
        padding: mobile ? "14px 10px" : "12px 9px",
        position: mobile ? "fixed" : "sticky",
        top: 0, bottom: 0,
        left: mobile ? (open ? 0 : -290) : 0,
        height: "100dvh",
        overflowY: "auto", flexShrink: 0,
        transition: "left 0.22s ease, width 0.18s",
        zIndex: 201,
        display: "flex", flexDirection: "column",
      }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: collapsed ? "6px 0" : "6px 8px", marginBottom: 8 }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.text1, fontSize: 14, fontWeight: 600, letterSpacing: -0.3 }}>
              <Icon name="vault" size={18} />
              Vault
            </div>
          )}
          {!mobile && (
            <button onClick={onToggleCollapse} style={{ background: "transparent", border: "none", color: T.text4, cursor: "pointer", padding: 4 }}>
              <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={14} />
            </button>
          )}
        </div>

        {/* Library */}
        <NavItem {...np} id="all" icon="home" label="Everything" count={counts.all} />
        <NavItem {...np} id="favorites" icon="star" label="Favorites" count={counts.favorites} />
        <NavItem {...np} id="continue" icon="clock" label="Continue" count={counts.continue} />

        {/* Tabs from sheet */}
        {tabs.length > 0 && (
          <>
            <SectionLabel collapsed={collapsed}>Tabs</SectionLabel>
            {tabs.map((t) => (
              <NavItem key={t.name} {...np} id={`tab:${t.name}`} icon="video" label={t.name} count={(t.items || []).length} />
            ))}
          </>
        )}

        {/* Folders */}
        <SectionLabel collapsed={collapsed}>Folders</SectionLabel>
        {folders.map((f) => (
          <NavItem key={f.name} {...np} id={`folder:${f.name}`} icon="folder" label={f.name} count={counts[`folder:${f.name}`]} />
        ))}
        {!collapsed && (
          adding ? (
            <div style={{ display: "flex", gap: 4, padding: "4px 8px" }}>
              <input
                value={newFolder} onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFolder.trim()) { onCreateFolder(newFolder.trim()); setNewFolder(""); setAdding(false); }
                  if (e.key === "Escape") { setAdding(false); setNewFolder(""); }
                }}
                placeholder="Folder name"
                autoFocus
                style={{ flex: 1, padding: "5px 8px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 5, color: T.text1, fontSize: 12, outline: "none" }}
              />
              <button onClick={() => { setAdding(false); setNewFolder(""); }} style={{ background: "transparent", border: "none", color: T.text4, cursor: "pointer" }}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: "none", color: T.text4, fontSize: 12, cursor: "pointer", width: "100%", textAlign: "left", borderRadius: 6 }}>
              <Icon name="plus" size={12} /> New folder
            </button>
          )
        )}

        {/* Footer */}
        <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${T.borderSub}` }}>
          <NavItem {...np} id="settings" icon="settings" label="Settings" />
          {onSignOut && (
            <button onClick={onSignOut} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: collapsed ? "9px 0" : "7px 12px", justifyContent: collapsed ? "center" : "flex-start", background: "transparent", border: "none", color: T.text4, fontSize: 12, cursor: "pointer", borderRadius: 6 }}>
              <Icon name="logout" size={13} />
              {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>Sign out</span>}
            </button>
          )}
          {!collapsed && userEmail && (
            <div style={{ fontSize: 10, color: T.text4, padding: "8px 12px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
          )}
        </div>
      </aside>
    </>
  );
}
