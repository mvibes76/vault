"use client";
import { parseOutbox, upsertEntry, markEntryError, clearEntry, entityState, pendingItems, mergeRemoteItems } from "./sync-outbox-core.mjs";

export const SYNC_V2_ENABLED = process.env.NEXT_PUBLIC_VAULT_SYNC_V2 === "true";
export const OUTBOX_KEY = "vv_sync_v2_outbox";
const EVENT_NAME = "vault-sync-v2-change";

function storage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readOutbox() {
  if (!SYNC_V2_ENABLED) return [];
  try { return parseOutbox(storage()?.getItem(OUTBOX_KEY)); } catch { return []; }
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
  const next = upsertEntry(readOutbox(), entry);
  writeOutbox(next);
  return next.find((x) => x.id === entry.id) || entry;
}

export function markMutationError(id, error) {
  if (!SYNC_V2_ENABLED) return;
  writeOutbox(markEntryError(readOutbox(), id, error));
}

export function clearMutation(id) {
  if (!SYNC_V2_ENABLED) return;
  writeOutbox(clearEntry(readOutbox(), id));
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
  return entityState(readOutbox(), entityType, entityKey);
}

export function pendingItemPayloads() {
  if (!SYNC_V2_ENABLED) return [];
  return pendingItems(readOutbox());
}

export function mergeRemoteItemsWithOutbox(remoteItems = []) {
  if (!SYNC_V2_ENABLED) return remoteItems;
  return mergeRemoteItems(remoteItems, pendingItemPayloads());
}
