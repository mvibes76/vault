"use client";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const isSupabaseConfigured = () => !!supabase;

// ─── User data: favorites + watch progress + folder ───────────────────────────

export const getUserData = async (userId) => {
  if (!supabase) return {};
  const { data } = await supabase.from("user_data").select("*").eq("user_id", userId);
  const map = {};
  (data || []).forEach((row) => { map[row.item_key] = row; });
  return map;
};

export const toggleFavorite = async (userId, itemKey, current) => {
  if (!supabase) return;
  await supabase.from("user_data").upsert(
    { user_id: userId, item_key: itemKey, favorite: !current, updated_at: new Date().toISOString() },
    { onConflict: "user_id,item_key" }
  );
};

export const saveProgress = async (userId, itemKey, progress, duration) => {
  if (!supabase) return;
  const patch = { user_id: userId, item_key: itemKey, progress, duration, updated_at: new Date().toISOString() };
  if (duration && progress && progress / duration > 0.95) {
    patch.completed_count = 1;
  }
  await supabase.from("user_data").upsert(patch, { onConflict: "user_id,item_key" });
};

export const recordItemView = async (userId, itemKey) => {
  if (!supabase) return null;
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("user_data")
    .select("view_count,first_viewed_at")
    .eq("user_id", userId)
    .eq("item_key", itemKey)
    .maybeSingle();
  const nextCount = Number(existing?.view_count || 0) + 1;
  const payload = {
    user_id: userId,
    item_key: itemKey,
    view_count: nextCount,
    first_viewed_at: existing?.first_viewed_at || now,
    last_viewed_at: now,
    updated_at: now,
  };
  await supabase.from("user_data").upsert(payload, { onConflict: "user_id,item_key" });
  return payload;
};

export const setItemFolder = async (userId, itemKey, folder) => {
  if (!supabase) return;
  await supabase.from("user_data").upsert(
    { user_id: userId, item_key: itemKey, folder, updated_at: new Date().toISOString() },
    { onConflict: "user_id,item_key" }
  );
};

// ─── Folders ──────────────────────────────────────────────────────────────────

export const getFolders = async (userId) => {
  if (!supabase) return [];
  const { data } = await supabase.from("vault_folders").select("*").eq("user_id", userId).order("name");
  return data || [];
};

export const createFolder = async (userId, name) => {
  if (!supabase) return;
  const cleaned = String(name || "").trim();
  if (!cleaned) return;
  const { data: existing } = await supabase
    .from("vault_folders")
    .select("name")
    .eq("user_id", userId)
    .ilike("name", cleaned)
    .maybeSingle();
  if (existing?.name) return existing.name;
  await supabase.from("vault_folders").insert({ user_id: userId, name: cleaned });
  return cleaned;
};


export const renameFolder = async (userId, oldName, newName) => {
  if (!supabase) return;
  const from = String(oldName || "").trim();
  const to = String(newName || "").trim();
  if (!from || !to) return;
  const { data: existing } = await supabase
    .from("vault_folders")
    .select("name")
    .eq("user_id", userId)
    .ilike("name", to)
    .maybeSingle();
  const target = existing?.name || to;
  if (!existing?.name) {
    await supabase.from("vault_folders").update({ name: target }).eq("user_id", userId).ilike("name", from);
  } else {
    await supabase.from("vault_folders").delete().eq("user_id", userId).ilike("name", from);
  }
  await supabase.from("user_data").update({ folder: target, updated_at: new Date().toISOString() }).eq("user_id", userId).ilike("folder", from);
  await supabase.from("vault_items").update({ folder: target, updated_at: new Date().toISOString() }).eq("user_id", userId).ilike("folder", from);
  return target;
};

export const deleteFolder = async (userId, name) => {
  if (!supabase) return;
  const cleaned = String(name || "").trim();
  if (!cleaned) return;
  await supabase.from("vault_folders").delete().eq("user_id", userId).ilike("name", cleaned);
  await supabase.from("user_data").update({ folder: null, updated_at: new Date().toISOString() }).eq("user_id", userId).ilike("folder", cleaned);
  await supabase.from("vault_items").update({ folder: null, updated_at: new Date().toISOString() }).eq("user_id", userId).ilike("folder", cleaned);
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const getSettings = async (userId) => {
  if (!supabase) return null;
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).single();
  return data;
};

export const saveSettings = async (userId, settings) => {
  if (!supabase) return;
  await supabase.from("user_settings").upsert(
    { user_id: userId, ...settings, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
};

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
  return (data || []).map((r) => ({
    id: r.id,
    key: r.item_key,
    url: r.url,
    title: r.title || r.url,
    note: r.note || "",
    tags: r.tags || [],
    source: r.source || undefined,
    folder: r.folder || null,
    thumbnail: r.thumbnail || "",
    thumbnail_source: r.thumbnail_source || null,
    type: r.type || "link",
    addedAt: r.created_at,
    updatedAt: r.updated_at,
    isVaultItem: true,
  }));
};

export const upsertVaultItem = async (userId, item) => {
  if (!supabase) return;
  await supabase.from("vault_items").upsert(
    {
      user_id: userId,
      item_key: item.key,
      url: item.url,
      title: item.title || item.url,
      note: item.note || "",
      tags: item.tags || [],
      source: item.source || null,
      folder: item.folder || null,
      thumbnail: item.thumbnail || null,
      thumbnail_source: item.thumbnail_source || null,
      type: item.type || "link",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_key" }
  );
};

export const removeVaultItem = async (userId, itemKey) => {
  if (!supabase) return;
  await supabase.from("vault_items").delete().eq("user_id", userId).eq("item_key", itemKey);
};

export const setItemRating = async (userId, itemKey, rating) => {
  if (!supabase) return;
  await supabase.from("user_data").upsert(
    { user_id: userId, item_key: itemKey, rating, rated_at: rating ? new Date().toISOString() : null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,item_key" }
  );
};

export const addMomentMark = async (userId, itemKey, mark) => {
  if (!supabase) return;
  await supabase.from("vault_moment_marks").insert({
    user_id: userId,
    item_key: itemKey,
    seconds: mark.seconds || 0,
    rating: mark.rating || null,
    note: mark.note || null,
  });
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

export const addItemComment = async (userId, itemKey, body) => {
  if (!supabase) return null;
  const text = String(body || "").trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from("vault_comments")
    .insert({ user_id: userId, item_key: itemKey, body: text })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

export const deleteItemComment = async (userId, commentId) => {
  if (!supabase) return;
  await supabase.from("vault_comments").delete().eq("user_id", userId).eq("id", commentId);
};

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

export const upsertCover = async (userId, cover) => {
  if (!supabase) return null;
  const payload = {
    user_id: userId,
    label: String(cover.label || "").trim(),
    thumbnail: String(cover.thumbnail || "").trim(),
    match_type: cover.match_type || "any",
    keywords: Array.isArray(cover.keywords) ? cover.keywords.map((k) => String(k || "").trim()).filter(Boolean) : [],
    note: cover.note || "",
    enabled: cover.enabled !== false,
    priority: Number.isFinite(Number(cover.priority)) ? Number(cover.priority) : 100,
    updated_at: new Date().toISOString(),
  };
  if (!payload.label || !payload.thumbnail) return null;
  if (cover.id && !String(cover.id).startsWith("local-")) payload.id = cover.id;
  const { data, error } = await supabase
    .from("vault_covers")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

export const deleteCover = async (userId, coverId) => {
  if (!supabase || !coverId) return;
  await supabase.from("vault_covers").delete().eq("user_id", userId).eq("id", coverId);
};
