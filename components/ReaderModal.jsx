"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { saveProgress } from "@/lib/supabase";

const VIEWER_BASE = "https://docs.google.com/viewer?embedded=true&url=";

// Determine the best viewer strategy for a given type/url
function getReaderConfig(item) {
  const { type, url } = item;
  if (type === "pdf") {
    // Try native browser PDF first; fall back to Google Docs viewer
    return { strategy: "pdf-native", embedUrl: url };
  }
  // epub, doc, docx — Google Docs Viewer handles all of these
  return { strategy: "gdocs", embedUrl: `${VIEWER_BASE}${encodeURIComponent(url)}` };
}

export default function ReaderModal({ item, items = [], currentIdx = 0, onNavigate, onClose, userId, resumeAt = 0 }) {
  const { strategy, embedUrl } = getReaderConfig(item);

  const [page, setPage] = useState(Math.max(1, Math.round(resumeAt) || 1));
  const [totalPages, setTotalPages] = useState(0);
  const [audioMode, setAudioMode] = useState(false);
  const [iframeKey, setIframeKey] = useState(0); // force iframe remount on nav
  const [showNav, setShowNav] = useState(true);
  const hideNavTimer = useRef(null);
  const saveTimer = useRef(0);

  // Touch swipe state
  const touchStart = useRef(null);

  const hasNext = currentIdx < items.length - 1;
  const hasPrev = currentIdx > 0;

  // Save position periodically
  const doSave = useCallback(() => {
    if (!userId || !item) return;
    const now = Date.now();
    if (now - saveTimer.current > 4000) {
      saveTimer.current = now;
      saveProgress(userId, item.key, page, totalPages || 0);
    }
  }, [userId, item, page, totalPages]);

  useEffect(() => {
    doSave();
  }, [page, doSave]);

  // Save on close
  useEffect(() => {
    return () => {
      if (userId && item) {
        saveProgress(userId, item.key, page, totalPages || 0);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard nav
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && hasNext) onNavigate(currentIdx + 1);
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(currentIdx - 1);
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose, onNavigate, currentIdx, hasNext, hasPrev]);

  // Auto-hide nav bar
  const resetHideTimer = () => {
    setShowNav(true);
    clearTimeout(hideNavTimer.current);
    hideNavTimer.current = setTimeout(() => setShowNav(false), 3000);
  };

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideNavTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const touchStartY2 = useRef(null);
  // Touch swipe handlers
  const onTouchStart = (e) => {
    touchStart.current  = e.touches[0].clientX;
    touchStartY2.current = e.touches[0].clientY;
    resetHideTimer();
  };
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const dx = touchStart.current - e.changedTouches[0].clientX;
    const dy = (touchStartY2.current || 0) - e.changedTouches[0].clientY;
    touchStart.current = touchStartY2.current = null;
    // Swipe down to close
    if (dy < -70 && Math.abs(dy) > Math.abs(dx) * 1.5) { onClose(); return; }
    if (Math.abs(dx) < 50) return;
    if (dx > 0 && hasNext) onNavigate(currentIdx + 1);
    if (dx < 0 && hasPrev) onNavigate(currentIdx - 1);
  };

  const typeLabel = { pdf: "PDF", epub: "eBook", doc: "Document" };

  // For PDF native, build the URL with page hash
  const pdfSrc = strategy === "pdf-native"
    ? `${item.url}#page=${page}&toolbar=1&view=FitH`
    : null;

  return (
    <div
      onClick={resetHideTimer}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "#000000",
        display: "flex", flexDirection: "column",
        fontFamily: "Inter, -apple-system, sans-serif"
      }}
    >
      {/* Top bar — auto-hides */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
        padding: "14px 16px 30px",
        display: "flex", alignItems: "center", gap: 10,
        opacity: showNav ? 1 : 0, transition: "opacity 0.3s",
        pointerEvents: showNav ? "auto" : "none"
      }}>
        <button onClick={onClose} style={topBtn}><Icon name="x" size={16} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title}
          </div>
          <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{typeLabel[item.type] || item.type}</div>
        </div>

        {/* Prev/next document */}
        {items.length > 1 && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => hasPrev && onNavigate(currentIdx - 1)} disabled={!hasPrev} style={{ ...topBtn, opacity: hasPrev ? 1 : 0.3 }}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <span style={{ fontSize: 11, color: "#555", alignSelf: "center" }}>{currentIdx + 1}/{items.length}</span>
            <button onClick={() => hasNext && onNavigate(currentIdx + 1)} disabled={!hasNext} style={{ ...topBtn, opacity: hasNext ? 1 : 0.3 }}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Document viewer */}
      <iframe
        key={`${item.url}-${iframeKey}`}
        src={pdfSrc || embedUrl}
        title={item.title}
        style={{ flex: 1, border: "none", background: "#fff" }}
        allow="autoplay"
      />

      {/* Bottom bar — page nav, auto-hides */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
        background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
        padding: "30px 16px 16px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        opacity: showNav ? 1 : 0, transition: "opacity 0.3s",
        pointerEvents: showNav ? "auto" : "none"
      }}>
        {/* Page tracker — manual since we can't read iframe scroll */}
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} style={bottomBtn}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#888" }}>Page</span>
          <input
            type="number" min="1" value={page}
            onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
            style={{
              width: 48, padding: "4px 6px", background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
              color: "#fff", fontSize: 12, textAlign: "center", outline: "none"
            }}
          />
          {totalPages > 0 && <span style={{ fontSize: 11, color: "#555" }}>/ {totalPages}</span>}
        </div>
        <button onClick={() => setPage((p) => p + 1)} style={bottomBtn}>
          <Icon name="chevronRight" size={16} />
        </button>
        {resumeAt > 1 && page !== Math.round(resumeAt) && (
          <button
            onClick={() => { setPage(Math.round(resumeAt)); setIframeKey((k) => k + 1); }}
            style={{ ...bottomBtn, fontSize: 10, padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.07)", color: "rgba(235,235,245,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Resume p.{Math.round(resumeAt)}
          </button>
        )}
      </div>
    </div>
  );
}

const topBtn = {
  background: "rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", border: "none",
  color: "#f5f5f7", cursor: "pointer", borderRadius: "50%", width: 34, height: 34,
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
};

const bottomBtn = {
  background: "rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", border: "none",
  color: "#f5f5f7", cursor: "pointer", borderRadius: 8, width: 32, height: 32,
  display: "flex", alignItems: "center", justifyContent: "center"
};
