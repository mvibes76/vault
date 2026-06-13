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
  await supabase.from("user_data").upsert(
    { user_id: userId, item_key: itemKey, progress, duration, updated_at: new Date().toISOString() },
    { onConflict: "user_id,item_key" }
  );
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
  await supabase.from("vault_folders").insert({ user_id: userId, name });
};

export const deleteFolder = async (userId, name) => {
  if (!supabase) return;
  await supabase.from("vault_folders").delete().eq("user_id", userId).eq("name", name);
  await supabase.from("user_data").update({ folder: null }).eq("user_id", userId).eq("folder", name);
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

// ─── Quick Adds ───────────────────────────────────────────────────────────────

export const getQuickAdds = async (userId) => {
  if (!supabase) return [];
  const { data } = await supabase
    .from("vault_quick_adds")
    .select("item_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data?.map((r) => r.item_data) || [];
};

export const addQuickAdd = async (userId, item) => {
  if (!supabase) return;
  await supabase.from("vault_quick_adds").upsert(
    { user_id: userId, item_key: item.key, item_data: item },
    { onConflict: "user_id,item_key" }
  );
};

export const removeQuickAdd = async (userId, itemKey) => {
  if (!supabase) return;
  await supabase.from("vault_quick_adds").delete()
    .eq("user_id", userId)
    .eq("item_key", itemKey);
};
