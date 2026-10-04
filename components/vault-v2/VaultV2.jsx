"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import Icon from "@/components/Icons";
import Player from "@/components/Player";
import SyncStatus from "@/components/SyncStatus";
import MediaCard from "./MediaCard";
import AddMediaSheet from "./AddMediaSheet";
import DetailDrawer from "./DetailDrawer";
import InAppBrowser from "@/components/InAppBrowser";

import {
  supabase, getVaultItems, getUserData, getFolders, getCoverLibrary,
  upsertVaultItem, removeVaultItem, deleteVaultMedia,
  toggleFavorite, setItemFolder, setItemRating,
  createFolder, recordItemView, addMomentMark,
} from "@/lib/supabase";
import { mergeRemoteItemsWithOutbox } from "@/lib/sync-outbox";
import { ensureProxySession, SECURITY_V2_ENABLED } from "@/lib/security-session";
import { getSourceMeta, SOURCE_OPTIONS } from "@/lib/sources";
import { resolveMediaPreviews } from "@/lib/media-preview";

const NAV = [
  ["home", "/", "home", "Home"],
  ["library", "/library", "grid", "Library"],
  ["inbox", "/inbox", "inbox", "Inbox"],
  ["collections", "/collections", "folder", "Collections"],
  ["search", "/search", "search", "Search"],
  ["settings", "/settings", "settings", "Settings"],
];

const MOBILE_NAV = [
  ["home", "/", "home", "Home"],
  ["library", "/library", "grid", "Library"],
  ["add", "#add", "plus", "Add"],
  ["collections", "/collections", "folder", "Collections"],
  ["search", "/search", "search", "Search"],
];

const ROUTE_TITLES = {
  home: "Home", library: "Library", inbox: "Inbox",
  collections: "Collections", search: "Search", settings: "Settings",
};

function folderFor(item, state) {
  return item?.folder || state?.folder || "";
}

function mediaType(item) {
  const source = getSourceMeta(item?.url || "").id;
  const raw = String(item?.type || "").toLowerCase();
  if (raw === "image" || source === "image") return "image";
  if (raw === "pdf" || source === "pdf") return "pdf";
  if (raw === "video" || ["youtube","vimeo","drive","tiktok","facebook","instagram","twitch","twitch-vod","twitch-clip","dailymotion","streamable","wistia","dropbox","hls","file"].includes(source)) return "video";
  if (raw === "audio" || source === "audio") return "audio";
  return "link";
}

function matchesQuery(item, state, query) {
  if (!query.trim()) return true;
  const source = getSourceMeta(item.url || "").name;
  const text = [
    item.title, item.url, item.note, folderFor(item, state), source,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

function EmptyState({ icon="inbox", title, text, action, actionLabel }) {
  return (
    <div className="v2-empty">
      <div>
        <Icon name={icon} size={30}/>
        <h2>{title}</h2>
        <p>{text}</p>
        {action ? <button type="button" className="v2-btn v2-btn-primary" onClick={action}>{actionLabel}</button> : null}
      </div>
    </div>
  );
}

function LoadingGrid() {
  return <div className="v2-grid" aria-label="Loading library">{Array.from({length:10}).map((_,i)=><div className="v2-skeleton" key={i}/>)}</div>;
}

function MediaRow({ title, subtitle, items, userData, onOpen, onSeeAll }) {
  if (!items.length) return null;
  return (
    <section className="v2-section">
      <div className="v2-section-head">
        <div><h2 className="v2-section-title">{title}</h2>{subtitle ? <div className="v2-section-sub">{subtitle}</div> : null}</div>
        {onSeeAll ? <button className="v2-linkbtn" type="button" onClick={onSeeAll}>See all</button> : null}
      </div>
      <div className="v2-row">
        {items.map((item)=><MediaCard key={item.key} item={item} state={userData[item.key] || {}} onOpen={onOpen}/>)}
      </div>
    </section>
  );
}

function FilterFields({ filters, setFilters, folders }) {
  return (
    <>
      <select className="v2-filter" aria-label="Filter by type" value={filters.type} onChange={(e)=>setFilters((x)=>({...x,type:e.target.value}))}>
        <option value="all">All types</option><option value="video">Video</option><option value="image">Images</option><option value="audio">Audio</option><option value="pdf">PDFs</option><option value="link">Links</option>
      </select>
      <select className="v2-filter" aria-label="Filter by collection" value={filters.collection} onChange={(e)=>setFilters((x)=>({...x,collection:e.target.value}))}>
        <option value="all">All collections</option><option value="inbox">Inbox</option>
        {folders.map((f)=><option key={f.name} value={f.name}>{f.name}</option>)}
      </select>
      <select className="v2-filter" aria-label="Filter by source" value={filters.source} onChange={(e)=>setFilters((x)=>({...x,source:e.target.value}))}>
        <option value="all">All sources</option>
        {SOURCE_OPTIONS.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className="v2-filter" aria-label="Filter by favorite" value={filters.favorite} onChange={(e)=>setFilters((x)=>({...x,favorite:e.target.value}))}>
        <option value="all">Any favorite</option><option value="yes">Favorites</option><option value="no">Not favorited</option>
      </select>
      <select className="v2-filter" aria-label="Filter by rating" value={filters.rating} onChange={(e)=>setFilters((x)=>({...x,rating:e.target.value}))}>
        <option value="all">Any rating</option><option value="5">5 stars</option><option value="4">4+ stars</option><option value="3">3+ stars</option>
      </select>
      <select className="v2-filter" aria-label="Filter by watch status" value={filters.status} onChange={(e)=>setFilters((x)=>({...x,status:e.target.value}))}>
        <option value="all">Any status</option><option value="continue">In progress</option><option value="unwatched">Not started</option><option value="complete">Completed</option>
      </select>
    </>
  );
}

function MobileControlSheet({ kind, filters, setFilters, sort, setSort, folders, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!kind || !ref.current) return;
    const root = ref.current;
    const before = document.activeElement;
    root.querySelector("select,button")?.focus();
    const handler = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const nodes = [...root.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled]),[href]')];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); before?.focus?.(); };
  }, [kind, onClose]);
  if (!kind) return null;
  return (
    <>
      <div className="v2-backdrop" onMouseDown={onClose} aria-hidden="true"/>
      <section ref={ref} className="v2-sheet" role="dialog" aria-modal="true" aria-label={kind==="sort"?"Sort library":"Filter library"}>
        <div className="v2-sheet-head">
          <div className="v2-modal-title">{kind==="sort"?"Sort":"Filters"}</div>
          <button type="button" className="v2-iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={18}/></button>
        </div>
        <div className="v2-sheet-body" style={{display:"grid",gap:12}}>
          {kind==="sort" ? (
            <select className="v2-select" value={sort} onChange={(e)=>setSort(e.target.value)} aria-label="Sort results">
              <option value="added">Recently added</option><option value="viewed">Recently viewed</option><option value="alpha">A–Z</option><option value="rating">Rating</option>
            </select>
          ) : <FilterFields filters={filters} setFilters={setFilters} folders={folders}/>}
        </div>
        <div className="v2-sheet-foot"><button type="button" className="v2-btn v2-btn-primary" onClick={onClose}>Done</button></div>
      </section>
    </>
  );
}

export default function VaultV2({ route = "home" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchRef = useRef(null);
  const newCollectionRef = useRef(null);

  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [userData, setUserData] = useState({});
  const [folders, setFolders] = useState([]);
  const [coverLibrary, setCoverLibrary] = useState([]);
  const [activityRevision, setActivityRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [online, setOnline] = useState(true);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get("q") || "");
  const [filters, setFilters] = useState({ type:"all", collection:"all", source:"all", favorite:"all", rating:"all", status:"all" });
  const [sort, setSort] = useState("added");
  const [detailItem, setDetailItem] = useState(null);
  const [playerItem, setPlayerItem] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [mobileControl, setMobileControl] = useState(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [mobileBrowser, setMobileBrowser] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(60);

  const selectedCollection = searchParams.get("folder") || "";

  const refresh = useCallback(async (userId) => {
    const id = userId || user?.id;
    if (!id) return;
    const [remoteItems, data, remoteFolders, remoteCovers] = await Promise.all([
      getVaultItems(id), getUserData(id), getFolders(id), getCoverLibrary(id),
    ]);
    setItems(mergeRemoteItemsWithOutbox(remoteItems));
    setUserData(data || {});
    setFolders(remoteFolders || []);
    setCoverLibrary(remoteCovers || []);
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      setLoading(true); setLoadError("");
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const session = data.session;
        const u = session?.user || null;
        if (!active) return;
        setUser(u);
        if (u && SECURITY_V2_ENABLED && session) {
          try { await ensureProxySession(session); } catch {}
        }
        if (u) await refresh(u.id);
      } catch (e) {
        if (active) setLoadError(e?.message || "Could not load your Vault.");
      } finally {
        if (active) setLoading(false);
      }
    };
    boot();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setVisibleLimit(60);
  }, [route, debouncedQuery, filters, sort, selectedCollection]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    const syncMobile = () => setMobileBrowser(window.matchMedia("(max-width: 899px)").matches);
    sync(); syncMobile();
    window.addEventListener("online",sync); window.addEventListener("offline",sync);
    window.addEventListener("resize", syncMobile);
    return () => {
      window.removeEventListener("online",sync);
      window.removeEventListener("offline",sync);
      window.removeEventListener("resize", syncMobile);
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown",handler);
    return () => window.removeEventListener("keydown",handler);
  }, []);

  useEffect(() => {
    if (!newCollectionOpen || !newCollectionRef.current) return;
    const root = newCollectionRef.current;
    const before = document.activeElement;
    root.querySelector("input,button")?.focus();
    const handler = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setNewCollectionOpen(false); return; }
      if (event.key !== "Tab") return;
      const nodes = [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href]')];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); before?.focus?.(); };
  }, [newCollectionOpen]);

  const saveItem = async (item) => {
    setItems((prev)=>[item,...prev.filter((x)=>x.key!==item.key && x.key!==item.previousKey)]);
    if (!user) return;
    await upsertVaultItem(user.id,item);
    if (item.previousKey && item.previousKey !== item.key) await removeVaultItem(user.id,item.previousKey);
    fetch("/api/sheets-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"upsert",...item})}).catch(()=>{});
    setDetailItem((current)=>current?.key===item.previousKey || current?.key===item.key ? item : current);
  };

  const deleteItem = async (item) => {
    if (user && item?.isUploadedMedia && item?.canonical_url) {
      await deleteVaultMedia(user.id,item.canonical_url);
    }
    if (user) await removeVaultItem(user.id,item.key);
    setItems((prev)=>prev.filter((x)=>x.key!==item.key));
    setDetailItem(null);
    fetch("/api/sheets-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",key:item.key})}).catch(()=>{});
  };

  const createCollection = async (name) => {
    const clean=String(name||"").trim();
    if(!clean) return null;
    const existing=folders.find((f)=>f.name.toLowerCase()===clean.toLowerCase());
    if(existing) return existing.name;
    setFolders((prev)=>[...prev,{name:clean,kind:"folder",display_mode:"grid",parent_folder:null}].sort((a,b)=>a.name.localeCompare(b.name)));
    if(user) await createFolder(user.id,clean,{kind:"folder",display_mode:"grid"});
    return clean;
  };

  const toggleFav = async (key,current) => {
    setUserData((prev)=>({...prev,[key]:{...(prev[key]||{}),item_key:key,favorite:!current}}));
    if(user) await toggleFavorite(user.id,key,current);
  };

  const assignFolder = async (item,folder) => {
    const value=folder || null;
    setItems((prev)=>prev.map((x)=>x.key===item.key?{...x,folder:value}:x));
    setUserData((prev)=>({...prev,[item.key]:{...(prev[item.key]||{}),item_key:item.key,folder:value}}));
    setDetailItem((cur)=>cur?.key===item.key?{...cur,folder:value}:cur);
    if(user){
      await upsertVaultItem(user.id,{...item,folder:value});
      await setItemFolder(user.id,item.key,value);
    }
  };

  const rateItem = async (key,rating) => {
    setUserData((prev)=>({...prev,[key]:{...(prev[key]||{}),item_key:key,rating:rating||null,rated_at:rating?new Date().toISOString():null}}));
    if(user) await setItemRating(user.id,key,rating||null);
  };

  const play = async (item) => {
    setPlayerItem(item);
    if(user){
      setUserData((prev)=>({...prev,[item.key]:{...(prev[item.key]||{}),item_key:item.key,view_count:Number(prev[item.key]?.view_count||0)+1,last_viewed_at:new Date().toISOString()}}));
      recordItemView(user.id,item.key).catch(()=>{});
    }
  };

  const displayItems = useMemo(
    () => resolveMediaPreviews(items, coverLibrary),
    [items, coverLibrary]
  );

  const allFiltered = useMemo(() => {
    let result = displayItems.filter((item)=>{
      const state=userData[item.key]||{};
      if(!matchesQuery(item,state,debouncedQuery)) return false;
      if(filters.type!=="all" && mediaType(item)!==filters.type) return false;
      const folder=folderFor(item,state);
      if(filters.collection==="inbox" && folder) return false;
      if(filters.collection!=="all" && filters.collection!=="inbox" && folder!==filters.collection) return false;
      const source=getSourceMeta(item.url||"").id;
      if(filters.source!=="all" && source!==filters.source) return false;
      if(filters.favorite==="yes" && !state.favorite) return false;
      if(filters.favorite==="no" && state.favorite) return false;
      if(filters.rating!=="all" && Number(state.rating||0)<Number(filters.rating)) return false;
      const p=Number(state.progress||0),d=Number(state.duration||0),ratio=d>0?p/d:0;
      if(filters.status==="continue" && !(p>5&&d>0&&ratio<.95)) return false;
      if(filters.status==="unwatched" && p>5) return false;
      if(filters.status==="complete" && !(d>0&&ratio>=.95)) return false;
      return true;
    });
    result=[...result].sort((a,b)=>{
      const ad=userData[a.key]||{},bd=userData[b.key]||{};
      if(sort==="alpha") return String(a.title||"").localeCompare(String(b.title||""));
      if(sort==="rating") return Number(bd.rating||0)-Number(ad.rating||0);
      if(sort==="viewed") return new Date(bd.last_viewed_at||bd.updated_at||0)-new Date(ad.last_viewed_at||ad.updated_at||0);
      return new Date(b.addedAt||0)-new Date(a.addedAt||0);
    });
    return result;
  },[displayItems,userData,debouncedQuery,filters,sort]);

  const inboxItems = useMemo(()=>displayItems.filter((i)=>!folderFor(i,userData[i.key]||{})),[displayItems,userData]);
  const continueItems = useMemo(()=>displayItems.filter((i)=>{const d=userData[i.key]||{};return d.progress>5&&d.duration>0&&d.progress/d.duration<.95}).sort((a,b)=>new Date(userData[b.key]?.updated_at||0)-new Date(userData[a.key]?.updated_at||0)).slice(0,8),[displayItems,userData]);
  const recentItems = useMemo(()=>[...displayItems].sort((a,b)=>new Date(b.addedAt||0)-new Date(a.addedAt||0)).slice(0,8),[displayItems]);
  const topRated = useMemo(()=>displayItems.filter((i)=>userData[i.key]?.rating).sort((a,b)=>Number(userData[b.key]?.rating||0)-Number(userData[a.key]?.rating||0)).slice(0,8),[displayItems,userData]);
  const recentFolders = useMemo(()=>[...folders].sort((a,b)=>new Date(b.last_viewed_at||b.updated_at||0)-new Date(a.last_viewed_at||a.updated_at||0)).slice(0,6),[folders]);

  const collectionItems = useMemo(()=>selectedCollection ? displayItems.filter((i)=>folderFor(i,userData[i.key]||{})===selectedCollection) : [],[displayItems,userData,selectedCollection]);

  const detailContextItems = useMemo(() => {
    if (route === "inbox") return inboxItems;
    if (route === "collections" && selectedCollection) return collectionItems;
    if (route === "library" || route === "search") return allFiltered;
    return displayItems;
  }, [route, selectedCollection, inboxItems, collectionItems, allFiltered, displayItems]);

  const detailIndex = detailItem ? detailContextItems.findIndex((item) => item.key === detailItem.key) : -1;

  const globalSearchSubmit=(e)=>{
    e.preventDefault();
    router.push(query.trim()?"/search?q="+encodeURIComponent(query.trim()):"/search");
  };

  const resetFilters=()=>setFilters({type:"all",collection:"all",source:"all",favorite:"all",rating:"all",status:"all"});

  const renderGrid=(list,emptyTitle="Nothing here yet",emptyText="Items matching this view will appear here.")=>{
    if(loading) return <LoadingGrid/>;
    if(!list.length) return <EmptyState title={emptyTitle} text={emptyText} action={()=>setAddOpen(true)} actionLabel="Add media"/>;
    const visible = list.slice(0, visibleLimit);
    return <>
      <div className="v2-grid">{visible.map((item)=><MediaCard key={item.key} item={item} state={userData[item.key]||{}} onOpen={setDetailItem}/>)}</div>
      {visibleLimit < list.length ? <div style={{display:"flex",justifyContent:"center",marginTop:28}}><button type="button" className="v2-btn" onClick={()=>setVisibleLimit((n)=>n+60)}>Load 60 more</button></div> : null}
    </>;
  };

  const filtersBar=(
    <>
      <div className="v2-toolbar v2-toolbar-desktop">
        <FilterFields filters={filters} setFilters={setFilters} folders={folders}/>
        <select className="v2-filter" aria-label="Sort library" value={sort} onChange={(e)=>setSort(e.target.value)}>
          <option value="added">Recently added</option><option value="viewed">Recently viewed</option><option value="alpha">A–Z</option><option value="rating">Rating</option>
        </select>
        <button type="button" className="v2-linkbtn" onClick={resetFilters}>Reset</button>
        <div className="v2-result-count">{allFiltered.length} item{allFiltered.length===1?"":"s"}</div>
      </div>
      <div className="v2-mobile-controls">
        <button type="button" className="v2-btn" onClick={()=>setMobileControl("filters")}><Icon name="sort" size={15}/> Filters</button>
        <button type="button" className="v2-btn" onClick={()=>setMobileControl("sort")}><Icon name="list" size={15}/> Sort</button>
      </div>
    </>
  );

  let page;
  if(route==="home") {
    page = (
      <>
        <div className="v2-hero"><div className="v2-eyebrow">Your private media library</div><h1 className="v2-h1">Pick up where you left off.</h1><p className="v2-lead">Resume, save, find, and organize the references worth keeping.</p></div>
        <MediaRow title="Continue" subtitle="Unfinished media, ready to resume" items={continueItems} userData={userData} onOpen={setDetailItem} onSeeAll={()=>router.push("/library")}/>
        <MediaRow title="Recently Saved" items={recentItems} userData={userData} onOpen={setDetailItem} onSeeAll={()=>router.push("/library")}/>
        {inboxItems.length ? <MediaRow title={"Inbox · "+inboxItems.length} subtitle="Saved but not organized yet" items={inboxItems.slice(0,8)} userData={userData} onOpen={setDetailItem} onSeeAll={()=>router.push("/inbox")}/> : null}
        {recentFolders.length ? <section className="v2-section"><div className="v2-section-head"><div><h2 className="v2-section-title">Recent Collections</h2><div className="v2-section-sub">Your organized spaces</div></div><button className="v2-linkbtn" onClick={()=>router.push("/collections")}>See all</button></div><div className="v2-collection-grid">{recentFolders.map((f)=>{const count=displayItems.filter((i)=>folderFor(i,userData[i.key]||{})===f.name).length;return <button className="v2-collection" key={f.name} onClick={()=>router.push("/collections?folder="+encodeURIComponent(f.name))}><div className="v2-collection-icon"><Icon name="folder" size={20}/></div><div><div className="v2-collection-name">{f.name}</div><div className="v2-collection-count">{count} item{count===1?"":"s"}</div></div></button>})}</div></section> : null}
        <MediaRow title="Top Rated" items={topRated} userData={userData} onOpen={setDetailItem}/>
        {!loading && !items.length ? <EmptyState icon="vault" title="Your Vault is ready" text="Save your first video, image, PDF, or reference link." action={()=>setAddOpen(true)} actionLabel="Add your first item"/> : null}
      </>
    );
  } else if(route==="library") {
    page = <><div className="v2-hero"><div className="v2-eyebrow">Everything you saved</div><h1 className="v2-h1">Library</h1><p className="v2-lead">One clean view of your entire Vault.</p></div>{filtersBar}{renderGrid(allFiltered,"No matching media","Try clearing filters or add something new.")}</>;
  } else if(route==="inbox") {
    page = <><div className="v2-hero"><div className="v2-eyebrow">{inboxItems.length} waiting</div><h1 className="v2-h1">Inbox</h1><p className="v2-lead">Anything saved without a Collection lands here. Assign a Collection from item detail when you are ready.</p></div>{renderGrid(inboxItems,"Inbox cleared","Every saved item is organized into a Collection.")}</>;
  } else if(route==="search") {
    page = <>
      <div className="v2-hero">
        <div className="v2-eyebrow">Find anything</div>
        <h1 className="v2-h1">{query ? "Results for “"+query+"”" : "Search"}</h1>
        <p className="v2-lead">Search your Vault first, or safely search the web and save a result directly into your library.</p>
      </div>
      <div className="v2-web-search-card">
        <div>
          <div className="v2-section-title">Search outside Vault</div>
          <div className="v2-section-sub">Server-side search results only. Preview when allowed, then save the source URL into Vault.</div>
        </div>
        <button type="button" className="v2-btn v2-btn-primary" onClick={()=>setBrowserOpen(true)}>
          <Icon name="search" size={15}/> Search the web
        </button>
      </div>
      {filtersBar}
      {query.trim()?renderGrid(allFiltered,"No Vault results","Try web search for this phrase, or clear a filter."):<EmptyState icon="search" title="Search your Vault" text="Use the search field above, or search the web for something new to save." action={()=>setBrowserOpen(true)} actionLabel="Search the web"/>}
    </>;
  } else if(route==="collections") {
    page = selectedCollection ? <><div className="v2-hero"><button className="v2-linkbtn" onClick={()=>router.push("/collections")}>← All Collections</button><div className="v2-eyebrow">Collection</div><h1 className="v2-h1">{selectedCollection}</h1><p className="v2-lead">{collectionItems.length} item{collectionItems.length===1?"":"s"}</p></div>{renderGrid(collectionItems,"Collection is empty","Add media and choose this Collection as its destination.")}</> : <><div className="v2-hero"><div className="v2-eyebrow">Organize without clutter</div><h1 className="v2-h1">Collections</h1><p className="v2-lead">Folders and galleries share one simple product concept: Collections.</p></div><div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}><button className="v2-btn v2-btn-primary" onClick={()=>setNewCollectionOpen(true)}><Icon name="plus" size={15}/> New Collection</button></div>{folders.length?<div className="v2-collection-grid">{folders.map((f)=>{const count=displayItems.filter((i)=>folderFor(i,userData[i.key]||{})===f.name).length;return <button className="v2-collection" key={f.name} onClick={()=>router.push("/collections?folder="+encodeURIComponent(f.name))}><div className="v2-collection-icon"><Icon name="folder" size={20}/></div><div><div className="v2-collection-name">{f.name}</div><div className="v2-collection-count">{count} item{count===1?"":"s"}{f.parent_folder?" · in "+f.parent_folder:""}</div></div></button>})}</div>:<EmptyState icon="folder" title="No Collections yet" text="Create a Collection to organize related media." action={()=>setNewCollectionOpen(true)} actionLabel="New Collection"/>}</>;
  } else {
    page = <><div className="v2-hero"><div className="v2-eyebrow">Vault preferences</div><h1 className="v2-h1">Settings</h1><p className="v2-lead">Account, data, sync, and security status in one quiet place.</p></div><div className="v2-settings-grid"><div className="v2-settings-card"><h3>Library</h3><p>{items.length} saved items · {folders.length} Collections · {inboxItems.length} in Inbox.</p></div><div className="v2-settings-card"><h3>Cloud sync</h3><p>Supabase is the durable source of truth. Unsynced changes stay visibly marked until confirmed.</p><div style={{marginTop:12}}><span className="v2-state-pill" data-state={online?"ok":"warn"}>{online?"Online":"Offline"}</span></div></div><div className="v2-settings-card"><h3>Security</h3><p>Authenticated data access, RLS ownership checks, and protected media proxies are active in this preview.</p></div><div className="v2-settings-card"><h3>Account</h3><p>{user?.email || "Signed in"}</p><button type="button" className="v2-btn" style={{marginTop:14}} onClick={async()=>{await supabase.auth.signOut();window.location.reload();}}><Icon name="logout" size={15}/> Sign out</button></div></div></>;
  }

  return (
    <div className="v2-root">
      {!online ? <div className="v2-offline" role="status">Offline · changes will stay pending</div> : null}
      <SyncStatus userId={user?.id} onSynced={()=>refresh(user?.id)}/>
      <div className="v2-shell">
        <aside className="v2-sidebar" aria-label="Primary navigation">
          <div className="v2-brand"><span className="v2-brandmark"><Icon name="vault" size={17}/></span><span>Vault</span></div>
          <nav className="v2-nav">
            {NAV.map(([id,href,icon,label])=><Link key={id} href={href} className="v2-nav-link" aria-current={route===id?"page":undefined}><Icon name={icon} size={17}/><span>{label}</span></Link>)}
            <div className="v2-nav-spacer"/>
            <button type="button" className="v2-btn v2-btn-primary" onClick={()=>setAddOpen(true)}><Icon name="plus" size={15}/> Add media</button>
          </nav>
          <div className="v2-sidebar-foot"><div className="v2-status-card"><strong style={{color:"var(--v2-text)"}}>{items.length} items</strong><br/>{inboxItems.length?inboxItems.length+" waiting in Inbox":"Inbox clear"}</div></div>
        </aside>

        <main className="v2-main">
          <header className="v2-topbar">
            <div className="v2-mobile-title">{ROUTE_TITLES[route]}</div>
            <form className="v2-searchbox" role="search" onSubmit={globalSearchSubmit}>
              <Icon name="search" size={16}/>
              <input ref={searchRef} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search Vault" aria-label="Search Vault"/>
              <span className="v2-hint" aria-hidden="true">⌘K</span>
            </form>
            <button type="button" className="v2-btn v2-btn-primary v2-desktop-add" onClick={()=>setAddOpen(true)}><Icon name="plus" size={15}/> Add</button>
            <button type="button" className="v2-iconbtn" onClick={()=>router.push("/settings")} aria-label="Settings"><Icon name="settings" size={17}/></button>
          </header>
          <div className="v2-content">
            {loadError ? <div className="v2-error" role="alert"><span>{loadError}</span><button className="v2-btn" onClick={()=>refresh(user?.id)}>Retry</button></div> : null}
            {page}
          </div>
        </main>
      </div>

      <nav className="v2-mobile-nav" aria-label="Mobile navigation">
        {MOBILE_NAV.map(([id,href,icon,label])=>id==="add"?
          <button key={id} type="button" className="v2-mobile-add" onClick={()=>setAddOpen(true)} aria-label="Add media"><Icon name="plus" size={21}/></button>
          :<Link key={id} href={href} aria-current={route===id?"page":undefined}><Icon name={icon} size={18}/><span>{label}</span></Link>
        )}
      </nav>

      <AddMediaSheet open={addOpen||!!editItem} initialItem={editItem} userId={user?.id} onClose={()=>{setAddOpen(false);setEditItem(null)}} onSave={saveItem} folders={folders} onCreateCollection={createCollection}/>
      <DetailDrawer
        item={detailItem}
        state={detailItem?userData[detailItem.key]||{}:{}}
        folders={folders}
        userId={user?.id}
        activityRevision={activityRevision}
        currentIndex={detailIndex}
        totalItems={detailContextItems.length}
        onNavigate={(idx)=>{ const next=detailContextItems[idx]; if(next) setDetailItem(next); }}
        onClose={()=>setDetailItem(null)}
        onPlay={play}
        onFavorite={toggleFav}
        onFolder={assignFolder}
        onRating={rateItem}
        onEdit={(item)=>{setEditItem(item);setDetailItem(null)}}
        onDelete={deleteItem}
      />

      <MobileControlSheet kind={mobileControl} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} folders={folders} onClose={()=>setMobileControl(null)}/>

      {browserOpen ? (
        <InAppBrowser
          onClose={()=>setBrowserOpen(false)}
          onSave={saveItem}
          folders={folders}
          isMobile={mobileBrowser}
          onCreateFolder={createCollection}
          initialQuery={query}
        />
      ) : null}

      {newCollectionOpen ? <>
        <div className="v2-backdrop" onMouseDown={()=>setNewCollectionOpen(false)} aria-hidden="true"/>
        <section ref={newCollectionRef} className="v2-sheet" role="dialog" aria-modal="true" aria-labelledby="v2-new-collection-title" style={{maxWidth:460}}>
          <div className="v2-sheet-head"><div className="v2-modal-title" id="v2-new-collection-title">New Collection</div><button className="v2-iconbtn" onClick={()=>setNewCollectionOpen(false)} aria-label="Close"><Icon name="x" size={18}/></button></div>
          <div className="v2-sheet-body"><div className="v2-field"><label htmlFor="v2-collection-name">Name</label><input id="v2-collection-name" autoFocus className="v2-input" value={newCollectionName} onChange={(e)=>setNewCollectionName(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter")document.getElementById("v2-create-collection")?.click()}} placeholder="Ideas, Lighting, Family…"/></div></div>
          <div className="v2-sheet-foot"><button className="v2-btn" onClick={()=>setNewCollectionOpen(false)}>Cancel</button><button id="v2-create-collection" className="v2-btn v2-btn-primary" disabled={!newCollectionName.trim()||collectionBusy} onClick={async()=>{setCollectionBusy(true);try{await createCollection(newCollectionName);setNewCollectionName("");setNewCollectionOpen(false)}finally{setCollectionBusy(false)}}}>{collectionBusy?"Creating…":"Create"}</button></div>
        </section>
      </> : null}

      {playerItem ? <Player
        item={playerItem}
        items={displayItems}
        currentIdx={Math.max(0,displayItems.findIndex((x)=>x.key===playerItem.key))}
        onNavigate={(idx)=>setPlayerItem(displayItems[idx])}
        onClose={()=>setPlayerItem(null)}
        userId={user?.id}
        resumeAt={userData[playerItem.key]?.progress||0}
        rating={userData[playerItem.key]?.rating||0}
        onRate={(rating)=>rateItem(playerItem.key,rating)}
        onAddMoment={async (mark)=>{
          if(!user) return null;
          const saved = await addMomentMark(user.id,playerItem.key,mark);
          setActivityRevision((n)=>n+1);
          return saved;
        }}
        variant="integrated"
        oilCount={Number(userData[playerItem.key]?.oil_count||0)}
        onOil={()=>{}}
      /> : null}
    </div>
  );
}
