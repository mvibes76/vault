"use client";
import { createClient } from "@supabase/supabase-js";
import { SYNC_V2_ENABLED, mutationId, queueMutation, markMutationError, clearMutation } from "@/lib/sync-outbox";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const isSupabaseConfigured = () => !!supabase;
const MUTATION_SECURITY_ENABLED = process.env.NEXT_PUBLIC_VAULT_SECURITY_V2 === "true";
export const VAULT_MEDIA_BUCKET = "vault-media";
export const VAULT_MEDIA_PREFIX = "vault-media://vault-media/";
const VAULT_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export const isVaultMediaLocator = (value) => String(value || "").startsWith(VAULT_MEDIA_PREFIX);

export const vaultMediaPathFromLocator = (value) => {
  const raw = String(value || "");
  if (!isVaultMediaLocator(raw)) return "";
  return raw.slice(VAULT_MEDIA_PREFIX.length);
};

function fileExtension(file) {
  const fromName = String(file?.name || "").match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const mime = String(file?.type || "").toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/mp4") return "m4a";
  return "bin";
}

function mediaKindForFile(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

async function requireStorageOwner(userId) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id || data.user.id !== userId) {
    const owned = new Error("Authenticated user does not own this upload");
    owned.code = "UPLOAD_OWNER_MISMATCH";
    throw owned;
  }
}

export async function resolveVaultMediaUrl(locator, expiresIn = 86400) {
  const path = vaultMediaPathFromLocator(locator);
  if (!path || !supabase) return "";
  const { data, error } = await supabase.storage.from(VAULT_MEDIA_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || "";
}

export async function uploadVaultMedia(userId, file) {
  if (!file) throw new Error("Choose a file to upload");
  await requireStorageOwner(userId);
  const type = String(file.type || "").toLowerCase();
  if (!/^(image|video|audio)\//.test(type)) throw new Error("Vault accepts image, video, or audio uploads");
  if (Number(file.size || 0) > VAULT_MEDIA_MAX_BYTES) throw new Error("Free-plan uploads are limited to 50 MB per file");

  const now = new Date();
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : newStableId();
  const ext = fileExtension(file);
  const path = `${userId}/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,"0")}/${id}.${ext}`;
  const result = await supabase.storage.from(VAULT_MEDIA_BUCKET).upload(path, file, {
    contentType: type,
    cacheControl: "3600",
    upsert: false,
  });
  if (result.error) throw result.error;

  const locator = `${VAULT_MEDIA_PREFIX}${path}`;
  try {
    const signedUrl = await resolveVaultMediaUrl(locator);
    return { locator, path, signedUrl, type: mediaKindForFile(file), mimeType: type, size: Number(file.size || 0) };
  } catch (error) {
    await supabase.storage.from(VAULT_MEDIA_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
}

export async function deleteVaultMedia(userId, locator) {
  const path = vaultMediaPathFromLocator(locator);
  if (!path) return null;
  await requireStorageOwner(userId);
  const { data, error } = await supabase.storage.from(VAULT_MEDIA_BUCKET).remove([path]);
  if (error) throw error;
  return data;
}

function failIfError(result, label = "Vault mutation") {
  if (result?.error) {
    const error = new Error(result.error.message || `${label} failed`);
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }
  return result?.data ?? null;
}
async function runCheckedMutation(entry, executor) {
  if (!supabase) {
    const error = new Error("Supabase is not configured");
    if (SYNC_V2_ENABLED) { queueMutation(entry); markMutationError(entry.id, error); }
    throw error;
  }
  if (SYNC_V2_ENABLED) queueMutation(entry);
  try {
    if (MUTATION_SECURITY_ENABLED) {
      const { data: identity, error: identityError } = await supabase.auth.getUser();
      if (identityError || !identity?.user?.id || identity.user.id !== entry.userId) {
        const error = new Error("Authenticated user does not own this mutation");
        error.code = "MUTATION_OWNER_MISMATCH";
        throw error;
      }
    }
    const data = failIfError(await executor(), entry.kind);
    if (SYNC_V2_ENABLED) clearMutation(entry.id);
    return data;
  } catch (error) {
    if (SYNC_V2_ENABLED) markMutationError(entry.id, error);
    throw error;
  }
}
function newStableId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12,"0").slice(0,12)}`;
}

// ─── User data: favorites + watch progress + folder ───────────────────────────

export const getUserData = async (userId) => {
  if (!supabase) return {};
  const { data } = await supabase.from("user_data").select("*").eq("user_id", userId);
  const map = {};
  (data || []).forEach((row) => { map[row.item_key] = row; });
  return map;
};

export const toggleFavorite = async (userId,itemKey,current) => runCheckedMutation({
  id: mutationId("favorite",itemKey), kind:"favorite", entityType:"item", entityKey:itemKey, userId, payload:{itemKey,current}
},()=>supabase.from("user_data").upsert({user_id:userId,item_key:itemKey,favorite:!current,updated_at:new Date().toISOString()},{onConflict:"user_id,item_key"}));

export const saveProgress = async (userId,itemKey,progress,duration) => {
  const patch={user_id:userId,item_key:itemKey,progress,duration,updated_at:new Date().toISOString()};
  if(duration&&progress&&progress/duration>0.95) patch.completed_count=1;
  return runCheckedMutation({id:mutationId("progress",itemKey),kind:"progress",entityType:"item",entityKey:itemKey,userId,payload:{itemKey,progress,duration}},
    ()=>supabase.from("user_data").upsert(patch,{onConflict:"user_id,item_key"}));
};

export const recordItemView = async (userId,itemKey) => {
  if(!supabase) return null;
  const now=new Date().toISOString();
  const existing=await supabase.from("user_data").select("view_count,first_viewed_at").eq("user_id",userId).eq("item_key",itemKey).maybeSingle();
  if(existing.error) throw existing.error;
  const payload={user_id:userId,item_key:itemKey,view_count:Number(existing.data?.view_count||0)+1,first_viewed_at:existing.data?.first_viewed_at||now,last_viewed_at:now,updated_at:now};
  await runCheckedMutation({id:mutationId("item-view",itemKey),kind:"item-view",entityType:"item",entityKey:itemKey,userId,payload:{itemKey,values:payload}},
    ()=>supabase.from("user_data").upsert(payload,{onConflict:"user_id,item_key"}));
  return payload;
};

export const recordItemOil = async (userId,itemKey) => {
  if(!supabase) return null;
  const now=new Date().toISOString();
  const existing=await supabase.from("user_data").select("oil_count").eq("user_id",userId).eq("item_key",itemKey).maybeSingle();
  if(existing.error) throw existing.error;
  const payload={user_id:userId,item_key:itemKey,oil_count:Number(existing.data?.oil_count||0)+1,last_oiled_at:now,updated_at:now};
  await runCheckedMutation({id:mutationId("item-oil",itemKey),kind:"item-oil",entityType:"item",entityKey:itemKey,userId,payload:{itemKey,values:payload}},
    ()=>supabase.from("user_data").upsert(payload,{onConflict:"user_id,item_key"}));
  return payload;
};

export const setItemFolder = async (userId,itemKey,folder) => runCheckedMutation({
  id:mutationId("item-folder",itemKey),kind:"item-folder",entityType:"item",entityKey:itemKey,userId,payload:{itemKey,folder}
},()=>supabase.from("user_data").upsert({user_id:userId,item_key:itemKey,folder,updated_at:new Date().toISOString()},{onConflict:"user_id,item_key"}));

// ─── Folders ──────────────────────────────────────────────────────────────────

export const getFolders = async (userId) => {
  if (!supabase) return [];
  const { data } = await supabase.from("vault_folders").select("*").eq("user_id", userId).order("name");
  return (data || []).map((f) => ({
    ...f,
    kind: f.kind || "folder",
    display_mode: f.display_mode || "grid",
    cover: f.cover || "",
    note: f.note || "",
    parent_folder: f.parent_folder || null,
    view_count: Number(f.view_count || 0),
    last_viewed_at: f.last_viewed_at || null,
  }));
};

export const createFolder = async (userId,name,options={}) => {
  if(!supabase) throw new Error("Supabase is not configured");
  const cleaned=String(name||"").trim(); if(!cleaned) return null;
  const id=mutationId("folder-create",cleaned.toLowerCase());
  const existing=await supabase.from("vault_folders").select("name").eq("user_id",userId).ilike("name",cleaned).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data?.name){ if(SYNC_V2_ENABLED) clearMutation(id); return existing.data.name; }
  await runCheckedMutation({id,kind:"folder-create",entityType:"folder",entityKey:cleaned.toLowerCase(),userId,payload:{name:cleaned,options}},
    ()=>supabase.from("vault_folders").insert({user_id:userId,name:cleaned,kind:options.kind||"folder",display_mode:options.display_mode||"grid",cover:options.cover||null,note:options.note||null,parent_folder:options.parent_folder||null}));
  return cleaned;
};

export const updateFolder = async (userId,name,patch={}) => {
  if(!supabase) throw new Error("Supabase is not configured");
  const cleaned=String(name||"").trim(); if(!cleaned) return null;
  const payload={...patch,updated_at:new Date().toISOString()}; delete payload.id; delete payload.user_id; delete payload.name;
  return runCheckedMutation({id:mutationId("folder-update",cleaned.toLowerCase()),kind:"folder-update",entityType:"folder",entityKey:cleaned.toLowerCase(),userId,payload:{name:cleaned,patch:payload}},
    ()=>supabase.from("vault_folders").update(payload).eq("user_id",userId).ilike("name",cleaned).select("*").maybeSingle());
};

export const recordFolderView = async (userId,name) => {
  if(!supabase) return null;
  const cleaned=String(name||"").trim(); if(!cleaned) return null;
  const now=new Date().toISOString();
  const existing=await supabase.from("vault_folders").select("view_count").eq("user_id",userId).ilike("name",cleaned).maybeSingle();
  if(existing.error) throw existing.error;
  const nextCount=Number(existing.data?.view_count||0)+1;
  return runCheckedMutation({id:mutationId("folder-view",cleaned.toLowerCase()),kind:"folder-view",entityType:"folder",entityKey:cleaned.toLowerCase(),userId,payload:{name:cleaned,nextCount,now}},
    ()=>supabase.from("vault_folders").update({view_count:nextCount,last_viewed_at:now,updated_at:now}).eq("user_id",userId).ilike("name",cleaned).select("*").maybeSingle());
};

export const renameFolder = async (userId,oldName,newName) => {
  if(!supabase) throw new Error("Supabase is not configured");
  const from=String(oldName||"").trim(),to=String(newName||"").trim(); if(!from||!to) return null;
  return runCheckedMutation({id:mutationId("folder-rename",from.toLowerCase()),kind:"folder-rename",entityType:"folder",entityKey:from.toLowerCase(),userId,payload:{oldName:from,newName:to}},async()=>{
    const existing=await supabase.from("vault_folders").select("name").eq("user_id",userId).ilike("name",to).maybeSingle();
    if(existing.error) return existing;
    const target=existing.data?.name||to;
    const steps=[
      existing.data?.name ? await supabase.from("vault_folders").delete().eq("user_id",userId).ilike("name",from) : await supabase.from("vault_folders").update({name:target}).eq("user_id",userId).ilike("name",from),
      await supabase.from("user_data").update({folder:target,updated_at:new Date().toISOString()}).eq("user_id",userId).ilike("folder",from),
      await supabase.from("vault_items").update({folder:target,updated_at:new Date().toISOString()}).eq("user_id",userId).ilike("folder",from),
      await supabase.from("vault_folders").update({parent_folder:target,updated_at:new Date().toISOString()}).eq("user_id",userId).ilike("parent_folder",from)
    ];
    return steps.find(x=>x.error)||{data:target,error:null};
  });
};

export const deleteFolder = async (userId,name) => {
  if(!supabase) throw new Error("Supabase is not configured");
  const cleaned=String(name||"").trim(); if(!cleaned) return null;
  return runCheckedMutation({id:mutationId("folder-delete",cleaned.toLowerCase()),kind:"folder-delete",entityType:"folder",entityKey:cleaned.toLowerCase(),userId,payload:{name:cleaned}},async()=>{
    const steps=[
      await supabase.from("vault_folders").delete().eq("user_id",userId).ilike("name",cleaned),
      await supabase.from("vault_folders").update({parent_folder:null,updated_at:new Date().toISOString()}).eq("user_id",userId).ilike("parent_folder",cleaned),
      await supabase.from("user_data").update({folder:null,updated_at:new Date().toISOString()}).eq("user_id",userId).ilike("folder",cleaned),
      await supabase.from("vault_items").update({folder:null,updated_at:new Date().toISOString()}).eq("user_id",userId).ilike("folder",cleaned)
    ];
    return steps.find(x=>x.error)||{data:true,error:null};
  });
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const getSettings = async (userId) => {
  if (!supabase) return null;
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).single();
  return data;
};

export const saveSettings = async (userId,settings) => runCheckedMutation({
  id:mutationId("settings",userId),kind:"settings",entityType:"settings",entityKey:userId,userId,payload:{settings}
},()=>supabase.from("user_settings").upsert({user_id:userId,...settings,updated_at:new Date().toISOString()},{onConflict:"user_id"}));

// ─── Vault items: app-native library rows ───────────────────────────────────

export const getVaultItems = async (userId) => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("vault_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    // Allows older databases to keep opening while the user runs v12 schema.
    console.warn("[vault_items]", error.message);
    return [];
  }
  return Promise.all((data || []).map(async (r) => {
    const canonicalUrl = r.url;
    const canonicalThumb = r.thumbnail || "";
    const uploaded = isVaultMediaLocator(canonicalUrl);
    let resolvedUrl = canonicalUrl;
    let resolvedThumb = canonicalThumb;
    if (uploaded) {
      try { resolvedUrl = await resolveVaultMediaUrl(canonicalUrl); } catch {}
    }
    if (canonicalThumb && isVaultMediaLocator(canonicalThumb)) {
      resolvedThumb = canonicalThumb === canonicalUrl && resolvedUrl !== canonicalUrl
        ? resolvedUrl
        : await resolveVaultMediaUrl(canonicalThumb).catch(() => canonicalThumb);
    }
    return {
    id: r.id,
    key: r.item_key,
    canonical_url: canonicalUrl,
    canonical_thumbnail: canonicalThumb,
    storage_path: uploaded ? vaultMediaPathFromLocator(canonicalUrl) : null,
    isUploadedMedia: uploaded,
    url: resolvedUrl,
    title: r.title || r.url,
    note: r.note || "",
    tags: r.tags || [],
    source: r.source || undefined,
    folder: r.folder || null,
    thumbnail: resolvedThumb,
    thumbnail_source: r.thumbnail_source || null,
    cover_mode: r.cover_mode || null,
    cover_fit: r.cover_fit || "cover",
    cover_position_x: Number.isFinite(Number(r.cover_position_x)) ? Number(r.cover_position_x) : 50,
    cover_position_y: Number.isFinite(Number(r.cover_position_y)) ? Number(r.cover_position_y) : 50,
    type: r.type || "link",
    addedAt: r.created_at,
    updatedAt: r.updated_at,
    isVaultItem: true,
    };
  }));
};

export const upsertVaultItem = async (userId,item) => {
  const persistedUrl=item.canonical_url||item.url;
  const persistedThumb=item.canonical_thumbnail||item.thumbnail||null;
  const values={user_id:userId,item_key:item.key,url:persistedUrl,title:item.title||persistedUrl,note:item.note||"",tags:item.tags||[],source:item.source||null,folder:item.folder||null,thumbnail:persistedThumb,thumbnail_source:item.thumbnail_source||null,cover_mode:item.cover_mode||null,cover_fit:item.cover_fit||"cover",cover_position_x:Number.isFinite(Number(item.cover_position_x))?Number(item.cover_position_x):50,cover_position_y:Number.isFinite(Number(item.cover_position_y))?Number(item.cover_position_y):50,type:item.type||"link",updated_at:new Date().toISOString()};
  return runCheckedMutation({id:mutationId("vault-item-upsert",item.key),kind:"vault-item-upsert",entityType:"item",entityKey:item.key,userId,payload:{item}},
    ()=>supabase.from("vault_items").upsert(values,{onConflict:"user_id,item_key"}));
};

export const removeVaultItem = async (userId,itemKey) => runCheckedMutation({
  id:mutationId("vault-item-delete",itemKey),kind:"vault-item-delete",entityType:"item",entityKey:itemKey,userId,payload:{itemKey}
},()=>supabase.from("vault_items").delete().eq("user_id",userId).eq("item_key",itemKey));

export const setItemRating = async (userId,itemKey,rating) => runCheckedMutation({
  id:mutationId("item-rating",itemKey),kind:"item-rating",entityType:"item",entityKey:itemKey,userId,payload:{itemKey,rating}
},()=>supabase.from("user_data").upsert({user_id:userId,item_key:itemKey,rating,rated_at:rating?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:"user_id,item_key"}));

export const addMomentMark = async (userId,itemKey,mark,options={}) => {
  const id=options.id||newStableId();
  const values={id,user_id:userId,item_key:itemKey,seconds:mark.seconds||0,rating:mark.rating||null,note:mark.note||null};
  return runCheckedMutation({id:mutationId("moment-mark",id),kind:"moment-mark",entityType:"item",entityKey:itemKey,userId,payload:{id,itemKey,mark}},
    ()=>SYNC_V2_ENABLED?supabase.from("vault_moment_marks").upsert(values,{onConflict:"id"}):supabase.from("vault_moment_marks").insert(values));
};

export const getMomentMarks = async (userId, itemKey) => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("vault_moment_marks")
    .select("*")
    .eq("user_id", userId)
    .eq("item_key", itemKey)
    .order("seconds", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[vault_moment_marks]", error.message);
    return [];
  }
  return data || [];
};

// Backwards-compatible aliases used by older components.
export const getQuickAdds = getVaultItems;
export const addQuickAdd = upsertVaultItem;
export const removeQuickAdd = removeVaultItem;

// ─── Comments ───────────────────────────────────────────────────────────────

export const getItemComments = async (userId, itemKey) => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("vault_comments")
    .select("*")
    .eq("user_id", userId)
    .eq("item_key", itemKey)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[vault_comments]", error.message);
    return [];
  }
  return data || [];
};

export const addItemComment = async (userId,itemKey,body,options={}) => {
  const text=String(body||"").trim(); if(!text) return null;
  const id=options.id||newStableId(), values={id,user_id:userId,item_key:itemKey,body:text};
  return runCheckedMutation({id:mutationId("comment-add",id),kind:"comment-add",entityType:"item",entityKey:itemKey,userId,payload:{id,itemKey,body:text}},
    ()=> (SYNC_V2_ENABLED?supabase.from("vault_comments").upsert(values,{onConflict:"id"}):supabase.from("vault_comments").insert(values)).select("*").single());
};

export const deleteItemComment = async (userId,commentId) => runCheckedMutation({
  id:mutationId("comment-delete",commentId),kind:"comment-delete",entityType:"comment",entityKey:commentId,userId,payload:{commentId}
},()=>supabase.from("vault_comments").delete().eq("user_id",userId).eq("id",commentId));

// ─── Cover library ──────────────────────────────────────────────────────────

export const getCoverLibrary = async (userId) => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("vault_covers")
    .select("*")
    .eq("user_id", userId)
    .order("priority", { ascending: true })
    .order("label", { ascending: true });
  if (error) {
    console.warn("[vault_covers]", error.message);
    return [];
  }
  return data || [];
};

export const upsertCover = async (userId,cover) => {
  const payload={user_id:userId,label:String(cover.label||"").trim(),thumbnail:String(cover.thumbnail||"").trim(),match_type:cover.match_type||"any",keywords:Array.isArray(cover.keywords)?cover.keywords.map(k=>String(k||"").trim()).filter(Boolean):[],note:cover.note||"",enabled:cover.enabled!==false,priority:Number.isFinite(Number(cover.priority))?Number(cover.priority):100,cover_fit:cover.cover_fit||"cover",cover_position_x:Number.isFinite(Number(cover.cover_position_x))?Number(cover.cover_position_x):50,cover_position_y:Number.isFinite(Number(cover.cover_position_y))?Number(cover.cover_position_y):50,updated_at:new Date().toISOString()};
  if(!payload.label||!payload.thumbnail) return null;
  const coverId=cover.id&&!String(cover.id).startsWith("local-")?cover.id:newStableId(); payload.id=coverId;
  return runCheckedMutation({id:mutationId("cover-upsert",coverId),kind:"cover-upsert",entityType:"cover",entityKey:coverId,userId,payload:{cover:{...cover,id:coverId}}},
    ()=>supabase.from("vault_covers").upsert(payload,{onConflict:"id"}).select("*").single());
};

export const deleteCover = async (userId,coverId) => {
  if(!coverId) return null;
  return runCheckedMutation({id:mutationId("cover-delete",coverId),kind:"cover-delete",entityType:"cover",entityKey:coverId,userId,payload:{coverId}},
    ()=>supabase.from("vault_covers").delete().eq("user_id",userId).eq("id",coverId));
};

export const retryPendingMutation = async (userId,entry) => {
  if(!entry || entry.userId!==userId) throw new Error("Pending mutation belongs to a different user");
  const p=entry.payload||{};
  switch(entry.kind){
    case "favorite": return toggleFavorite(userId,p.itemKey,p.current);
    case "progress": return saveProgress(userId,p.itemKey,p.progress,p.duration);
    case "item-view": return runCheckedMutation(entry,()=>supabase.from("user_data").upsert(p.values,{onConflict:"user_id,item_key"}));
    case "item-oil": return runCheckedMutation(entry,()=>supabase.from("user_data").upsert(p.values,{onConflict:"user_id,item_key"}));
    case "item-folder": return setItemFolder(userId,p.itemKey,p.folder);
    case "folder-create": return createFolder(userId,p.name,p.options||{});
    case "folder-update": return updateFolder(userId,p.name,p.patch||{});
    case "folder-view": return runCheckedMutation(entry,()=>supabase.from("vault_folders").update({view_count:p.nextCount,last_viewed_at:p.now,updated_at:p.now}).eq("user_id",userId).ilike("name",p.name).select("*").maybeSingle());
    case "folder-rename": return renameFolder(userId,p.oldName,p.newName);
    case "folder-delete": return deleteFolder(userId,p.name);
    case "settings": return saveSettings(userId,p.settings||{});
    case "vault-item-upsert": return upsertVaultItem(userId,p.item);
    case "vault-item-delete": return removeVaultItem(userId,p.itemKey);
    case "item-rating": return setItemRating(userId,p.itemKey,p.rating);
    case "moment-mark": return addMomentMark(userId,p.itemKey,p.mark||{},{id:p.id});
    case "comment-add": return addItemComment(userId,p.itemKey,p.body,{id:p.id});
    case "comment-delete": return deleteItemComment(userId,p.commentId);
    case "cover-upsert": return upsertCover(userId,p.cover||{});
    case "cover-delete": return deleteCover(userId,p.coverId);
    default: throw new Error(`Unsupported pending mutation: ${entry.kind}`);
  }
};
