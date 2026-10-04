"use client";

export const SYNC_V2_ENABLED = process.env.NEXT_PUBLIC_VAULT_SYNC_V2 === "true";
export const OUTBOX_KEY = "vv_sync_v2_outbox";
const EVENT_NAME = "vault-sync-v2-change";

function storage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readOutbox() {
  if (!SYNC_V2_ENABLED) return [];
  try {
    const raw = storage()?.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(entries) {
  if (!SYNC_V2_ENABLED) return;
  try { storage()?.setItem(OUTBOX_KEY, JSON.stringify(entries)); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function mutationId(kind, entityKey) {
  return `${String(kind || "mutation")}:${String(entityKey || "unknown")}`;
}

export function queueMutation(entry) {
  if (!SYNC_V2_ENABLED) return entry;
  const now = new Date().toISOString();
  const nextEntry = {
    ...entry,
    state: "pending",
    error: null,
    createdAt: entry.createdAt || now,
    updatedAt: now,
  };
  const next = readOutbox().filter((x) => x.id !== nextEntry.id);
  next.push(nextEntry);
  writeOutbox(next);
  return nextEntry;
}

export function markMutationError(id, error) {
  if (!SYNC_V2_ENABLED) return;
  const message = error?.message || String(error || "Cloud save failed");
  const next = readOutbox().map((x) => x.id === id
    ? { ...x, state: "error", error: message, updatedAt: new Date().toISOString() }
    : x
  );
  writeOutbox(next);
}

export function clearMutation(id) {
  if (!SYNC_V2_ENABLED) return;
  writeOutbox(readOutbox().filter((x) => x.id !== id));
}

export function clearAllMutations() {
  if (!SYNC_V2_ENABLED) return;
  writeOutbox([]);
}

export function subscribeOutbox(listener) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener(readOutbox());
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

export function getEntitySyncState(entityType, entityKey) {
  if (!SYNC_V2_ENABLED) return null;
  const matches = readOutbox().filter((x) => x.entityType === entityType && String(x.entityKey) === String(entityKey));
  if (!matches.length) return null;
  return matches.some((x) => x.state === "error") ? "error" : "pending";
}

export function pendingItemPayloads() {
  if (!SYNC_V2_ENABLED) return [];
  return readOutbox()
    .filter((x) => x.kind === "vault-item-upsert" && x.payload?.item?.key)
    .map((x) => ({ ...x.payload.item, __syncState: x.state }));
}

export function mergeRemoteItemsWithOutbox(remoteItems = []) {
  if (!SYNC_V2_ENABLED) return remoteItems;
  const map = new Map((remoteItems || []).map((item) => [item.key, item]));
  for (const item of pendingItemPayloads()) map.set(item.key, { ...map.get(item.key), ...item });
  return [...map.values()];
}
