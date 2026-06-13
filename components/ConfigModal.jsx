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
    const sync = () => setIsMobile(window.innerWidth < 640);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    ref.current?.focus();
    const h = (e) => { if (e.key === "Escape" && savedId && !needsManualTabs) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, savedId, needsManualTabs]);

  const handleChange = (v) => {
    setVal(v);
    if (isPublishedExportUrl(v))      setWarning("published");
    else if (needsManualTabs)         setWarning("manual");
    else                              setWarning("");
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
    <>
      <div onClick={() => savedId && !needsManualTabs && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1098, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} />
      <div style={{
        position: "fixed",
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(94vw, 460px)", zIndex: 1099,
        background: T.bgRaised, borderRadius: 16,
        border: `1px solid ${T.border}`,
        padding: isMobile ? 22 : 28,
        fontFamily: "Inter, sans-serif",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text1, marginBottom: 4 }}>
          {needsManualTabs ? "Add tab names" : "Connect Google Sheet"}
        </div>
        <div style={{ fontSize: 12, color: T.text3, marginBottom: 18 }}>
          {needsManualTabs
            ? "We couldn't auto-detect your tabs. Type them comma-separated below."
            : "Paste the sheet URL or ID. Make sure the sheet is shared as Anyone with link can view."}
        </div>

        <input
          ref={ref}
          value={val}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          style={inputStyle(isMobile)}
        />

        {(needsManualTabs || warning === "manual") && (
          <input
            value={tabsInput}
            onChange={(e) => setTabsInput(e.target.value)}
            placeholder="Tab1, Tab2, Tab3"
            style={{ ...inputStyle(isMobile), marginTop: 8 }}
          />
        )}

        {warning === "published" && (
          <div style={warnBox}>
            That's a "Publish to web" URL. The vault needs the regular share URL, not the published one. In the sheet: Share, set to "Anyone with the link", copy that URL.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          {savedId && !needsManualTabs && (
            <button onClick={onClose} style={btnSecondary}>Cancel</button>
          )}
          <button onClick={handleSave} disabled={!canSave} style={{ ...btnPrimary, opacity: canSave ? 1 : 0.4, cursor: canSave ? "pointer" : "not-allowed", flex: 1 }}>
            {needsManualTabs ? "Load with these tabs" : savedId ? "Update" : "Connect"}
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: T.text4, lineHeight: 1.5 }}>
          Sheet columns: <b>url</b> (required), <b>title</b>, <b>note</b>, <b>tags</b>. Each tab becomes a category in the sidebar. Non-video URLs are skipped automatically.
        </div>
      </div>
    </>
  );
}

const inputStyle = (mobile) => ({
  width: "100%",
  padding: mobile ? "13px 14px" : "11px 13px",
  background: T.bgInput,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.text1,
  fontSize: mobile ? 16 : 13,
  outline: "none",
  fontFamily: "monospace",
  boxSizing: "border-box",
});

const btnPrimary = {
  padding: "11px 18px", background: "#fff", color: "#000",
  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
};

const btnSecondary = {
  padding: "11px 16px", background: "transparent",
  border: `1px solid ${T.border}`, color: T.text2,
  borderRadius: 8, fontSize: 13, cursor: "pointer",
};

const warnBox = {
  marginTop: 10,
  padding: "9px 12px",
  background: "rgba(251,191,36,0.06)",
  border: "1px solid rgba(251,191,36,0.18)",
  borderRadius: 8,
  fontSize: 12,
  color: "rgba(251,191,36,0.8)",
  lineHeight: 1.4,
};
