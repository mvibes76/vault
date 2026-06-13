"use client";
import { useState, useEffect, useRef } from "react";
import { extractSheetId } from "@/lib/utils";
import { T } from "@/lib/theme";

const isPublishedExportUrl = (val) =>
  /\/spreadsheets\/d\/e\//.test(val) || val.includes("pubhtml") || val.includes("pub?");

export default function ConfigModal({ onSave, onClose, savedId, needsManualTabs }) {
  const [val, setVal] = useState(savedId || "");
  const [tabsInput, setTabsInput] = useState("");
  const [warning, setWarning] = useState(needsManualTabs ? "manual" : "");
  const ref = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const syncViewport = () => setIsMobile(window.innerWidth < 640);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    ref.current?.focus();
    const h = (e) => { if (e.key === "Escape" && savedId && !needsManualTabs) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, savedId, needsManualTabs]);

  const handleChange = (v) => {
    setVal(v);
    if (isPublishedExportUrl(v)) {
      setWarning("published");
    } else if (needsManualTabs) {
      setWarning("manual");
    } else {
      setWarning("");
    }
  };

  const handleSave = () => {
    if (!val.trim() || isPublishedExportUrl(val)) return;
    const manualTabs = tabsInput.trim()
      ? tabsInput.split(",").map((t) => t.trim()).filter(Boolean)
      : null;
    onSave(extractSheetId(val), manualTabs);
  };

  const canSave = val.trim() && !isPublishedExportUrl(val);

  return (
    <div
      onClick={() => savedId && !needsManualTabs && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
        padding: isMobile ? "12px" : 0
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0d0d0d", borderRadius: isMobile ? 18 : 16,
          border: "1px solid rgba(255,255,255,0.07)",
          padding: isMobile ? 22 : 28, width: 520, maxWidth: "100%",
          maxHeight: isMobile ? "calc(100dvh - 24px)" : "90vh", overflowY: "auto",
          boxShadow: "0 20px 70px rgba(0,0,0,0.8)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="rgba(255,255,255,0.2)"/>
            <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.5"/>
            <line x1="3" y1="15" x2="21" y2="15" stroke="white" strokeWidth="1.5"/>
            <line x1="9" y1="3" x2="9" y2="21" stroke="white" strokeWidth="1.5"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 17, fontWeight: 600, color: "#f5f5f7" }}>
            {needsManualTabs ? "Enter Your Tab Names" : "Connect Google Sheet"}
          </h2>
        </div>

        {needsManualTabs ? (
          <p style={{ margin: "0 0 20px", color: "#f59e0b", fontSize: 13, lineHeight: 1.6 }}>
            Tab names could not be detected automatically. Type them below exactly as they appear in your sheet.
          </p>
        ) : (
          <p style={{ margin: "0 0 20px", color: "rgba(235,235,245,0.35)", fontSize: 13, lineHeight: 1.6 }}>
            Each tab = one collection. Tab name is the collection name.
          </p>
        )}

        {!needsManualTabs && (
          <div style={{
            background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 16,
            marginBottom: 20, border: "1px solid rgba(255,255,255,0.06)"
          }}>
            <div style={{ fontSize: 10, color: "rgba(235,235,245,0.3)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 10 }}>
              SHEET SETUP
            </div>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 2 }}>
              1. Row 1 of every tab:{" "}
              {["url", "title", "note"].map((h) => (
                <span key={h} style={{
                  fontFamily: "monospace", color: "#aaa", background: "#1a1a1a",
                  padding: "1px 7px", borderRadius: 4, marginRight: 4
                }}>{h}</span>
              ))}<br />
              2. Share → <b style={{ color: "#ccc" }}>Anyone with the link can view</b>
            </div>
          </div>
        )}

        <label style={{ display: "block", fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1, marginBottom: 7 }}>
          SHEET URL
        </label>
        <input
          ref={ref}
          value={val}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          style={{
            width: "100%", padding: isMobile ? "14px 14px" : "12px 14px",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${warning === "published" ? "rgba(255,150,0,0.4)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 8, color: "#fff", fontSize: isMobile ? 16 : 13,
            outline: "none", boxSizing: "border-box",
            fontFamily: "monospace", marginBottom: 16
          }}
        />

        {warning === "published" && (
          <div style={{
            fontSize: 12, color: "#f59e0b", marginBottom: 16,
            background: "rgba(245,158,11,0.08)", borderRadius: 6,
            padding: "8px 12px", border: "1px solid rgba(245,158,11,0.2)"
          }}>
            That is the published export URL. Open your sheet and copy the URL from the address bar (ends in /edit).
          </div>
        )}

        {/* Manual tab names — always show so user can help if auto-detect fails */}
        <label style={{ display: "block", fontSize: 10, color: needsManualTabs ? "#f59e0b" : "#444", fontWeight: 700, letterSpacing: 1, marginBottom: 7 }}>
          TAB NAMES {needsManualTabs ? "(REQUIRED)" : "(OPTIONAL — only needed if auto-detect fails)"}
        </label>
        <input
          value={tabsInput}
          onChange={(e) => setTabsInput(e.target.value)}
          placeholder="Star Wars, Cars, Funny Videos, ..."
          style={{
            width: "100%", padding: isMobile ? "14px 14px" : "10px 14px",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${needsManualTabs ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 8, color: "#fff", fontSize: isMobile ? 16 : 13,
            outline: "none", boxSizing: "border-box",
            marginBottom: 20
          }}
        />

        <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
          <button
            onClick={handleSave}
            disabled={!canSave || (needsManualTabs && !tabsInput.trim())}
            style={{
              flex: 1, padding: isMobile ? 14 : 12,
              background: (canSave && (!needsManualTabs || tabsInput.trim())) ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              color: (canSave && (!needsManualTabs || tabsInput.trim())) ? "#f5f5f7" : "rgba(235,235,245,0.2)",
              border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              cursor: (canSave && (!needsManualTabs || tabsInput.trim())) ? "pointer" : "not-allowed"
            }}
          >
            Load Collections
          </button>
          {savedId && !needsManualTabs && (
            <button
              onClick={onClose}
              style={{
                padding: isMobile ? 14 : "12px 18px", background: "transparent",
                color: "#555", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, fontSize: 13, cursor: "pointer"
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
