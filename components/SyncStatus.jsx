"use client";
import { useEffect, useState } from "react";
import { T } from "@/lib/theme";
import { SYNC_V2_ENABLED, readOutbox, subscribeOutbox, clearMutation } from "@/lib/sync-outbox";
import { retryPendingMutation } from "@/lib/supabase";

export default function SyncStatus({ userId, onSynced }) {
  const [entries, setEntries] = useState([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!SYNC_V2_ENABLED) return;
    const refresh = () => setEntries(readOutbox());
    refresh();
    return subscribeOutbox(refresh);
  }, []);

  if (!SYNC_V2_ENABLED || !entries.length) return null;

  const failed = entries.filter((e) => e.state === "error");
  const pending = entries.filter((e) => e.state === "pending");

  const retry = async () => {
    if (!userId || retrying) return;
    setRetrying(true);
    try {
      for (const entry of readOutbox()) {
        try { await retryPendingMutation(userId, entry); } catch {}
      }
      await onSynced?.();
    } finally {
      setRetrying(false);
    }
  };

  const discardFailed = () => {
    failed.forEach((entry) => clearMutation(entry.id));
  };

  const hasError = failed.length > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky", top: 0, zIndex: 220,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "9px 14px",
        background: hasError ? "rgba(120,35,35,0.96)" : "rgba(95,70,15,0.96)",
        borderBottom: `1px solid ${hasError ? "rgba(255,120,120,0.28)" : "rgba(255,210,90,0.22)"}`,
        color: T.text1, fontSize: 12,
      }}
    >
      <div>
        <strong>{hasError ? "Not synced" : "Syncing"}</strong>
        <span style={{ marginLeft: 8, opacity: 0.72 }}>
          {hasError ? `${failed.length} change${failed.length === 1 ? "" : "s"} need retry` : `${pending.length} change${pending.length === 1 ? "" : "s"} pending`}
        </span>
      </div>
      {hasError && (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={retry} disabled={retrying} style={buttonStyle}>{retrying ? "Retrying…" : "Retry"}</button>
          <button onClick={discardFailed} style={buttonStyle}>Discard local</button>
        </div>
      )}
    </div>
  );
}

const buttonStyle = {
  minHeight: 32, padding: "6px 10px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)",
  color: "inherit", cursor: "pointer", fontSize: 12, fontWeight: 700,
};
