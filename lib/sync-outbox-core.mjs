export function parseOutbox(raw) {
  if (!raw) return [];
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function upsertEntry(entries, entry, now = new Date().toISOString()) {
  const nextEntry = {
    ...entry,
    state: "pending",
    error: null,
    createdAt: entry.createdAt || now,
    updatedAt: now,
  };
  return [...entries.filter((x) => x.id !== nextEntry.id), nextEntry];
}

export function markEntryError(entries, id, error, now = new Date().toISOString()) {
  const message = error?.message || String(error || "Cloud save failed");
  return entries.map((x) => x.id === id ? { ...x, state: "error", error: message, updatedAt: now } : x);
}

export function clearEntry(entries, id) {
  return entries.filter((x) => x.id !== id);
}

export function entityState(entries, entityType, entityKey) {
  const matches = entries.filter((x) => x.entityType === entityType && String(x.entityKey) === String(entityKey));
  if (!matches.length) return null;
  return matches.some((x) => x.state === "error") ? "error" : "pending";
}

export function pendingItems(entries) {
  return entries
    .filter((x) => x.kind === "vault-item-upsert" && x.payload?.item?.key)
    .map((x) => ({ ...x.payload.item, __syncState: x.state }));
}

export function mergeRemoteItems(remoteItems = [], localPendingItems = []) {
  const map = new Map((remoteItems || []).map((item) => [item.key, item]));
  for (const item of localPendingItems || []) map.set(item.key, { ...map.get(item.key), ...item });
  return [...map.values()];
}
