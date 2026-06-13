"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Card from "./Card";
import Player from "./Player";
import ConfigModal from "./ConfigModal";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import QuickAddModal from "./QuickAddModal";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { fetchTabData, itemKey, sourceIdOf } from "@/lib/utils";
import { SOURCE_OPTIONS } from "@/lib/sources";
import {
  supabase, isSupabaseConfigured, getUserData, toggleFavorite,
  setItemFolder, getFolders, createFolder, deleteFolder,
  getSettings, saveSettings, saveProgress,
  getQuickAdds, addQuickAdd, removeQuickAdd,
} from "@/lib/supabase";

const VIEW_MODES = [
  { id: "showcase", icon: "showcase", label: "Showcase" },
  { id: "grid",     icon: "grid",     label: "Grid"     },
  { id: "compact",  icon: "compact",  label: "Compact"  },
  { id: "list",     icon: "list",     label: "List"     },
];

const SORT_OPTIONS = [
  { id: "default", label: "Default"          },
  { id: "alpha",   label: "A → Z"            },
  { id: "recent",  label: "Recently watched" },
  { id: "watched", label: "Most watched"     },
  { id: "source",  label: "By source"        },
];

export default function Vault() {
  const [user, setUser]               = useState(null);
  const [sheetId, setSheetId]         = useState("");
  const [manualTabs, setManualTabs]   = useState(null);
  const [tabs, setTabs]               = useState([]);
  const [activeView, setActiveView]   = useState("all");
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState("");
  const [needsManualTabs, setNeedsManualTabs] = useState(false);

  const [viewMode, setViewMode]   = useState("showcase");
  const [sortBy, setSortBy]       = useState("default");
  const [search, setSearch]       = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const [showSearch, setShowSearch]     = useState(false);
  const [showConfig, setShowConfig]     = useState(false);
  const [showSort, setShowSort]         = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const [activeItem, setActiveItem]       = useState(null);
  const [activeItemIdx, setActiveItemIdx] = useState(0);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen]           = useState(false);
  const [isMobile, setIsMobile]                 = useState(false);
  const [installPrompt, setInstallPrompt]       = useState(null);

  const [userData, setUserData] = useState({});
  const [folders, setFolders]   = useState([]);

  const [quickAdds, setQuickAdds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vv_quick_adds") || "[]"); } catch { return []; }
  });

  const searchRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem("vv_quick_adds", JSON.stringify(quickAdds)); } catch {}
  }, [quickAdds]);

  // PWA install
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  // Responsive
  useEffect(() => {
    const sync = () => setIsMobile(window.innerWidth < 820);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // ── Sheet loader ──────────────────────────────────────────────────────────
  const loadSheet = async (id, manualTabNames = null, initial = false) => {
    if (!id) return;
    initial ? setLoading(true) : setSyncing(true);
    setError(""); setNeedsManualTabs(false);
    try {
      let tabList;
      if (manualTabNames?.length > 0) {
        tabList = manualTabNames.map((name) => ({ name }));
      } else {
        const res  = await fetch(`/api/tabs?id=${encodeURIComponent(id)}`);
        const json = await res.json();
        if (json.error === "NEEDS_MANUAL_TABS") { setNeedsManualTabs(true); setShowConfig(true); setLoading(false); setSyncing(false); return; }
        if (json.error) throw new Error(json.error);
        tabList = json.tabs.map((name) => ({ name }));
      }
      const results = await Promise.all(tabList.map(async (t) => ({ name: t.name, items: await fetchTabData(id, t.name) })));
      setTabs(results);
    } catch (e) { setError(e.message || "Failed to load sheet."); }
    finally { setLoading(false); setSyncing(false); }
  };

  // ── Auth + settings boot ──────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (isSupabaseConfigured()) {
        const { data } = await supabase.auth.getSession();
        const u = data.session?.user;
        setUser(u || null);
        if (u) {
          const [ud, fl, settings, remoteQA] = await Promise.all([
            getUserData(u.id), getFolders(u.id), getSettings(u.id), getQuickAdds(u.id),
          ]);
          setUserData(ud); setFolders(fl);
          if (remoteQA.length > 0) {
            setQuickAdds(remoteQA);
            try { localStorage.setItem("vv_quick_adds", JSON.stringify(remoteQA)); } catch {}
          }
          if (settings?.view_mode) setViewMode(settings.view_mode);
          if (settings?.sheet_id) {
            setSheetId(settings.sheet_id); setManualTabs(settings.manual_tabs || null);
            loadSheet(settings.sheet_id, settings.manual_tabs || null, true); return;
          }
        }
      }
      try {
        const saved = localStorage.getItem("vv_sheet_id");
        const savedTabs = localStorage.getItem("vv_manual_tabs");
        if (saved) {
          setSheetId(saved);
          const mt = savedTabs ? JSON.parse(savedTabs) : null;
          setManualTabs(mt);
          loadSheet(saved, mt, true);
        }
      } catch {}
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveConfig = async (id, newManualTabs) => {
    setSheetId(id);
    const mt = newManualTabs?.length > 0 ? newManualTabs : null;
    setManualTabs(mt);
    try {
      localStorage.setItem("vv_sheet_id", id);
      if (mt) localStorage.setItem("vv_manual_tabs", JSON.stringify(mt));
      else localStorage.removeItem("vv_manual_tabs");
    } catch {}
    if (user) saveSettings(user.id, { sheet_id: id, manual_tabs: mt });
    setShowConfig(false); setNeedsManualTabs(false);
    loadSheet(id, mt, true);
  };

  // ── Aggregated items ──────────────────────────────────────────────────────
  const allItems = useMemo(() => {
    const sheetItems = tabs.flatMap((t) => t.items);
    return [...sheetItems, ...quickAdds];
  }, [tabs, quickAdds]);

  // ── User actions ──────────────────────────────────────────────────────────
  const handleToggleFavorite = async (key, current) => {
    setUserData((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), item_key: key, favorite: !current } }));
    if (user) await toggleFavorite(user.id, key, current);
  };
  const handleAssignFolder = async (key, folder) => {
    setUserData((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), item_key: key, folder } }));
    if (user) await setItemFolder(user.id, key, folder);
  };
  const handleCreateFolder = async (name) => {
    if (folders.some((f) => f.name === name)) return;
    setFolders((prev) => [...prev, { name }].sort((a, b) => a.name.localeCompare(b.name)));
    if (user) await createFolder(user.id, name);
  };
  const handleDeleteFolder = async (name) => {
    setFolders((prev) => prev.filter((f) => f.name !== name));
    setUserData((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k].folder === name) next[k] = { ...next[k], folder: null }; });
      return next;
    });
    if (activeView === `folder:${name}`) setActiveView("all");
    if (user) await deleteFolder(user.id, name);
  };
  const handleViewModeChange = (mode) => { setViewMode(mode); if (user) saveSettings(user.id, { view_mode: mode }); };
  const handleSignOut = async () => { if (supabase) await supabase.auth.signOut(); window.location.reload(); };

  const handleQuickAdd = async (item) => {
    setQuickAdds((prev) => [item, ...prev.filter((i) => i.url !== item.url)]);
    if (user) await addQuickAdd(user.id, item);
  };
  const handleRemoveQuickAdd = async (key) => {
    setQuickAdds((prev) => prev.filter((i) => i.key !== key));
    if (user) await removeQuickAdd(user.id, key);
  };

  const handleMarkWatched = async (key) => {
    const dur = userData[key]?.duration || 3600;
    setUserData((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), item_key: key, progress: dur * 0.96, duration: dur, updated_at: new Date().toISOString() },
    }));
    if (user) await saveProgress(user.id, key, dur * 0.96, dur);
  };

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sortItems = useCallback((items) => {
    if (sortBy === "alpha")   return [...items].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    if (sortBy === "recent")  return [...items].sort((a, b) => new Date(userData[b.key]?.updated_at || 0) - new Date(userData[a.key]?.updated_at || 0));
    if (sortBy === "watched") return [...items].sort((a, b) => (userData[b.key]?.progress || 0) - (userData[a.key]?.progress || 0));
    if (sortBy === "source")  return [...items].sort((a, b) => (a.source || sourceIdOf(a.url)).localeCompare(b.source || sourceIdOf(b.url)));
    return items;
  }, [sortBy, userData]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const viewItems = useMemo(() => {
    let items = allItems;
    if (activeView === "favorites") items = items.filter((i) => userData[i.key]?.favorite);
    else if (activeView === "continue") items = items.filter((i) => { const d = userData[i.key]; return d?.progress > 5 && d?.duration > 0 && d.progress / d.duration < 0.95; });
    else if (activeView === "quick-adds") items = items.filter((i) => i.isQuickAdd || i.tab === "Quick Adds");
    else if (activeView.startsWith("tab:")) items = items.filter((i) => i.tab === activeView.slice(4));
    else if (activeView.startsWith("folder:")) items = items.filter((i) => userData[i.key]?.folder === activeView.slice(7));

    if (sourceFilter !== "all") items = items.filter((i) => (i.source || sourceIdOf(i.url)) === sourceFilter);

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((i) =>
        i.title?.toLowerCase().includes(q) ||
        i.url?.toLowerCase().includes(q) ||
        i.note?.toLowerCase().includes(q) ||
        i.tags?.some((t) => t.includes(q))
      );
    }
    if (activeView !== "continue") items = sortItems(items);
    return items;
  }, [allItems, activeView, sourceFilter, search, userData, sortItems]);

  // ── Open item ─────────────────────────────────────────────────────────────
  const openItem = useCallback((item) => {
    setActiveItem(item);
    setActiveItemIdx(Math.max(0, viewItems.findIndex((i) => i.key === item.key)));
  }, [viewItems]);

  // ── Counts ────────────────────────────────────────────────────────────────
  const counts = {
    all:       allItems.length,
    favorites: allItems.filter((i) => userData[i.key]?.favorite).length,
    continue:  allItems.filter((i) => { const d = userData[i.key]; return d?.progress > 5 && d?.duration > 0 && d.progress / d.duration < 0.95; }).length,
  };
  folders.forEach((f) => { counts[`folder:${f.name}`] = allItems.filter((i) => userData[i.key]?.folder === f.name).length; });

  // ── Source filter pills (only show sources actually present in current set) ─
  const sourcesPresent = useMemo(() => {
    const set = new Set(allItems.map((i) => i.source || sourceIdOf(i.url)));
    return SOURCE_OPTIONS.filter((o) => set.has(o.id));
  }, [allItems]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = (v) => {
    if (v === "settings") { setShowConfig(true); return; }
    setActiveView(v); setSourceFilter("all"); setSearch(""); setShowSearch(false);
    if (isMobile) setSidebarOpen(false);
  };

  const handleBottomTab = (tab) => {
    if (tab === "more") { setSidebarOpen(true); return; }
    if (tab === "search") { setActiveView("all"); setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 100); return; }
    setActiveView(tab); setShowSearch(false); setSearch("");
  };

  const activeBottomTab =
    activeView === "favorites" ? "favorites" :
    activeView === "continue"  ? "continue" :
    showSearch                 ? "search"   : "all";

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  };

  const viewTitle =
    activeView === "all"            ? "Everything"     :
    activeView === "favorites"      ? "Favorites"      :
    activeView === "continue"       ? "Continue"       :
    activeView === "quick-adds"     ? "Quick Adds"     :
    activeView.startsWith("tab:")   ? activeView.slice(4) :
    activeView.startsWith("folder:")? activeView.slice(7) : "";

  const gridStyle = isMobile
    ? { display: "grid", gridTemplateColumns: viewMode === "compact" ? "repeat(3,minmax(0,1fr))" : "repeat(2,minmax(0,1fr))", gap: viewMode === "compact" ? 6 : 10 }
    : viewMode === "showcase" ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }
    : viewMode === "grid"     ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12 }
    : viewMode === "compact"  ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }
    : {};

  const bottomPad = isMobile ? 78 : 0;

  const cardProps = {
    userData,
    onToggleFavorite: handleToggleFavorite,
    folders,
    onAssignFolder: handleAssignFolder,
    isMobile,
    onRemoveQuickAdd: handleRemoveQuickAdd,
    onMarkWatched: handleMarkWatched,
  };

  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: T.bg, color: T.text1, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", overflowX: "hidden" }}>

      <Sidebar
        tabs={[...tabs, ...(quickAdds.length > 0 ? [{ name: "Quick Adds", items: quickAdds }] : [])]}
        activeView={activeView} onNavigate={navigate}
        folders={folders} onCreateFolder={handleCreateFolder} onDeleteFolder={handleDeleteFolder}
        counts={counts}
        onSignOut={isSupabaseConfigured() ? handleSignOut : null} userEmail={user?.email}
        collapsed={isMobile ? false : sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobile={isMobile} open={isMobile ? sidebarOpen : true} onClose={() => setSidebarOpen(false)}
      />

      <div style={{ flex: 1, minWidth: 0, paddingBottom: bottomPad, display: "flex", flexDirection: "column", minHeight: "100dvh" }}>

        {isMobile ? (
          <MobileTopBar
            title={viewTitle}
            onMenu={() => setSidebarOpen(true)}
            onSearch={() => setShowSearch(!showSearch)}
            syncing={syncing} searchOpen={showSearch}
            searchRef={searchRef} search={search} onSearchChange={setSearch}
            onSort={() => setShowSort(!showSort)} sortBy={sortBy}
            onSync={sheetId ? () => loadSheet(sheetId, manualTabs) : null}
            onQuickAdd={() => setShowQuickAdd(true)}
          />
        ) : (
          <DesktopTopBar
            viewTitle={viewTitle} viewItems={viewItems}
            search={search} onSearch={setSearch}
            viewMode={viewMode} onViewMode={handleViewModeChange}
            onSync={sheetId ? () => loadSheet(sheetId, manualTabs) : null} syncing={syncing}
            sortBy={sortBy} onSortChange={setSortBy}
            onQuickAdd={() => setShowQuickAdd(true)}
            installPrompt={installPrompt} onInstall={handleInstall}
          />
        )}

        {isMobile && showSort && (
          <div style={{ display: "flex", gap: 5, padding: "6px 14px", background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${T.borderSub}`, overflowX: "auto", scrollbarWidth: "none" }}>
            {SORT_OPTIONS.map((o) => <Pill key={o.id} active={sortBy === o.id} onClick={() => { setSortBy(o.id); setShowSort(false); }}>{o.label}</Pill>)}
          </div>
        )}

        {tabs.length > 0 && (
          <ScrollRow>
            <Pill active={activeView === "all"} onClick={() => navigate("all")}>All</Pill>
            {tabs.map((t) => <Pill key={t.name} active={activeView === `tab:${t.name}`} onClick={() => navigate(`tab:${t.name}`)}>{t.name}</Pill>)}
            {quickAdds.length > 0 && <Pill active={activeView === "quick-adds"} onClick={() => navigate("quick-adds")}>Quick Adds</Pill>}
          </ScrollRow>
        )}

        {sourcesPresent.length > 1 && (
          <ScrollRow>
            <Pill active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>All sources</Pill>
            {sourcesPresent.map((s) => (
              <Pill key={s.id} active={sourceFilter === s.id} onClick={() => setSourceFilter(sourceFilter === s.id ? "all" : s.id)}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block", marginRight: 6 }} />
                {s.name}
              </Pill>
            ))}
          </ScrollRow>
        )}

        <div style={{ padding: isMobile ? 12 : 24, flex: 1 }}>
          {!sheetId && !loading && !quickAdds.length && (
            <EmptyState
              icon="inbox"
              title="Empty vault"
              sub="Connect a Google Sheet or paste a video URL to get started."
              action={() => setShowConfig(true)}
              actionLabel="Connect sheet"
              secondaryAction={() => setShowQuickAdd(true)}
              secondaryActionLabel="Add a video"
            />
          )}
          {loading && <Spinner />}
          {error && !loading && <ErrorBox msg={error} />}
          {!loading && viewItems.length === 0 && !error && (sheetId || quickAdds.length) && (
            <EmptyState icon="inbox" title="Nothing here" sub={search ? `No results for "${search}"` : "No items in this view."} />
          )}

          {!loading && viewItems.length > 0 && viewMode !== "list" && (
            <div style={gridStyle}>
              {viewItems.map((item) => (
                <Card key={item.id || item.key} item={item} onOpen={openItem}
                  viewMode={isMobile && viewMode === "showcase" ? "grid" : viewMode}
                  {...cardProps} />
              ))}
            </div>
          )}

          {!loading && viewItems.length > 0 && viewMode === "list" && (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r10, overflow: "hidden" }}>
              {viewItems.map((item) => (
                <Card key={item.id || item.key} item={item} onOpen={openItem} viewMode="list" {...cardProps} />
              ))}
            </div>
          )}
        </div>
      </div>

      {isMobile && <BottomNav activeTab={activeBottomTab} onTab={handleBottomTab} />}

      {showConfig && <ConfigModal onSave={handleSaveConfig} onClose={() => !needsManualTabs && setShowConfig(false)} savedId={sheetId} needsManualTabs={needsManualTabs} />}
      {showQuickAdd && <QuickAddModal onAdd={handleQuickAdd} onClose={() => setShowQuickAdd(false)} />}

      {activeItem && (
        <Player
          item={activeItem}
          items={viewItems}
          currentIdx={activeItemIdx}
          onNavigate={(idx) => { setActiveItemIdx(idx); setActiveItem(viewItems[idx]); }}
          onClose={() => setActiveItem(null)}
          userId={user?.id}
          resumeAt={userData[activeItem.key]?.progress || 0}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 0; height: 0; }
        * { box-sizing: border-box; }
        button, a { -webkit-tap-highlight-color: transparent; }
        :focus { outline: none; }
      `}</style>
    </div>
  );
}

// ── Layout pieces ────────────────────────────────────────────────────────────

function MobileTopBar({ title, onMenu, onSearch, syncing, searchOpen, searchRef, search, onSearchChange, onSort, sortBy, onSync, onQuickAdd }) {
  return (
    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.borderSub}`, position: "sticky", top: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", zIndex: 100 }}>
      <button onClick={onMenu} style={iconBtn}><Icon name="menu" size={18} /></button>
      {searchOpen
        ? <input ref={searchRef} value={search} onChange={(e) => onSearchChange?.(e.target.value)} placeholder="Search..." autoFocus style={{ flex: 1, padding: "7px 11px", background: "rgba(255,255,255,0.07)", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text1, fontSize: 14, outline: "none" }} />
        : <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: T.text1, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      }
      {onSort && <button onClick={onSort} style={{ ...iconBtn, background: sortBy !== "default" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)" }}><Icon name="sort" size={16} /></button>}
      {onQuickAdd && <button onClick={onQuickAdd} style={iconBtn} title="Add video"><Icon name="addCircle" size={16} /></button>}
      {onSync && <button onClick={onSync} disabled={syncing} style={iconBtn} title="Sync"><Icon name="sync" size={16} style={{ animation: syncing ? "spin 0.8s linear infinite" : "none" }} /></button>}
      <button onClick={onSearch} style={iconBtn}><Icon name="search" size={16} /></button>
    </div>
  );
}

function DesktopTopBar({ viewTitle, viewItems, search, onSearch, viewMode, onViewMode, onSync, syncing, sortBy, onSortChange, onQuickAdd, installPrompt, onInstall }) {
  const [showSortDrop, setShowSortDrop] = useState(false);
  return (
    <div style={{ padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.borderSub}`, position: "sticky", top: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", zIndex: 100, gap: 12, flexWrap: "wrap" }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: T.text1, letterSpacing: -0.2, display: "flex", alignItems: "center", gap: 8 }}>
        {viewTitle} <span style={{ fontSize: 11, color: T.text4, fontWeight: 400 }}>{viewItems.length}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search..."
          style={{ padding: "6px 11px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 7, color: T.text1, fontSize: 12, outline: "none", width: 150 }} />
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowSortDrop(!showSortDrop)} style={{ ...iconBtn, borderRadius: 7, background: sortBy !== "default" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)" }} title="Sort">
            <Icon name="sort" size={15} />
          </button>
          {showSortDrop && (
            <div style={{ position: "absolute", top: 38, right: 0, background: "rgba(14,14,14,0.97)", backdropFilter: "blur(20px)", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", zIndex: 50, minWidth: 180, boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}>
              {SORT_OPTIONS.map((o) => (
                <button key={o.id} onClick={() => { onSortChange(o.id); setShowSortDrop(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: sortBy === o.id ? "rgba(255,255,255,0.07)" : "transparent", border: "none", color: sortBy === o.id ? T.text1 : T.text2, fontSize: 13, cursor: "pointer" }}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 7, padding: 2, border: `1px solid ${T.border}` }}>
          {VIEW_MODES.map((m) => (
            <button key={m.id} onClick={() => onViewMode(m.id)} title={m.label} style={{ background: viewMode === m.id ? "rgba(255,255,255,0.12)" : "transparent", border: "none", color: viewMode === m.id ? T.text1 : T.text4, cursor: "pointer", borderRadius: 5, padding: "5px 10px" }}>
              <Icon name={m.icon} size={14} />
            </button>
          ))}
        </div>
        <button onClick={onQuickAdd} style={{ ...iconBtn, borderRadius: 7 }} title="Add video"><Icon name="addCircle" size={16} /></button>
        {installPrompt && <button onClick={onInstall} style={{ ...iconBtn, borderRadius: 7 }} title="Install app"><Icon name="download" size={15} /></button>}
        {onSync && <button onClick={onSync} disabled={syncing} style={iconBtn}><Icon name="sync" size={14} style={{ animation: syncing ? "spin 0.8s linear infinite" : "none" }} /></button>}
      </div>
    </div>
  );
}

const ScrollRow = ({ children }) => (
  <div style={{ display: "flex", gap: 6, padding: "7px 16px", borderBottom: `1px solid ${T.borderSub}`, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
    {children}
  </div>
);

const Pill = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{ padding: "4px 12px", background: active ? "rgba(255,255,255,0.1)" : "transparent", border: `1px solid ${active ? T.borderHov : T.border}`, borderRadius: 20, color: active ? T.text1 : T.text4, cursor: "pointer", fontSize: 11, fontWeight: active ? 500 : 400, whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
    {children}
  </button>
);

const Spinner = () => (
  <div style={{ textAlign: "center", padding: "80px 20px" }}>
    <div style={{ width: 28, height: 28, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.5)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
    <div style={{ fontSize: 12, color: T.text4 }}>Loading...</div>
  </div>
);

const ErrorBox = ({ msg }) => (
  <div style={{ background: "rgba(255,60,60,0.05)", border: "1px solid rgba(255,60,60,0.12)", borderRadius: T.r10, padding: "12px 16px", marginBottom: 16 }}>
    <div style={{ fontSize: 13, color: "rgba(255,120,120,0.8)" }}>{msg}</div>
  </div>
);

const EmptyState = ({ icon, title, sub, action, actionLabel, secondaryAction, secondaryActionLabel }) => (
  <div style={{ textAlign: "center", padding: "80px 20px" }}>
    <Icon name={icon || "inbox"} size={36} style={{ color: T.text4, marginBottom: 14 }} />
    <div style={{ fontSize: 16, fontWeight: 500, color: T.text3, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 12, color: T.text4, marginBottom: 20 }}>{sub}</div>
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {action && <button onClick={action} style={{ padding: "9px 20px", background: "#fff", color: "#000", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>{actionLabel}</button>}
      {secondaryAction && <button onClick={secondaryAction} style={{ padding: "9px 20px", background: "rgba(255,255,255,0.08)", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>{secondaryActionLabel}</button>}
    </div>
  </div>
);

const iconBtn = { background: "rgba(255,255,255,0.06)", border: "none", color: T.text2, cursor: "pointer", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
