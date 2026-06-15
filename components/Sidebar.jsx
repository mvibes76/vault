"use client";
import { useMemo, useState } from "react";
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

function folderKey(name) {
  return String(name || "").trim().toLowerCase();
}

function FolderTree({ folders, counts, activeView, collapsed, mobile, onNavigate, onClose, onCreateGallery, onDeleteFolder, onRenameFolder, onDropItemToFolder }) {
  const activeName = activeView?.startsWith("folder:") ? activeView.slice(7) : "";
  const roots = useMemo(() => folders.filter((f) => !f.parent_folder).sort((a,b) => String(a.name).localeCompare(String(b.name))), [folders]);
  const childrenByParent = useMemo(() => {
    const map = new Map();
    folders.forEach((f) => {
      if (!f.parent_folder) return;
      const key = folderKey(f.parent_folder);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    });
    map.forEach((list) => list.sort((a,b) => String(a.name).localeCompare(String(b.name))));
    return map;
  }, [folders]);
  const activeFolder = folders.find((f) => folderKey(f.name) === folderKey(activeName));
  const [openParents, setOpenParents] = useState(() => new Set());

  const isParentOpen = (root) => {
    if (collapsed) return false;
    if (openParents.has(folderKey(root.name))) return true;
    if (activeFolder?.parent_folder && folderKey(activeFolder.parent_folder) === folderKey(root.name)) return true;
    return false;
  };
  const toggleParent = (name) => {
    setOpenParents((prev) => {
      const next = new Set(prev);
      const key = folderKey(name);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const renderActions = (f, isChild = false) => {
    if (collapsed) return null;
    return (
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        {!isChild && (
          <button
            onClick={(e) => { e.stopPropagation(); onCreateGallery?.(f.name); setOpenParents((prev) => new Set(prev).add(folderKey(f.name))); }}
            title={`New gallery inside ${f.name}`}
            style={folderActionBtn}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = T.text1; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.text4; }}
          >
            <Icon name="plus" size={12} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const next = window.prompt(isChild ? "Rename gallery" : "Rename folder", f.name);
            if (next && next.trim() && next.trim() !== f.name) onRenameFolder?.(f.name, next.trim());
          }}
          title={`Rename ${f.name}`}
          style={folderActionBtn}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = T.text1; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.text4; }}
        >
          <Icon name="settings" size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const ok = window.confirm(`Delete ${isChild ? "gallery" : "folder"} "${f.name}"? Items stay in your vault and move to No folder.`);
            if (ok) onDeleteFolder?.(f.name);
          }}
          title={`Delete ${f.name}`}
          style={folderActionBtn}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,80,80,0.10)"; e.currentTarget.style.color = "#ff8f8f"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.text4; }}
        >
          <Icon name="trash" size={12} />
        </button>
      </div>
    );
  };

  const renderDropWrap = (f, children, style = {}) => (
    <div
      key={f.name}
      onDragOver={(e) => { if (onDropItemToFolder) { e.preventDefault(); e.currentTarget.style.background = "rgba(255,255,255,0.07)"; } }}
      onDragLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      onDrop={(e) => { e.preventDefault(); e.currentTarget.style.background = "transparent"; const key = e.dataTransfer.getData("text/plain"); if (key) onDropItemToFolder?.(key, f.name); }}
      style={{ borderRadius: T.r6, ...style }}
    >
      {children}
    </div>
  );

  return (
    <div>
      {roots.map((root) => {
        const children = childrenByParent.get(folderKey(root.name)) || [];
        const open = isParentOpen(root);
        return (
          <div key={root.name} style={{ marginBottom: children.length && open ? 4 : 0 }}>
            {renderDropWrap(root,
              <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                {!collapsed && children.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleParent(root.name); }}
                    title={open ? "Collapse" : "Expand"}
                    style={{ ...folderActionBtn, width: 22 }}
                  >
                    <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
                  </button>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <NavItem id={`folder:${root.name}`} icon="folder" label={root.name} count={counts[`folder:${root.name}`]} activeView={activeView} collapsed={collapsed} mobile={mobile} onNavigate={onNavigate} onClose={onClose} />
                </div>
                {renderActions(root, false)}
              </div>
            )}
            {!collapsed && open && children.length > 0 && (
              <div style={{ marginLeft: 22, paddingLeft: 8, borderLeft: `1px solid ${T.borderSub}` }}>
                {children.map((child) => renderDropWrap(child,
                  <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <NavItem id={`folder:${child.name}`} icon={child.kind === "gallery" ? "showcase" : "folder"} label={child.name} count={counts[`folder:${child.name}`]} activeView={activeView} collapsed={collapsed} mobile={mobile} onNavigate={onNavigate} onClose={onClose} />
                    </div>
                    {renderActions(child, true)}
                  </div>,
                  { marginTop: 1 }
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


export default function Sidebar({
  tabs, activeView, onNavigate, folders, onCreateFolder, onCreateGallery, onDeleteFolder, onRenameFolder,
  counts, onSignOut, userEmail, collapsed, onToggleCollapse,
  mobile = false, open = true, onClose, onDropItemToFolder,
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
        <NavItem {...np} id="home" icon="home" label="Home" />
        <NavItem {...np} id="all" icon="vault" label="Everything" count={counts.all} />
        <NavItem {...np} id="favorites" icon="star" label="Favorites" count={counts.favorites} />
        <NavItem {...np} id="continue" icon="clock" label="Continue" count={counts.continue} />
        <NavItem {...np} id="rated" icon="star" label="Rated" count={counts.rated} />

        {/* Legacy tabs disabled in v12. Folders are the native tab-like function now. */}
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
        <FolderTree
          folders={folders}
          counts={counts}
          activeView={activeView}
          collapsed={collapsed}
          mobile={mobile}
          onNavigate={onNavigate}
          onClose={onClose}
          onCreateGallery={onCreateGallery}
          onDeleteFolder={onDeleteFolder}
          onRenameFolder={onRenameFolder}
          onDropItemToFolder={onDropItemToFolder}
        />
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
            <div>
              <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: "none", color: T.text4, fontSize: 12, cursor: "pointer", width: "100%", textAlign: "left", borderRadius: 6 }}>
                <Icon name="plus" size={12} /> New folder
              </button>
              <button onClick={onCreateGallery} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: "none", color: T.text4, fontSize: 12, cursor: "pointer", width: "100%", textAlign: "left", borderRadius: 6 }}>
                <Icon name="showcase" size={12} /> New gallery
              </button>
            </div>
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


const folderActionBtn = {
  width: 26, height: 28, borderRadius: 7, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "none", color: T.text4, cursor: "pointer",
};
