import test from "node:test";
import assert from "node:assert/strict";
import { parseOutbox, upsertEntry, markEntryError, clearEntry, entityState, pendingItems, mergeRemoteItems } from "../lib/sync-outbox-core.mjs";

const base = {
  id: "vault-item-upsert:k-test",
  kind: "vault-item-upsert",
  entityType: "item",
  entityKey: "k-test",
  userId: "user-1",
  payload: { item: { key: "k-test", url: "https://example.com/test", title: "Test" } },
};

test("pending mutation survives serialization/reload", () => {
  const pending = upsertEntry([], base, "2026-10-04T00:00:00.000Z");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].state, "pending");

  const afterReload = parseOutbox(JSON.stringify(pending));
  assert.equal(afterReload.length, 1);
  assert.equal(afterReload[0].payload.item.key, "k-test");
  assert.equal(entityState(afterReload, "item", "k-test"), "pending");
});

test("failed cloud write is visibly retained as not synced", () => {
  const pending = upsertEntry([], base, "2026-10-04T00:00:00.000Z");
  const failed = markEntryError(pending, base.id, new Error("network down"), "2026-10-04T00:00:01.000Z");
  assert.equal(failed[0].state, "error");
  assert.equal(failed[0].error, "network down");
  assert.equal(entityState(failed, "item", "k-test"), "error");

  const merged = mergeRemoteItems([], pendingItems(failed));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].key, "k-test");
  assert.equal(merged[0].__syncState, "error");
});

test("retry identity is idempotent and success clears the outbox", () => {
  const first = upsertEntry([], base, "2026-10-04T00:00:00.000Z");
  const failed = markEntryError(first, base.id, new Error("timeout"), "2026-10-04T00:00:01.000Z");
  const retryPending = upsertEntry(failed, { ...failed[0] }, "2026-10-04T00:00:02.000Z");
  assert.equal(retryPending.length, 1);
  assert.equal(retryPending[0].id, base.id);
  assert.equal(retryPending[0].state, "pending");

  const success = clearEntry(retryPending, base.id);
  assert.deepEqual(success, []);
});

test("remote truth and unsynced local item reconcile without duplicates", () => {
  const remote = [{ key: "remote", title: "Remote" }, { key: "k-test", title: "Old remote title" }];
  const failed = markEntryError(upsertEntry([], base), base.id, new Error("offline"));
  const merged = mergeRemoteItems(remote, pendingItems(failed));
  assert.equal(merged.length, 2);
  assert.equal(merged.find((x) => x.key === "k-test").title, "Test");
  assert.equal(merged.find((x) => x.key === "k-test").__syncState, "error");
});
