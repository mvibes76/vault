"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Card from "./Card";
import Player from "./Player";
import ConfigModal from "./ConfigModal";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import QuickAddModal from "./QuickAddModal";
import SheetImportModal from "./SheetImportModal";
import VaultXR from "./VaultXR";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { fetchTabData, itemKey, sourceIdOf, matchesCoverRule, proxiedMediaUrl, normalizeCoverUrl } from "@/lib/utils";
import { SOURCE_OPTIONS, getThumbCandidates } from "@/lib/sources";
import {
  supabase, isSupabaseConfigured, getUserData, toggleFavorite,
  setItemFolder, getFolders, createFolder, deleteFolder, renameFolder, updateFolder, recordFolderView,
  getSettings, saveSettings, saveProgress,
  getVaultItems, upsertVaultItem, removeVaultItem, setItemRating, addMomentMark, recordItemView, recordItemOil,
  getCoverLibrary, upsertCover, deleteCover,
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
  const [activeView, setActiveView]   = useState("home");
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState("");
  const [needsManualTabs, setNeedsManualTabs] = useState(false);

  const [viewMode, setViewMode]   = useState("showcase");
  const [sortBy, setSortBy]       = useState("default");
  const [search, setSearch]       = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [folderMediaFilter, setFolderMediaFilter] = useState("all");
  const [flatEverything, setFlatEverything] = useState(false);
  const [flatFolderView, setFlatFolderView] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const [showSearch, setShowSearch]     = useState(false);
  const [showConfig, setShowConfig]     = useState(false);
  const [showSort, setShowSort]         = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFilterPills, setShowFilterPills] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [coverRules, setCoverRules] = useState([]); // legacy text rules kept for old installs
  const [coverLibrary, setCoverLibrary] = useState([]);

  const [activeItem, setActiveItem]       = useState(null);
  const [activeItemIdx, setActiveItemIdx] = useState(0);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen]           = useState(false);
  const [isMobile, setIsMobile]                 = useState(false);
  const [installPrompt, setInstallPrompt]       = useState(null);
  const [xrSupported, setXrSupported]           = useState(false);
  const [showXR, setShowXR]                     = useState(false);

  const [userData, setUserData] = useState({});
  const [folders, setFolders]   = useState([]);

  const [quickAdds, setQuickAdds] = useState([]); // v12: app-native vault items, kept as quickAdds internally for compatibility
  const [quickAddsHydrated, setQuickAddsHydrated] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    try { setQuickAdds(JSON.parse(localStorage.getItem("vv_quick_adds") || "[]")); }
    catch { setQuickAdds([]); }
    finally { setQuickAddsHydrated(true); }
  }, []);

  useEffect(() => {
    if (!quickAddsHydrated) return;
    try { localStorage.setItem("vv_quick_adds", JSON.stringify(quickAdds)); } catch {}
  }, [quickAdds, quickAddsHydrated]);

  // Supabase realtime: keep open devices in sync when tables have realtime enabled.
  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase
      .channel(`vault-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_items", filter: `user_id=eq.${user.id}` }, async () => {
        const items = await getVaultItems(user.id);
        setQuickAdds(items);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_data", filter: `user_id=eq.${user.id}` }, async () => {
        const data = await getUserData(user.id);
        setUserData(data);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_folders", filter: `user_id=eq.${user.id}` }, async () => {
        const nextFolders = await getFolders(user.id);
        setFolders(nextFolders);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_covers", filter: `user_id=eq.${user.id}` }, async () => {
        const nextCovers = await getCoverLibrary(user.id);
        setCoverLibrary(nextCovers);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // WebXR Lite detection
  useEffect(() => {
    let alive = true;
    const detect = async () => {
      try {
        const ok = !!navigator.xr && await navigator.xr.isSessionSupported("immersive-vr");
        if (alive) setXrSupported(!!ok);
      } catch { if (alive) setXrSupported(false); }
    };
    detect();
    return () => { alive = false; };
  }, []);

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
          const [ud, fl, settings, remoteQA, covers] = await Promise.all([
            getUserData(u.id), getFolders(u.id), getSettings(u.id), getVaultItems(u.id), getCoverLibrary(u.id),
          ]);
          setUserData(ud); setFolders(fl); setCoverLibrary(covers || []);
          if (remoteQA.length > 0) {
            setQuickAdds(remoteQA);
            try { localStorage.setItem("vv_quick_adds", JSON.stringify(remoteQA)); } catch {}
          }
          if (settings?.view_mode) setViewMode(settings.view_mode);
          if (Array.isArray(settings?.cover_rules)) setCoverRules(settings.cover_rules);
          if (settings?.sheet_id) {
            // v12: Sheets is a mirror, not a source. Keep the id for legacy settings, but do not load tabs.
            setSheetId(settings.sheet_id); setManualTabs(settings.manual_tabs || null);
          }
        }
      }
      try {
        const saved = localStorage.getItem("vv_sheet_id");
        const savedTabs = localStorage.getItem("vv_manual_tabs");
        if (saved) {
          // v12 keeps legacy sheet id only for reference. App data loads from Supabase/local vault items.
          setSheetId(saved);
          const mt = savedTabs ? JSON.parse(savedTabs) : null;
          setManualTabs(mt);
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
  };

  // ── Aggregated items ──────────────────────────────────────────────────────
  const canonicalFolderName = useCallback((name, folderList = folders) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const match = folderList.find((f) => String(f.name || "").trim().toLowerCase() === trimmed.toLowerCase());
    return match?.name || trimmed;
  }, [folders]);

  const folderEquals = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

  const mediaKindOf = useCallback((item) => {
    const type = String(item?.type || "").toLowerCase();
    const source = String(item?.source || sourceIdOf(item?.url || "")).toLowerCase();
    const url = String(item?.url || "").split("?")[0].toLowerCase();
    if (type.includes("image") || source === "image" || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(url)) return "photo";
    if (type.includes("pdf") || source === "pdf" || url.endsWith(".pdf")) return "pdf";
    if (type.includes("video") || ["youtube","vimeo","drive","reddit","tiktok","twitch","hls","video","direct"].includes(source) || /\.(mp4|webm|mov|m4v|m3u8)$/i.test(url)) return "video";
    return "link";
  }, []);

  const folderForItem = useCallback((item) => userData[item?.key]?.folder || item?.folder || null, [userData]);

  const applyCoverRules = useCallback((item) => {
    if (!item) return item;

    // Per-item choices win.
    // manual = custom cover or imported Sheet thumbnail.
    // original = keep provider/source/metadata cover and bypass uniform Cover Library.
    const mode = item.cover_mode || (item.thumbnail_source === "manual" || item.thumbnail_source === "sheet" ? "manual" : "auto");
    if (mode === "manual" || item.thumbnail_source === "manual" || item.thumbnail_source === "sheet") return { ...item, cover_mode: "manual" };
    if (mode === "original") return { ...item, cover_mode: "original" };

    const sortedCovers = [...(coverLibrary || [])]
      .filter((c) => c?.enabled !== false && c?.thumbnail)
      .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));
    const cover = sortedCovers.find((c) => matchesCoverRule(item, c));
    if (cover?.thumbnail) {
      return {
        ...item,
        thumbnail: cover.thumbnail,
        thumbnail_source: "cover_library",
        cover_mode: "auto",
        cover_label: cover.label,
        cover_fit: cover.cover_fit || item.cover_fit || "cover",
        cover_position_x: Number.isFinite(Number(cover.cover_position_x)) ? Number(cover.cover_position_x) : (item.cover_position_x || 50),
        cover_position_y: Number.isFinite(Number(cover.cover_position_y)) ? Number(cover.cover_position_y) : (item.cover_position_y || 50),
      };
    }

    // Legacy support for old text rules saved in user_settings.cover_rules.
    if (!item.thumbnail && coverRules.length) {
      const legacy = coverRules.find((r) => matchesCoverRule(item, { label: r.tag, keywords: [r.tag], thumbnail: r.thumbnail, match_type: "any", enabled: true }));
      if (legacy?.thumbnail) return { ...item, thumbnail: legacy.thumbnail, thumbnail_source: "cover_rule", cover_mode: "auto" };
    }
    return { ...item, cover_mode: mode };
  }, [coverLibrary, coverRules]);

  const inferFolderForItem = useCallback((item) => {
    if (item?.folder) return canonicalFolderName(item.folder);
    const haystack = [item?.title, item?.note, item?.url, ...(Array.isArray(item?.tags) ? item.tags : [])]
      .filter(Boolean).join(" ").toLowerCase();
    const match = folders.find((f) => f?.name && haystack.includes(String(f.name).toLowerCase()));
    return match?.name || null;
  }, [folders, canonicalFolderName]);

  const allItems = useMemo(() => (Array.isArray(quickAdds) ? quickAdds : [])
    .filter((i) => i && (i.url || i.thumbnail) && i.key)
    .map(applyCoverRules), [quickAdds, applyCoverRules]);
  const itemsForFolder = useCallback((name, items = allItems) => items.filter((i) => folderEquals(folderForItem(i), name)), [allItems, folderForItem]);

  // ── User actions ──────────────────────────────────────────────────────────
  const handleToggleFavorite = async (key, current) => {
    setUserData((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), item_key: key, favorite: !current } }));
    if (user) await toggleFavorite(user.id, key, current);
  };
  const handleAssignFolder = async (key, folder) => {
    const normalized = canonicalFolderName(folder);
    setUserData((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), item_key: key, folder: normalized } }));
    setQuickAdds((prev) => prev.map((i) => i.key === key ? { ...i, folder: normalized } : i));
    if (user) {
      await setItemFolder(user.id, key, normalized);
      const item = quickAdds.find((i) => i.key === key);
      if (item) await upsertVaultItem(user.id, { ...item, folder: normalized });
      fetch("/api/sheets-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert", ...(item || {}), folder: normalized }),
      }).catch(() => {});
    }
  };
  const handleCreateFolder = async (name, options = {}) => {
    const cleaned = String(name || "").trim();
    if (!cleaned) return null;
    const existing = folders.find((f) => folderEquals(f.name, cleaned));
    if (existing) return existing.name;
    setFolders((prev) => [...prev, { name: cleaned, kind: options.kind || "folder", display_mode: options.display_mode || "grid", cover: options.cover || "", note: options.note || "", parent_folder: options.parent_folder || null }].sort((a, b) => a.name.localeCompare(b.name)));
    if (user) await createFolder(user.id, cleaned, options);
    return cleaned;
  };
  const handleDeleteFolder = async (name) => {
    const canonical = canonicalFolderName(name);
    const affectedItems = quickAdds.filter((i) => folderEquals(i.folder, canonical)).map((i) => ({ ...i, folder: null }));
    setFolders((prev) => prev.filter((f) => !folderEquals(f.name, canonical)));
    setQuickAdds((prev) => prev.map((i) => folderEquals(i.folder, canonical) ? { ...i, folder: null } : i));
    setUserData((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (folderEquals(next[k].folder, canonical)) next[k] = { ...next[k], folder: null }; });
      return next;
    });
    if (activeView === `folder:${canonical}`) setActiveView("all");
    if (user) await deleteFolder(user.id, canonical);
    if (affectedItems.length) {
      fetch("/api/sheets-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_upsert", items: affectedItems }),
      }).catch(() => {});
    }
  };

  const handleRenameFolder = async (oldName, newName) => {
    const from = canonicalFolderName(oldName);
    const clean = String(newName || "").trim();
    if (!from || !clean) return;
    const existing = folders.find((f) => folderEquals(f.name, clean));
    const target = existing?.name || clean;
    setFolders((prev) => {
      const source = prev.find((f) => folderEquals(f.name, from)) || { kind: "folder", display_mode: "grid" };
      const filtered = prev.filter((f) => !folderEquals(f.name, from));
      return [...filtered.map((f) => folderEquals(f.parent_folder, from) ? { ...f, parent_folder: target } : f), { ...source, name: target }].filter((f, idx, arr) => arr.findIndex((x) => folderEquals(x.name, f.name)) === idx).sort((a,b) => a.name.localeCompare(b.name));
    });
    setQuickAdds((prev) => prev.map((i) => folderEquals(i.folder, from) ? { ...i, folder: target } : i));
    setUserData((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (folderEquals(next[k].folder, from)) next[k] = { ...next[k], folder: target }; });
      return next;
    });
    if (activeView === `folder:${from}`) setActiveView(`folder:${target}`);
    if (user) await renameFolder(user.id, from, target);
    const affectedItems = quickAdds.filter((i) => folderEquals(i.folder, from)).map((i) => ({ ...i, folder: target }));
    if (affectedItems.length) fetch("/api/sheets-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk_upsert", items: affectedItems }) }).catch(() => {});
  };

  const handleUpdateFolderSettings = async (name, patch = {}) => {
    const canonical = canonicalFolderName(name);
    if (!canonical) return;
    const nextName = String(patch.name || "").trim();
    const metaPatch = { ...patch };
    delete metaPatch.name;
    if (nextName && !folderEquals(nextName, canonical)) {
      await handleRenameFolder(canonical, nextName);
      if (Object.keys(metaPatch).length && user) await updateFolder(user.id, nextName, metaPatch).catch(() => {});
      setFolders((prev) => prev.map((f) => folderEquals(f.name, nextName) ? { ...f, ...metaPatch } : f));
      return;
    }
    setFolders((prev) => prev.map((f) => folderEquals(f.name, canonical) ? { ...f, ...metaPatch } : f));
    if (user) await updateFolder(user.id, canonical, metaPatch).catch(() => {});
  };

  const handleCreateGallery = async (parentFolder = null) => {
    const name = window.prompt(parentFolder ? `Gallery name inside ${parentFolder}` : "Gallery name");
    if (!name?.trim()) return;
    const options = { kind: "gallery", display_mode: "grid", parent_folder: parentFolder || null };
    await handleCreateFolder(name.trim(), options);
    setActiveView(`folder:${canonicalFolderName(name.trim()) || name.trim()}`);
  };

  const handleSaveCoverRules = async (rules) => {
    setCoverRules(rules);
    if (user) await saveSettings(user.id, { cover_rules: rules });
  };

  const handleSaveCover = async (cover) => {
    const local = {
      ...cover,
      id: cover.id || `local-${Date.now()}`,
      keywords: Array.isArray(cover.keywords) ? cover.keywords : [],
      enabled: cover.enabled !== false,
      priority: Number.isFinite(Number(cover.priority)) ? Number(cover.priority) : 100,
      cover_fit: cover.cover_fit || "cover",
      cover_position_x: Number.isFinite(Number(cover.cover_position_x)) ? Number(cover.cover_position_x) : 50,
      cover_position_y: Number.isFinite(Number(cover.cover_position_y)) ? Number(cover.cover_position_y) : 50,
    };
    setCoverLibrary((prev) => [local, ...prev.filter((c) => c.id !== local.id)].sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100) || String(a.label || "").localeCompare(String(b.label || ""))));
    if (user) {
      const saved = await upsertCover(user.id, local);
      if (saved) setCoverLibrary((prev) => [saved, ...prev.filter((c) => c.id !== local.id && c.id !== saved.id)].sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100) || String(a.label || "").localeCompare(String(b.label || ""))));
    }
  };

  const handleDeleteCover = async (coverId) => {
    setCoverLibrary((prev) => prev.filter((c) => c.id !== coverId));
    if (user && coverId && !String(coverId).startsWith("local-")) await deleteCover(user.id, coverId);
  };

  const handleViewModeChange = (mode) => { setViewMode(mode); if (user) saveSettings(user.id, { view_mode: mode }); };
  const handleSignOut = async () => { if (supabase) await supabase.auth.signOut(); window.location.reload(); };

  const handleQuickAdd = async (item) => {
    const normalizedItem = { ...item, folder: inferFolderForItem(item) };
    setQuickAdds((prev) => [normalizedItem, ...prev.filter((i) => i.url !== normalizedItem.url && i.key !== normalizedItem.key && i.key !== normalizedItem.previousKey)]);
    if (user && normalizedItem.previousKey && normalizedItem.previousKey !== normalizedItem.key) await removeVaultItem(user.id, normalizedItem.previousKey);
    if (user) await upsertVaultItem(user.id, normalizedItem);
    if (normalizedItem.previousKey && normalizedItem.previousKey !== normalizedItem.key) {
      fetch("/api/sheets-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", key: normalizedItem.previousKey }) }).catch(() => {});
    }
    fetch("/api/sheets-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", ...normalizedItem }),
    }).catch(() => {});
  };
  const handleRemoveQuickAdd = async (key) => {
    setQuickAdds((prev) => prev.filter((i) => i.key !== key));
    if (user) await removeVaultItem(user.id, key);
    fetch("/api/sheets-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", key }),
    }).catch(() => {});
  };

  const handleSheetImport = async (items) => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return { imported: 0, updated: 0, skipped: 0, foldersCreated: 0 };
    const existingKeys = new Set(quickAdds.map((i) => i.key));
    const byKey = new Map();
    list.forEach((item) => {
      if (!item?.url || !item?.key) return;
      byKey.set(item.key, { ...item, isVaultItem: true, addedAt: item.addedAt || new Date().toISOString() });
    });

    // Folder identity is case-insensitive, but display casing is preserved from the
    // first existing folder. Example: if "Main" exists, imported "main" maps to "Main".
    // If no match exists, the imported spelling becomes the folder display name.
    const existingByLower = new Map(folders.map((f) => [String(f.name || "").trim().toLowerCase(), f.name]));
    const newFolderByLower = new Map();
    const cleanItems = [...byKey.values()].map((item) => {
      const rawFolder = String(item.folder || "").trim();
      if (!rawFolder) return { ...item, folder: inferFolderForItem(item) };
      const lower = rawFolder.toLowerCase();
      const resolved = existingByLower.get(lower) || newFolderByLower.get(lower) || rawFolder;
      if (!existingByLower.has(lower)) newFolderByLower.set(lower, resolved);
      return { ...item, folder: resolved };
    });
    const folderMeta = new Map();
    cleanItems.forEach((i) => {
      if (!i.folder) return;
      const lower = String(i.folder).trim().toLowerCase();
      const current = folderMeta.get(lower) || { name: i.folder, kind: "folder" };
      if (i.folder_kind === "gallery") current.kind = "gallery";
      folderMeta.set(lower, current);
    });
    const existingFolderNamesLower = new Set(folders.map((f) => String(f.name || "").trim().toLowerCase()));
    const newFolders = [...folderMeta.values()].filter((f) => !existingFolderNamesLower.has(String(f.name || "").trim().toLowerCase()));

    if (newFolders.length) {
      setFolders((prev) => [...prev, ...newFolders.map((f) => ({ name: f.name, kind: f.kind || "folder", display_mode: f.kind === "gallery" ? "slideshow" : "grid" }))].sort((a, b) => a.name.localeCompare(b.name)));
      if (user) await Promise.all(newFolders.map((f) => createFolder(user.id, f.name, { kind: f.kind || "folder", display_mode: f.kind === "gallery" ? "slideshow" : "grid" }).catch(() => {})));
    }

    setQuickAdds((prev) => {
      const imported = new Map(cleanItems.map((i) => [i.key, i]));
      const kept = prev.filter((i) => !imported.has(i.key));
      return [...cleanItems, ...kept];
    });

    if (user) {
      for (const item of cleanItems) await upsertVaultItem(user.id, item);
    }

    fetch("/api/sheets-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_upsert", items: cleanItems }),
    }).catch(() => {});

    return {
      imported: cleanItems.filter((i) => !existingKeys.has(i.key)).length,
      updated: cleanItems.filter((i) => existingKeys.has(i.key)).length,
      skipped: Math.max(0, list.length - cleanItems.length),
      foldersCreated: newFolders.length,
    };
  };

  const handleSetRating = async (key, rating) => {
    const nextRating = rating || null;
    setUserData((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), item_key: key, rating: nextRating, rated_at: nextRating ? new Date().toISOString() : null, updated_at: new Date().toISOString() },
    }));
    if (user) await setItemRating(user.id, key, nextRating);
  };

  const handleAddMomentMark = async (key, mark) => {
    if (user) await addMomentMark(user.id, key, mark);
  };

  const handleOilItem = async (key) => {
    const now = new Date().toISOString();
    setUserData((prev) => {
      const current = prev[key] || {};
      return {
        ...prev,
        [key]: {
          ...current,
          item_key: key,
          oil_count: Number(current.oil_count || 0) + 1,
          last_oiled_at: now,
          updated_at: now,
        },
      };
    });
    if (user) await recordItemOil(user.id, key).catch(() => {});
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
    else if (activeView === "rated") items = items.filter((i) => userData[i.key]?.rating);
    else if (activeView.startsWith("tab:")) items = items.filter((i) => (userData[i.key]?.folder || i.folder) === activeView.slice(4));
    else if (activeView.startsWith("folder:")) items = items.filter((i) => folderEquals(folderForItem(i), activeView.slice(7)));

    if (sourceFilter !== "all") items = items.filter((i) => (i.source || sourceIdOf(i.url)) === sourceFilter);
    if (activeView.startsWith("folder:") && folderMediaFilter !== "all") items = items.filter((i) => mediaKindOf(i) === folderMediaFilter);

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((i) =>
        i.title?.toLowerCase().includes(q) ||
        i.url?.toLowerCase().includes(q) ||
        String(i.note || "").toLowerCase().includes(q) ||
        (Array.isArray(i.tags) && i.tags.some((t) => String(t || "").toLowerCase().includes(q)))
      );
    }
    if (activeView !== "continue") items = sortItems(items);
    return items;
  }, [allItems, activeView, sourceFilter, search, userData, sortItems, folderForItem, folderMediaFilter, mediaKindOf]);

  // ── Open item + view tracking ─────────────────────────────────────────────
  const openItem = useCallback((item) => {
    const now = new Date().toISOString();
    setUserData((prev) => {
      const current = prev[item.key] || {};
      return {
        ...prev,
        [item.key]: {
          ...current,
          item_key: item.key,
          view_count: Number(current.view_count || 0) + 1,
          first_viewed_at: current.first_viewed_at || now,
          last_viewed_at: now,
          updated_at: now,
        },
      };
    });
    if (user) recordItemView(user.id, item.key).catch(() => {});
    setActiveItem(item);
    setActiveItemIdx(Math.max(0, viewItems.findIndex((i) => i.key === item.key)));
  }, [viewItems, user]);

  // ── Counts ────────────────────────────────────────────────────────────────
  const counts = {
    all:       allItems.length,
    favorites: allItems.filter((i) => userData[i.key]?.favorite).length,
    continue:  allItems.filter((i) => { const d = userData[i.key]; return d?.progress > 5 && d?.duration > 0 && d.progress / d.duration < 0.95; }).length,
    rated:     allItems.filter((i) => userData[i.key]?.rating).length,
  };
  folders.forEach((f) => { counts[`folder:${f.name}`] = itemsForFolder(f.name).length; });

  // ── Source filter pills (only show sources actually present in current set) ─
  const sourcesPresent = useMemo(() => {
    const set = new Set(allItems.map((i) => i.source || sourceIdOf(i.url)));
    return SOURCE_OPTIONS.filter((o) => set.has(o.id));
  }, [allItems]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = (v) => {
    if (v === "settings") { setShowConfig(true); return; }
    setActiveView(v); setSourceFilter("all"); setSearch(""); setShowSearch(false); setSelectMode(false); setSelectedKeys(new Set());
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

  useEffect(() => {
    if (!activeView.startsWith("folder:")) return;
    const name = activeView.slice(7);
    const now = new Date().toISOString();
    setFolders((prev) => prev.map((f) => folderEquals(f.name, name) ? { ...f, last_viewed_at: now, view_count: Number(f.view_count || 0) + 1 } : f));
    if (user) recordFolderView(user.id, name).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, user?.id]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  };

  const viewTitle =
    activeView === "home"           ? "Home"           :
    activeView === "all"            ? "Everything"     :
    activeView === "favorites"      ? "Favorites"      :
    activeView === "continue"       ? "Continue"       :
    activeView === "rated"          ? "Rated"          :
    activeView.startsWith("tab:")   ? activeView.slice(4) :
    activeView.startsWith("folder:")? activeView.slice(7) : "";

  const gridStyle = isMobile
    ? { display: "grid", gridTemplateColumns: viewMode === "compact" ? "repeat(3,minmax(0,1fr))" : "repeat(2,minmax(0,1fr))", gap: viewMode === "compact" ? 6 : 10 }
    : viewMode === "showcase" ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }
    : viewMode === "grid"     ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 12 }
    : viewMode === "compact"  ? { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }
    : {};

  const bottomPad = isMobile ? 78 : 0;

  const recentlyViewed = useMemo(() => [...allItems]
    .filter((i) => userData[i.key]?.last_viewed_at)
    .sort((a, b) => new Date(userData[b.key]?.last_viewed_at || 0) - new Date(userData[a.key]?.last_viewed_at || 0))
    .slice(0, 8), [allItems, userData]);
  const continueItems = useMemo(() => allItems
    .filter((i) => { const d = userData[i.key]; return d?.progress > 5 && d?.duration > 0 && d.progress / d.duration < 0.95; })
    .slice(0, 8), [allItems, userData]);
  const topRatedItems = useMemo(() => [...allItems]
    .filter((i) => userData[i.key]?.rating)
    .sort((a, b) => (userData[b.key]?.rating || 0) - (userData[a.key]?.rating || 0))
    .slice(0, 8), [allItems, userData]);
  const recentlyAdded = useMemo(() => [...allItems]
    .sort((a, b) => new Date(b.addedAt || b.updatedAt || 0) - new Date(a.addedAt || a.updatedAt || 0))
    .slice(0, 8), [allItems]);
  const mostOiledItems = useMemo(() => [...allItems]
    .filter((i) => Number(userData[i.key]?.oil_count || 0) > 0)
    .sort((a, b) => Number(userData[b.key]?.oil_count || 0) - Number(userData[a.key]?.oil_count || 0))
    .slice(0, 8), [allItems, userData]);
  const totalViews = useMemo(() => allItems.reduce((sum, i) => sum + Number(userData[i.key]?.view_count || 0), 0), [allItems, userData]);
  const folderCards = useMemo(() => folders.filter((folder) => folder?.name).map((folder) => {
    const items = itemsForFolder(folder.name);
    const coverItem = items.find((i) => i.thumbnail) || items[0];
    return { folder, items, count: items.length, coverItem };
  }).filter((g) => g.count > 0 || g.folder.kind === "gallery"), [folders, itemsForFolder]);
  const rootFolderCards = useMemo(() => folderCards.filter((g) => !g.folder.parent_folder), [folderCards]);
  const childGalleryCards = useMemo(() => {
    if (!activeView.startsWith("folder:")) return [];
    const parentName = activeView.slice(7);
    return folderCards.filter((g) => folderEquals(g.folder.parent_folder, parentName));
  }, [activeView, folderCards]);
  const recentGalleries = useMemo(() => [...folderCards]
    .filter((g) => g.folder.last_viewed_at)
    .sort((a, b) => new Date(b.folder.last_viewed_at || 0) - new Date(a.folder.last_viewed_at || 0))
    .slice(0, 6), [folderCards]);
  const activeFolder = activeView.startsWith("folder:") ? folders.find((f) => folderEquals(f.name, activeView.slice(7))) : null;

  useEffect(() => {
    if (!activeView.startsWith("folder:")) return;
    if (folders.length === 0) return;
    const wanted = activeView.slice(7);
    const exists = folders.some((f) => folderEquals(f.name, wanted));
    if (!exists) setActiveView("all");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, folders]);
  const descendantFolderNames = useCallback((name) => {
    const seen = new Set();
    const walk = (parent) => {
      folders.forEach((f) => {
        if (folderEquals(f.parent_folder, parent) && !seen.has(String(f.name).toLowerCase())) {
          seen.add(String(f.name).toLowerCase());
          walk(f.name);
        }
      });
    };
    walk(name);
    return folders.filter((f) => seen.has(String(f.name).toLowerCase())).map((f) => f.name);
  }, [folders]);
  const activeFolderItemsAll = activeFolder ? itemsForFolder(activeFolder.name) : [];
  const activeFolderFlatItems = useMemo(() => {
    if (!activeFolder) return [];
    const names = [activeFolder.name, ...descendantFolderNames(activeFolder.name)];
    return allItems.filter((i) => names.some((n) => folderEquals(folderForItem(i), n)));
  }, [activeFolder, descendantFolderNames, allItems, folderForItem]);
  const activeFolderKinds = activeFolder ? ["all", ...[...new Set((flatFolderView ? activeFolderFlatItems : activeFolderItemsAll).map(mediaKindOf))].filter(Boolean)] : ["all"];
  const showOrganizerOnly = activeView === "all" && rootFolderCards.length > 0 && !flatEverything && !search && sourceFilter === "all";
  const renderedItems = useMemo(() => {
    if (!activeFolder || !flatFolderView) return viewItems;
    let items = activeFolderFlatItems;
    if (sourceFilter !== "all") items = items.filter((i) => (i.source || sourceIdOf(i.url)) === sourceFilter);
    if (folderMediaFilter !== "all") items = items.filter((i) => mediaKindOf(i) === folderMediaFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((i) =>
        i.title?.toLowerCase().includes(q) ||
        i.url?.toLowerCase().includes(q) ||
        i.note?.toLowerCase().includes(q) ||
        i.tags?.some((t) => String(t).toLowerCase().includes(q))
      );
    }
    return sortItems(items);
  }, [activeFolder, flatFolderView, activeFolderFlatItems, viewItems, sourceFilter, folderMediaFilter, search, mediaKindOf, sortItems]);

  const activeFolderCanSlideshow = !!activeFolder;
  const showFolderSlideshow = activeFolderCanSlideshow && activeFolder.display_mode === "slideshow" && renderedItems.length > 0 && viewMode !== "list";

  const selectedItems = useMemo(() => renderedItems.filter((i) => selectedKeys.has(i.key)), [renderedItems, selectedKeys]);

  const handleBulkMove = async (folder) => {
    const keys = [...selectedKeys];
    for (const key of keys) await handleAssignFolder(key, folder);
    setSelectedKeys(new Set()); setSelectMode(false);
  };

  const handleBulkDelete = async () => {
    const keys = [...selectedKeys];
    if (!keys.length) return;
    const ok = window.confirm(`Delete ${keys.length} selected item${keys.length === 1 ? "" : "s"}?`);
    if (!ok) return;
    for (const key of keys) await handleRemoveQuickAdd(key);
    setSelectedKeys(new Set()); setSelectMode(false);
  };

  const makeBackupPayload = useCallback(() => ({
    version: "v33",
    exportedAt: new Date().toISOString(),
    user: user ? { id: user.id, email: user.email } : null,
    items: allItems,
    folders,
    userData,
    coverLibrary,
    settings: { sheetId, manualTabs, viewMode, coverRules },
  }), [user, allItems, folders, userData, coverLibrary, sheetId, manualTabs, viewMode, coverRules]);

  const downloadFile = useCallback((filename, mime, content) => {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || "Export failed.");
    }
  }, []);

  const handleExportJSON = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadFile(`video-vault-backup-${stamp}.json`, "application/json", JSON.stringify(makeBackupPayload(), null, 2));
  }, [downloadFile, makeBackupPayload]);

  const handleExportCSV = useCallback(() => {
    const cols = ["Title", "URL", "Folder", "Tags", "Notes", "Type", "Source", "Thumbnail", "Rating", "Views", "Last Viewed"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = allItems.map((i) => {
      const d = userData[i.key] || {};
      return [i.title, i.url, folderForItem(i), Array.isArray(i.tags) ? i.tags.join(", ") : "", i.note, i.type, i.source, i.thumbnail, d.rating || "", d.view_count || 0, d.last_viewed_at || ""].map(esc).join(",");
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadFile(`video-vault-export-${stamp}.csv`, "text/csv", [cols.map(esc).join(","), ...rows].join("\n"));
  }, [allItems, userData, folderForItem, downloadFile]);

  const diagnostics = useMemo(() => ({
    supabaseConfigured: isSupabaseConfigured(),
    itemCount: allItems.length,
    folderCount: folders.length,
    rootFolderCount: folders.filter((f) => !f.parent_folder).length,
    childFolderCount: folders.filter((f) => !!f.parent_folder).length,
    coverCount: coverLibrary.length,
    ratedCount: allItems.filter((i) => userData[i.key]?.rating).length,
    viewCount: totalViews,
    activeView,
    isMobile,
  }), [allItems, folders, coverLibrary, userData, totalViews, activeView, isMobile]);

  const cardProps = {
    userData,
    onToggleFavorite: handleToggleFavorite,
    folders,
    onAssignFolder: handleAssignFolder,
    isMobile,
    onRemoveQuickAdd: handleRemoveQuickAdd,
    onMarkWatched: handleMarkWatched,
    onSetRating: handleSetRating,
    onDragItem: () => {},
    onEditItem: setEditingItem,
    onSelect: selectMode ? (item) => setSelectedKeys((prev) => { const next = new Set(prev); next.has(item.key) ? next.delete(item.key) : next.add(item.key); return next; }) : null,
  };

  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: T.bg, color: T.text1, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", overflowX: "hidden" }}>

      <Sidebar
        tabs={[]}
        activeView={activeView} onNavigate={navigate}
        folders={folders} onCreateFolder={handleCreateFolder} onCreateGallery={handleCreateGallery} onDeleteFolder={handleDeleteFolder} onRenameFolder={handleRenameFolder} onDropItemToFolder={handleAssignFolder}
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
            onImport={() => setShowImport(true)}
            onQuickAdd={() => setShowQuickAdd(true)}
            xrSupported={xrSupported}
            onEnterXR={() => setShowXR(true)}
          />
        ) : (
          <DesktopTopBar
            viewTitle={viewTitle} viewItems={viewItems}
            search={search} onSearch={setSearch}
            viewMode={viewMode} onViewMode={handleViewModeChange}
            onImport={() => setShowImport(true)} syncing={syncing}
            sortBy={sortBy} onSortChange={setSortBy}
            onQuickAdd={() => setShowQuickAdd(true)}
            installPrompt={installPrompt} onInstall={handleInstall}
            showFilterPills={showFilterPills} onToggleFilters={() => setShowFilterPills((v) => !v)}
            xrSupported={xrSupported}
            onEnterXR={() => setShowXR(true)}
          />
        )}

        {isMobile && showSort && (
          <div style={{ display: "flex", gap: 5, padding: "6px 14px", background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${T.borderSub}`, overflowX: "auto", scrollbarWidth: "none" }}>
            {SORT_OPTIONS.map((o) => <Pill key={o.id} active={sortBy === o.id} onClick={() => { setSortBy(o.id); setShowSort(false); }}>{o.label}</Pill>)}
          </div>
        )}

        {showFilterPills && folders.length > 0 && (
          <ScrollRow>
            <Pill active={activeView === "all"} onClick={() => navigate("all")}>All</Pill>
            {folders.map((f) => <Pill key={f.name} active={activeView === `folder:${f.name}`} onClick={() => navigate(`folder:${f.name}`)}>{f.name}</Pill>)}
          </ScrollRow>
        )}

        {showFilterPills && sourcesPresent.length > 1 && (
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
          {!loading && activeView === "home" && (
            <Dashboard
              isMobile={isMobile}
              allItems={allItems}
              folders={folders}
              folderCards={rootFolderCards}
              recentGalleries={recentGalleries}
              totalViews={totalViews}
              continueItems={continueItems}
              recentlyViewed={recentlyViewed}
              recentlyAdded={recentlyAdded}
              topRatedItems={topRatedItems}
              mostOiledItems={mostOiledItems}
              userData={userData}
              onOpen={openItem}
              onNavigate={navigate}
              onQuickAdd={() => setShowQuickAdd(true)}
              onImport={() => setShowImport(true)}
              onCreateGallery={handleCreateGallery}
              cardProps={cardProps}
            />
          )}

          {!loading && activeView === "all" && rootFolderCards.length > 0 && (
            <OrganizerStrip
              isMobile={isMobile}
              flatEverything={flatEverything}
              onToggleFlat={() => setFlatEverything((v) => !v)}
              galleries={rootFolderCards}
              onOpenGallery={(name) => navigate(`folder:${name}`)}
              onCreateGallery={handleCreateGallery}
            />
          )}

          {!loading && showOrganizerOnly && (
            <GalleryGrid
              galleries={rootFolderCards}
              onOpenGallery={(name) => navigate(`folder:${name}`)}
              isMobile={isMobile}
              canSlideshow={false}
            />
          )}

          {!loading && activeFolder && (
            <FolderHeader
              folder={activeFolder}
              count={(flatFolderView ? activeFolderFlatItems : activeFolderItemsAll).length}
              childCount={childGalleryCards.length}
              filters={activeFolderKinds}
              mediaFilter={folderMediaFilter}
              onMediaFilter={setFolderMediaFilter}
              flatFolderView={flatFolderView}
              onToggleFlat={() => setFlatFolderView((v) => !v)}
              onCreateGallery={() => handleCreateGallery(activeFolder.name)}
              onUpdate={(patch) => handleUpdateFolderSettings(activeFolder.name, patch)}
              isMobile={isMobile}
              canSlideshow={activeFolderCanSlideshow}
            />
          )}

          {!loading && activeFolder && !flatFolderView && childGalleryCards.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: T.text4, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Galleries inside {activeFolder.name}</div>
                <button onClick={() => handleCreateGallery(activeFolder.name)} style={dashSecondary}>New gallery</button>
              </div>
              <GalleryGrid galleries={childGalleryCards} onOpenGallery={(name) => navigate(`folder:${name}`)} isMobile={isMobile} />
            </div>
          )}

          {activeView !== "home" && !showOrganizerOnly && !sheetId && !loading && !quickAdds.length && (
            <EmptyState
              icon="inbox"
              title="Empty vault"
              sub="Paste a video, image, Drive link, or reference URL to start your library."
              action={() => setShowQuickAdd(true)}
              actionLabel="Add to Vault"
            />
          )}
          {!loading && activeView !== "home" && !showOrganizerOnly && (
            <BulkToolbar
              selectMode={selectMode}
              selectedCount={selectedKeys.size}
              onToggle={() => { setSelectMode((v) => !v); setSelectedKeys(new Set()); }}
              folders={folders}
              onMove={handleBulkMove}
              onDelete={handleBulkDelete}
              onSelectAll={() => setSelectedKeys(new Set(renderedItems.map((i) => i.key)))}
              onClear={() => setSelectedKeys(new Set())}
            />
          )}
          {loading && <Spinner />}
          {error && !loading && <ErrorBox msg={error} />}
          {activeView !== "home" && !showOrganizerOnly && !loading && renderedItems.length === 0 && !error && (sheetId || quickAdds.length) && (
            <EmptyState icon="inbox" title="Nothing here" sub={search ? `No results for "${search}"` : "No items in this view."} />
          )}

          {showFolderSlideshow && !loading && !flatFolderView && (
            <SlideshowGallery items={renderedItems} onOpen={openItem} cardProps={cardProps} />
          )}

          {activeView !== "home" && !showOrganizerOnly && !showFolderSlideshow && !loading && renderedItems.length > 0 && viewMode !== "list" && (
            <div style={gridStyle}>
              {renderedItems.map((item) => (
                <Card key={item.id || item.key} item={item} onOpen={openItem}
                  viewMode={isMobile && viewMode === "showcase" ? "grid" : viewMode}
                  selected={selectedKeys.has(item.key)}
                  {...cardProps} />
              ))}
            </div>
          )}

          {activeView !== "home" && !showOrganizerOnly && !showFolderSlideshow && !loading && renderedItems.length > 0 && viewMode === "list" && (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r10, overflow: "hidden" }}>
              {renderedItems.map((item) => (
                <Card key={item.id || item.key} item={item} onOpen={openItem} viewMode="list" selected={selectedKeys.has(item.key)} {...cardProps} />
              ))}
            </div>
          )}
        </div>
      </div>

      {isMobile && <BottomNav activeTab={activeBottomTab} onTab={handleBottomTab} />}

      {showConfig && <ConfigModal onSave={handleSaveConfig} onClose={() => !needsManualTabs && setShowConfig(false)} savedId={sheetId} needsManualTabs={needsManualTabs} coverRules={coverRules} onSaveCoverRules={handleSaveCoverRules} coverLibrary={coverLibrary} onSaveCover={handleSaveCover} onDeleteCover={handleDeleteCover} diagnostics={diagnostics} onExportJSON={handleExportJSON} onExportCSV={handleExportCSV} />}
      {showQuickAdd && <QuickAddModal onAdd={handleQuickAdd} onClose={() => setShowQuickAdd(false)} folders={folders} onCreateFolder={handleCreateFolder} />}
      {editingItem && <QuickAddModal mode="edit" initialItem={editingItem} onAdd={(item) => { handleQuickAdd(item); setEditingItem(null); }} onClose={() => setEditingItem(null)} folders={folders} onCreateFolder={handleCreateFolder} />}
      {showImport && <SheetImportModal onClose={() => setShowImport(false)} onImport={handleSheetImport} existingCount={quickAdds.length} />}
      {showXR && <VaultXR items={allItems} folders={folders} userData={userData} onOpen={openItem} onClose={() => setShowXR(false)} />}

      {activeItem && (
        <Player
          item={activeItem}
          items={renderedItems}
          currentIdx={activeItemIdx}
          onNavigate={(idx) => { setActiveItemIdx(idx); setActiveItem(renderedItems[idx]); }}
          onClose={() => setActiveItem(null)}
          userId={user?.id}
          resumeAt={userData[activeItem.key]?.progress || 0}
          rating={userData[activeItem.key]?.rating || 0}
          onRate={(rating) => handleSetRating(activeItem.key, rating)}
          onAddMoment={(mark) => handleAddMomentMark(activeItem.key, mark)}
          oilCount={Number(userData[activeItem.key]?.oil_count || 0)}
          onOil={() => handleOilItem(activeItem.key)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        button, a { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}


function OrganizerStrip({ isMobile, flatEverything, onToggleFlat, galleries, onOpenGallery, onCreateGallery }) {
  return (
    <div style={{ marginBottom: 16, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.6, color: T.text1 }}>{flatEverything ? "Everything" : "Galleries"}</div>
        <div style={{ fontSize: 12, color: T.text4, marginTop: 3 }}>{flatEverything ? "All saved media shown as one flat wall." : `${galleries.length} organized buckets. Open one to view the actual gallery.`}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onToggleFlat} style={flatEverything ? dashPrimary : dashSecondary}>{flatEverything ? "Organize" : "Show flat"}</button>
        <button onClick={onCreateGallery} style={dashSecondary}>New gallery</button>
      </div>
    </div>
  );
}


function imageCandidatesForItem(item) {
  if (!item) return [];
  const candidates = [];
  const add = (url, proxy = true) => {
    const raw = String(url || "").trim();
    if (!raw) return;
    const normalized = normalizeCoverUrl(raw);
    const finalUrl = proxy && /^https?:\/\//i.test(normalized) ? proxiedMediaUrl(normalized) : normalized;
    if (finalUrl && !candidates.includes(finalUrl)) candidates.push(finalUrl);
  };
  add(item.thumbnail);
  const cleanUrl = String(item.url || "").split("?")[0].toLowerCase();
  const type = String(item.type || item.source || "").toLowerCase();
  if (type.includes("image") || sourceIdOf(item.url || "") === "image" || /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(item.url || cleanUrl)) {
    add(item.url);
  }
  getThumbCandidates(item.url || "").forEach((url) => add(url, false));
  return candidates;
}

function GalleryImage({ candidates = [], alt = "", fit = "cover", position = "center", fallbackIcon = "showcase", fallbackSize = 42, style = {} }) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setIdx(0); setFailed(false); }, [candidates.join("|")]);
  const src = candidates[idx];
  if (!src || failed) {
    return <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: T.text4, ...style }}><Icon name={fallbackIcon} size={fallbackSize} /></div>;
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => {
        const next = idx + 1;
        if (next < candidates.length) setIdx(next);
        else setFailed(true);
      }}
      style={{ width: "100%", height: "100%", objectFit: fit, objectPosition: position, display: "block", background: "#050505", ...style }}
    />
  );
}

function GalleryGrid({ galleries, onOpenGallery, isMobile }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(auto-fill,minmax(240px,1fr))", gap: isMobile ? 10 : 16 }}>
      {galleries.map((g) => <GalleryCard key={g.folder.name} gallery={g} onOpen={() => onOpenGallery(g.folder.name)} />)}
    </div>
  );
}

function GalleryCard({ gallery, onOpen, compact = false }) {
  const { folder, items, count, coverItem } = gallery;
  const displayAsGallery = folder.kind === "gallery" && !!folder.parent_folder;
  const explicit = folder.cover ? [proxiedMediaUrl(normalizeCoverUrl(folder.cover))] : [];
  const itemCandidates = imageCandidatesForItem(coverItem);
  const candidates = [...explicit, ...itemCandidates].filter(Boolean);
  const videoCount = items.filter((i) => String(i.type || i.source || "").toLowerCase().includes("video") || ["youtube","vimeo","drive","reddit","tiktok","hls"].includes(sourceIdOf(i.url))).length;
  const photoCount = items.filter((i) => String(i.type || i.source || "").toLowerCase().includes("image") || /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(i.url || "")).length;
  return (
    <button onClick={onOpen} style={{ textAlign: "left", border: `1px solid ${T.border}`, borderRadius: 18, overflow: "hidden", background: "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))", color: T.text1, cursor: "pointer", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: 0 }}>
      <div style={{ aspectRatio: compact ? "16/10" : "4/5", position: "relative", background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
        <GalleryImage candidates={candidates} fit="cover" position="center" fallbackIcon={displayAsGallery ? "showcase" : "folder"} fallbackSize={42} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.68))" }} />
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 999, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", color: T.text2, fontSize: 10, marginBottom: 8 }}>
            <Icon name={displayAsGallery ? "showcase" : "folder"} size={11} /> {displayAsGallery ? "Gallery" : "Folder"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{folder.name}</div>
          <div style={{ marginTop: 5, fontSize: 11, color: T.text3 }}>{count} items{videoCount ? ` · ${videoCount} video` : ""}{photoCount ? ` · ${photoCount} photo` : ""}</div>
        </div>
      </div>
    </button>
  );
}


function SlideshowGallery({ items, onOpen, cardProps }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { if (idx >= items.length) setIdx(0); }, [items.length, idx]);
  const item = items[idx] || items[0];
  if (!item) return null;
  const candidates = imageCandidatesForItem(item);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <button onClick={() => onOpen(item)} style={{ minHeight: 340, border: `1px solid ${T.border}`, borderRadius: 22, overflow: "hidden", background: "rgba(255,255,255,0.035)", color: T.text1, cursor: "pointer", position: "relative", padding: 0, textAlign: "left" }}>
        <div style={{ width: "100%", height: "min(62dvh,620px)", background: "#050505" }}><GalleryImage candidates={candidates} fit="contain" fallbackIcon="showcase" fallbackSize={54} /></div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.74))" }}>
          <div style={{ fontSize: 12, color: T.text4, marginBottom: 4 }}>{idx + 1} / {items.length}</div>
          <div style={{ fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title || item.url}</div>
        </div>
      </button>
      <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(95px,130px)", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {items.map((thumb, i) => (
          <div key={thumb.key} style={{ border: `1px solid ${i === idx ? T.borderHov : T.border}`, borderRadius: 14, overflow: "hidden" }}>
            <Card item={thumb} onOpen={() => setIdx(i)} viewMode="compact" {...cardProps} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FolderHeader({ folder, count, childCount = 0, filters, mediaFilter, onMediaFilter, flatFolderView, onToggleFlat, onCreateGallery, onUpdate, isMobile, canSlideshow = false }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name || "");
  const [cover, setCover] = useState(folder.cover || "");
  const [note, setNote] = useState(folder.note || "");
  useEffect(() => { setName(folder.name || ""); setCover(folder.cover || ""); setNote(folder.note || ""); }, [folder.name, folder.cover, folder.note]);
  const isGallery = folder.kind === "gallery" && !!folder.parent_folder;
  return (
    <div style={{ marginBottom: 16, border: `1px solid ${T.border}`, borderRadius: 18, padding: isMobile ? 12 : 14, background: "rgba(255,255,255,0.032)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ padding: "3px 8px", border: `1px solid ${T.border}`, borderRadius: 999, color: isGallery ? T.amber : T.text3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{isGallery ? "Gallery" : "Folder"}</span>
            <span style={{ fontSize: 11, color: T.text4 }}>{count} media{childCount ? ` · ${childCount} galleries` : ""}</span>
          </div>
          <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 850, color: T.text1, letterSpacing: -1.0, lineHeight: 1.05 }}>{folder.name}</div>
          {folder.note && <div style={{ marginTop: 6, color: T.text4, fontSize: 12, maxWidth: 760 }}>{folder.note}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onCreateGallery} style={dashSecondary}>New gallery</button>
          <button onClick={onToggleFlat} style={flatFolderView ? dashPrimary : dashSecondary}>{flatFolderView ? "Organized" : "Expand all"}</button>
          {canSlideshow && <button onClick={() => onUpdate({ display_mode: folder.display_mode === "slideshow" ? "grid" : "slideshow" })} style={dashSecondary}>{folder.display_mode === "slideshow" ? "Grid" : "Slideshow"}</button>}
          <button onClick={() => setEditing((v) => !v)} style={dashSecondary}>Edit</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 12, paddingBottom: 2 }}>
        {filters.map((f) => <Pill key={f} active={mediaFilter === f} onClick={() => onMediaFilter(f)}>{f === "all" ? "All media" : f}</Pill>)}
      </div>
      {editing && (
        <div style={{ marginTop: 14, display: "grid", gap: 9, maxWidth: 720 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder or gallery name" style={settingsInput} />
          <input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="Cover URL or Drive image link" style={settingsInput} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Folder note" rows={3} style={{ ...settingsInput, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { onUpdate({ name: name.trim() || folder.name, cover: cover.trim() || null, note: note.trim() || null }); setEditing(false); }} style={dashPrimary}>Save</button>
            <button onClick={() => setEditing(false)} style={dashSecondary}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}


function BulkToolbar({ selectMode, selectedCount, onToggle, folders, onMove, onDelete, onSelectAll, onClear }) {
  const [moveOpen, setMoveOpen] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", flexWrap: "wrap" }}>
      <button onClick={onToggle} style={selectMode ? dashPrimary : dashSecondary}>{selectMode ? "Done selecting" : "Select"}</button>
      {selectMode && <span style={{ color: T.text4, fontSize: 12 }}>{selectedCount} selected</span>}
      {selectMode && <button onClick={onSelectAll} style={dashSecondary}>Select all</button>}
      {selectMode && selectedCount > 0 && (
        <>
          <button onClick={() => setMoveOpen((v) => !v)} style={dashSecondary}>Move to folder</button>
          <button onClick={onDelete} style={{ ...dashSecondary, color: "#ff9b9b" }}>Delete</button>
          <button onClick={onClear} style={dashSecondary}>Clear</button>
        </>
      )}
      {selectMode && moveOpen && selectedCount > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", width: "100%", paddingTop: 4 }}>
          <button onClick={() => { onMove(null); setMoveOpen(false); }} style={dashSecondary}>No folder</button>
          {folders.map((f) => <button key={f.name} onClick={() => { onMove(f.name); setMoveOpen(false); }} style={dashSecondary}>{f.name}</button>)}
        </div>
      )}
    </div>
  );
}

const settingsInput = { width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text1, fontSize: 13, outline: "none" };


function Dashboard({ isMobile, allItems, folders, folderCards, recentGalleries, totalViews, continueItems, recentlyViewed, recentlyAdded, topRatedItems, mostOiledItems = [], userData, onOpen, onNavigate, onQuickAdd, onImport, onCreateGallery, cardProps }) {
  const cardMode = isMobile ? "grid" : "grid";
  const primary = continueItems[0] || recentlyViewed[0] || recentlyAdded[0] || null;
  const hasItems = allItems.length > 0;
  const activeGalleryRows = recentGalleries.length ? recentGalleries : folderCards.slice(0, 6);
  const visibleRows = [
    { key: "continue", title: "Continue Watching", empty: "No active videos yet.", items: continueItems.slice(0, 6), seeAll: () => onNavigate("continue") },
    { key: "watched", title: "Last Watched", empty: "Open media and it will show here.", items: recentlyViewed.slice(0, 6) },
    { key: "liked", title: "Most Liked", empty: "Use the web-fluid action and the best media will rise here.", items: mostOiledItems.slice(0, 6) },
    { key: "rated", title: "Rated Media", empty: "Rated media appears here.", items: topRatedItems.slice(0, 6), seeAll: () => onNavigate("rated") },
    { key: "added", title: "Recently Added", empty: "Your newest saves appear here.", items: recentlyAdded.slice(0, 6) },
  ].filter((row) => row.items.length > 0 || (!hasItems && row.key === "added"));

  return (
    <div style={{ display: "grid", gap: isMobile ? 15 : 18 }}>
      <div style={{
        border: `1px solid ${T.border}`, borderRadius: isMobile ? 20 : 24, padding: isMobile ? 15 : 20,
        background: "linear-gradient(145deg, rgba(255,255,255,0.085), rgba(255,255,255,0.026) 55%, rgba(255,255,255,0.012))",
        boxShadow: "0 28px 90px rgba(0,0,0,0.28)", overflow: "hidden", position: "relative",
      }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(circle at 85% 15%, rgba(255,255,255,0.10), transparent 32%)" }} />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.1fr) minmax(260px,0.75fr)", gap: 16, alignItems: "stretch" }}>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 9px", borderRadius: 999, border: `1px solid ${T.borderSub}`, background: "rgba(0,0,0,0.24)", color: T.text4, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} /> Private Library
              </div>
              <div style={{ fontSize: isMobile ? 25 : 34, lineHeight: 1.02, fontWeight: 850, letterSpacing: -1.25, color: T.text1 }}>Welcome back</div>
              <div style={{ marginTop: 8, fontSize: 12, color: T.text4, lineHeight: 1.45 }}>
                {allItems.length} saved · {folders.length} folders · {totalViews} views · {topRatedItems.length} rated
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={onQuickAdd} style={dashPrimary}>Add media</button>
              <button onClick={onImport} style={dashSecondary}>Import Sheet</button>
              {folderCards.length > 0 && <button onClick={() => onNavigate("all")} style={dashSecondary}>Browse library</button>}
            </div>
          </div>

          {primary ? (
            <button onClick={() => onOpen(primary)} style={{ border: `1px solid ${T.borderSub}`, borderRadius: 18, padding: 10, background: "rgba(0,0,0,0.30)", color: T.text1, textAlign: "left", cursor: "pointer", display: "grid", gridTemplateColumns: "76px minmax(0,1fr)", gap: 12, alignItems: "center", minHeight: 112 }}>
              <div style={{ aspectRatio: "4 / 5", borderRadius: 13, overflow: "hidden", background: "rgba(255,255,255,0.05)", border: `1px solid ${T.borderSub}` }}>
                <GalleryImage candidates={imageCandidatesForItem(primary)} alt={primary.title || ""} fit={primary.cover_fit || "cover"} position={`${primary.cover_position_x || 50}% ${primary.cover_position_y || 50}%`} fallbackIcon="play" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: T.text4, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Pick up</div>
                <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>{primary.title || primary.url}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.text4, fontSize: 11 }}>
                  <span>{primary.source || sourceIdOf(primary.url || "") || "media"}</span>
                  {userData[primary.key]?.rating ? <span>★ {userData[primary.key]?.rating}</span> : null}
                </div>
              </div>
            </button>
          ) : (
            <div style={{ border: `1px dashed ${T.border}`, borderRadius: 18, padding: 16, background: "rgba(0,0,0,0.22)", color: T.text4, fontSize: 12, lineHeight: 1.5 }}>
              Save a link, Drive file, video, image, or PDF. The dashboard will organize the useful stuff once your vault has data.
            </div>
          )}
        </div>
      </div>

      {!hasItems && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 10 }}>
          <QuickStartCard title="Add your first item" sub="Paste any link or media URL." action="Add" onClick={onQuickAdd} />
          <QuickStartCard title="Import from Sheet" sub="Bring in a batch from your collection sheet." action="Import" onClick={onImport} />
          <QuickStartCard title="Create a gallery" sub="Group a photo set or reference batch." action="New gallery" onClick={onCreateGallery} />
        </div>
      )}

      {activeGalleryRows.length > 0 && (
        <GalleryDashboardRow title={recentGalleries.length ? "Recent Galleries" : "Collections"} empty="Create a gallery and it will appear here." galleries={activeGalleryRows} onOpenGallery={(name) => onNavigate(`folder:${name}`)} onCreateGallery={onCreateGallery} />
      )}

      {visibleRows.map((row) => (
        <DashboardRow key={row.key} title={row.title} empty={row.empty} items={row.items} onOpen={onOpen} cardProps={cardProps} cardMode={cardMode} onSeeAll={row.seeAll} />
      ))}
    </div>
  );
}

function QuickStartCard({ title, sub, action, onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", padding: 14, borderRadius: 16, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.035)", color: T.text1, cursor: "pointer" }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 11, color: T.text4, lineHeight: 1.45, marginBottom: 12 }}>{sub}</div>
      <span style={{ fontSize: 11, color: T.text2, fontWeight: 800 }}>{action} →</span>
    </button>
  );
}

function GalleryDashboardRow({ title, empty, galleries, onOpenGallery, onCreateGallery }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, color: T.text1, letterSpacing: -0.2 }}>{title}</h2>
        <button onClick={onCreateGallery} style={{ background: "transparent", border: "none", color: T.text4, fontSize: 12, cursor: "pointer" }}>New gallery</button>
      </div>
      {galleries.length ? (
        <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(170px, 240px)", gap: 12, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
          {galleries.map((g) => <GalleryCard key={g.folder.name} gallery={g} onOpen={() => onOpenGallery(g.folder.name)} compact />)}
        </div>
      ) : (
        <div style={{ border: `1px dashed ${T.border}`, borderRadius: 14, padding: "18px 14px", color: T.text4, fontSize: 12, background: "rgba(255,255,255,0.025)" }}>{empty}</div>
      )}
    </section>
  );
}

function DashboardRow({ title, empty, items, onOpen, cardProps, cardMode, onSeeAll }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, color: T.text1, letterSpacing: -0.2 }}>{title}</h2>
        {onSeeAll && <button onClick={onSeeAll} style={{ background: "transparent", border: "none", color: T.text4, fontSize: 12, cursor: "pointer" }}>See all</button>}
      </div>
      {items.length ? (
        <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(150px, 210px)", gap: 12, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
          {items.map((item) => <Card key={item.id || item.key} item={item} onOpen={onOpen} viewMode={cardMode} {...cardProps} />)}
        </div>
      ) : (
        <div style={{ border: `1px dashed ${T.border}`, borderRadius: 14, padding: "18px 14px", color: T.text4, fontSize: 12, background: "rgba(255,255,255,0.025)" }}>{empty}</div>
      )}
    </section>
  );
}

const dashPrimary = { padding: "10px 15px", borderRadius: 12, background: "#fff", color: "#000", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer" };
const dashSecondary = { padding: "10px 15px", borderRadius: 12, background: "rgba(255,255,255,0.08)", color: T.text1, border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, cursor: "pointer" };

// ── Layout pieces ────────────────────────────────────────────────────────────

function MobileTopBar({ title, onMenu, onSearch, syncing, searchOpen, searchRef, search, onSearchChange, onSort, sortBy, onImport, onQuickAdd, xrSupported, onEnterXR }) {
  return (
    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.borderSub}`, position: "sticky", top: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", zIndex: 100 }}>
      <button onClick={onMenu} style={iconBtn}><Icon name="menu" size={18} /></button>
      {searchOpen
        ? <input ref={searchRef} value={search} onChange={(e) => onSearchChange?.(e.target.value)} placeholder="Search..." autoFocus style={{ flex: 1, padding: "7px 11px", background: "rgba(255,255,255,0.07)", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text1, fontSize: 14, outline: "none" }} />
        : <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: T.text1, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      }
      {onSort && <button onClick={onSort} style={{ ...iconBtn, background: sortBy !== "default" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)" }}><Icon name="sort" size={16} /></button>}
      {onImport && <button onClick={onImport} style={iconBtn} title="Import Sheet"><Icon name="import" size={16} /></button>}
      {xrSupported && <button onClick={onEnterXR} style={{ ...iconBtn, borderRadius: 12, fontSize: 11, fontWeight: 900 }} title="VR Library">VR</button>}
      {onQuickAdd && <button onClick={onQuickAdd} style={iconBtn} title="Add video"><Icon name="addCircle" size={16} /></button>}
      <button onClick={onSearch} style={iconBtn}><Icon name="search" size={16} /></button>
    </div>
  );
}

function DesktopTopBar({ viewTitle, viewItems, search, onSearch, viewMode, onViewMode, onImport, syncing, sortBy, onSortChange, onQuickAdd, installPrompt, onInstall, showFilterPills, onToggleFilters, xrSupported, onEnterXR }) {
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
        <button onClick={onToggleFilters} style={{ ...iconBtn, borderRadius: 7, background: showFilterPills ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)" }} title="Show filters"><Icon name="filter" size={16} /></button>
        <button onClick={onImport} style={{ ...iconBtn, borderRadius: 7 }} title="Import Sheet"><Icon name="import" size={16} /></button>
        {xrSupported && <button onClick={onEnterXR} style={{ ...iconBtn, borderRadius: 7, width: 42, fontSize: 11, fontWeight: 900 }} title="Enter VR Library">VR</button>}
        <button onClick={onQuickAdd} style={{ ...iconBtn, borderRadius: 7 }} title="Add video"><Icon name="addCircle" size={16} /></button>
        {installPrompt && <button onClick={onInstall} style={{ ...iconBtn, borderRadius: 7 }} title="Install app"><Icon name="download" size={15} /></button>}

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
  <div style={{ display: "grid", placeItems: "center", padding: "72px 16px" }}>
    <div style={{ width: "min(420px, 100%)", textAlign: "center", padding: "28px 22px", border: `1px dashed ${T.border}`, borderRadius: 22, background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))" }}>
      <div style={{ width: 54, height: 54, borderRadius: 18, display: "grid", placeItems: "center", margin: "0 auto 14px", color: T.text3, background: "rgba(255,255,255,0.05)", border: `1px solid ${T.borderSub}` }}>
        <Icon name={icon || "inbox"} size={28} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text2, marginBottom: 7, letterSpacing: -0.2 }}>{title}</div>
      <div style={{ fontSize: 12, color: T.text4, lineHeight: 1.5, margin: "0 auto 20px", maxWidth: 310 }}>{sub}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {action && <button onClick={action} style={{ padding: "10px 18px", background: "#fff", color: "#000", border: "none", borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{actionLabel}</button>}
        {secondaryAction && <button onClick={secondaryAction} style={{ padding: "10px 18px", background: "rgba(255,255,255,0.08)", border: `1px solid ${T.border}`, borderRadius: 999, color: T.text2, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{secondaryActionLabel}</button>}
      </div>
    </div>
  </div>
);

const iconBtn = { background: "rgba(255,255,255,0.06)", border: "none", color: T.text2, cursor: "pointer", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
