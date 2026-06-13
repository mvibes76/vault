"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { getYouTubeId, getVimeoId, getGDriveId, getInstagramShortcode, proxiedMediaUrl } from "@/lib/utils";
import { saveProgress } from "@/lib/supabase";

// Singleton: load the YT IFrame API script once per page
let ytApiLoaded = false;
let ytApiCallbacks = [];
function loadYTApi(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  ytApiCallbacks.push(cb);
  if (!ytApiLoaded) {
    ytApiLoaded = true;
    window.onYouTubeIframeAPIReady = () => { ytApiCallbacks.forEach((f) => f()); ytApiCallbacks = []; };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(s);
  }
}

export default function Embed({ item, items = [], currentIdx = 0, onNavigate, onClose, userId, resumeAt = 0, scraped }) {
  const { type, url } = item;
  const ytId  = type === "youtube" ? getYouTubeId(url) : null;
  const vimId = type === "vimeo"   ? getVimeoId(url)   : null;
  const gdId  = getGDriveId(url);

  const videoRef   = useRef(null);
  const ytPlayer   = useRef(null);
  const ytDiv      = useRef(null);
  const lastSave   = useRef(0);
  const touchStart = useRef(null);

  const [muted,      setMuted]      = useState(false);
  const [audioMode,  setAudioMode]  = useState(false);
  const [isPiP,      setIsPiP]      = useState(false);
  const [galleryIdx, setGalleryIdx] = useState(0);

  const touchStartY = useRef(null);
  const touchStartX = useRef(null);

  const directVideo =
    type === "video"   ? url :
    scraped?.video     ? scraped.video : null;

  const hasNext = currentIdx < items.length - 1;
  const hasPrev = currentIdx > 0;

  // Keyboard + scroll lock
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight" && hasNext) onNavigate?.(currentIdx + 1);
      if (e.key === "ArrowLeft"  && hasPrev) onNavigate?.(currentIdx - 1);
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext, hasPrev, currentIdx]);

  // Resume direct video
  useEffect(() => {
    if (videoRef.current && resumeAt > 2) videoRef.current.currentTime = resumeAt;
  }, [resumeAt]);

  // YouTube IFrame API
  useEffect(() => {
    if (!ytId) return;
    const playerId = `yt-${ytId}-${Date.now()}`;
    if (ytDiv.current) ytDiv.current.id = playerId;

    loadYTApi(() => {
      if (!ytDiv.current) return;
      ytDiv.current.id = playerId;
      ytPlayer.current = new window.YT.Player(playerId, {
        videoId: ytId,
        playerVars: { autoplay: 1, mute: muted ? 1 : 0, start: resumeAt > 2 ? Math.floor(resumeAt) : 0, rel: 0 },
        events: { onReady: (e) => { ytPlayer.current = e.target; } },
      });
    });

    return () => {
      try {
        const p = ytPlayer.current;
        if (p && userId) {
          const t = p.getCurrentTime?.();
          const d = p.getDuration?.();
          if (t > 2) saveProgress(userId, item.key, t, d || 0);
        }
        p?.destroy?.();
      } catch {}
      ytPlayer.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId]);

  const handleClose = useCallback(() => {
    const v = videoRef.current;
    if (v && userId) saveProgress(userId, item.key, v.currentTime, v.duration || 0);
    onClose();
  }, [userId, item.key, onClose]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !userId) return;
    const now = Date.now();
    if (now - lastSave.current > 5000) {
      lastSave.current = now;
      saveProgress(userId, item.key, v.currentTime, v.duration || 0);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (v) { v.muted = !v.muted; setMuted(v.muted); }
    else setMuted((m) => !m);
  };

  // Swipe: horizontal = navigate, vertical = close
  const onTouchStart = (e) => {
    touchStart.current  = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = touchStartX.current - endX;
    const dy = touchStartY.current - endY;
    touchStart.current = touchStartX.current = touchStartY.current = null;
    if (dy < -70 && Math.abs(dy) > Math.abs(dx) * 1.5) { handleClose(); return; }
    if (Math.abs(dx) < 60) return;
    if (dx > 0 && hasNext) onNavigate?.(currentIdx + 1);
    if (dx < 0 && hasPrev) onNavigate?.(currentIdx - 1);
  };

  // Picture-in-Picture
  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture(); setIsPiP(false);
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture(); setIsPiP(true);
      }
    } catch {}
  };
  const pipSupported = typeof document !== "undefined" && "pictureInPictureEnabled" in document;

  const renderContent = () => {

    // ── YouTube ─────────────────────────────────────────────────────────────
    if (type === "youtube" && ytId) {
      return (
        <div style={isWide ? { width: "78vw", aspectRatio: "16/9" } : {}}>
          <div ref={ytDiv} style={{ width: "100%", height: "100%", minHeight: 200 }} />
        </div>
      );
    }

    // ── Vimeo ────────────────────────────────────────────────────────────────
    if (type === "vimeo" && vimId) {
      return (
        <div style={{ width: "78vw", aspectRatio: "16/9" }}>
          <iframe
            src={`https://player.vimeo.com/video/${vimId}?autoplay=1${muted ? "&muted=1" : ""}`}
            allow="autoplay; fullscreen"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      );
    }

    // ── Google Drive ─────────────────────────────────────────────────────────
    if (gdId && url.includes("drive.google.com")) {
      return (
        <div style={driveFrameWrap}>
          <iframe
            src={`https://drive.google.com/file/d/${gdId}/preview`}
            title={item.title || "Drive preview"}
            style={frameStyle}
            allow="autoplay; fullscreen"
          />
        </div>
      );
    }

    // ── Instagram ────────────────────────────────────────────────────────────
    // Server scraping is blocked — use Instagram's public embed endpoint instead.
    if (type === "instagram") {
      const shortcode = getInstagramShortcode(url);
      const embedSrc  = shortcode
        ? `https://www.instagram.com/p/${shortcode}/embed/`
        : scraped?.embed;
      if (embedSrc) {
        return (
          <div style={{ width: "min(90vw,480px)", height: "min(86vh,600px)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            <iframe
              src={embedSrc}
              style={{ width: "100%", height: "100%", border: "none" }}
              allow="encrypted-media"
              scrolling="no"
            />
          </div>
        );
      }
    }

    // ── TikTok ───────────────────────────────────────────────────────────────
    if (type === "tiktok" && scraped?.embed) {
      return (
        <div style={{ width: "min(90vw,380px)", height: "min(86vh,700px)", borderRadius: 12, overflow: "hidden", background: "#000" }}>
          <iframe
            src={scraped.embed}
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="encrypted-media"
            scrolling="no"
          />
        </div>
      );
    }

    // ── Gallery ───────────────────────────────────────────────────────────────
    // Triggered when type === "gallery" OR scrape returns 3+ images for any link/image
    const galleryImages = scraped?.images?.length >= 3 ? scraped.images : null;
    if (galleryImages && ["gallery","link","image"].includes(type)) {
      const gTotal   = galleryImages.length;
      const gCurrent = galleryImages[galleryIdx];
      return (
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: "94vw" }}>
          {/* Main image */}
          <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#111" }}>
            <img
              src={proxiedMediaUrl(gCurrent)}
              alt={`${item.title} ${galleryIdx + 1}`}
              style={{ maxWidth: "90vw", maxHeight: "68vh", objectFit: "contain", display: "block" }}
              onError={(e) => { e.currentTarget.style.opacity = "0.2"; }}
            />
            {galleryIdx > 0 && (
              <button onClick={() => setGalleryIdx(galleryIdx - 1)} style={galleryArrow("left")}>
                <Icon name="chevronLeft" size={18} />
              </button>
            )}
            {galleryIdx < gTotal - 1 && (
              <button onClick={() => setGalleryIdx(galleryIdx + 1)} style={galleryArrow("right")}>
                <Icon name="chevronRight" size={18} />
              </button>
            )}
            <div style={{ position: "absolute", bottom: 8, right: 10, fontSize: 11, color: "rgba(255,255,255,0.6)", background: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 20, backdropFilter: "blur(6px)" }}>
              {galleryIdx + 1} / {gTotal}
            </div>
          </div>
          {/* Thumbnail strip */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", maxWidth: "90vw", paddingBottom: 4, scrollbarWidth: "none" }}>
            {galleryImages.slice(0, 20).map((img, i) => (
              <div key={i} onClick={() => setGalleryIdx(i)} style={{
                width: 48, height: 48, flexShrink: 0, borderRadius: 6, overflow: "hidden", cursor: "pointer",
                border: i === galleryIdx ? "2px solid #fff" : "2px solid transparent",
                opacity: i === galleryIdx ? 1 : 0.45, transition: "opacity 0.15s, border-color 0.15s"
              }}>
                <img src={proxiedMediaUrl(img)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
          {/* Title + link */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, color: T.text3, marginBottom: 6 }}>{scraped?.title || item.title}</div>
            <a href={url} target="_blank" rel="noreferrer" style={{ color: T.text4, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
              Open site <Icon name="external" size={12} />
            </a>
          </div>
        </div>
      );
    }

    // ── Image ────────────────────────────────────────────────────────────────
    if (type === "image") {
      return (
        <img
          src={proxiedMediaUrl(url)} alt={item.title}
          style={{ maxWidth: "90vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8, display: "block" }}
        />
      );
    }

    // ── Direct video / audio ─────────────────────────────────────────────────
    if (directVideo) {
      return (
        <div style={{ position: "relative" }}>
          <video
            ref={videoRef}
            src={directVideo}
            controls autoPlay playsInline
            muted={muted}
            onTimeUpdate={handleTimeUpdate}
            style={{
              maxWidth: "90vw", maxHeight: "86vh", borderRadius: 8, display: "block",
              ...(audioMode ? { height: 0, maxHeight: 0 } : {})
            }}
          />
          {audioMode && (
            <div style={{ padding: "32px 24px", textAlign: "center", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", minWidth: 280 }}>
              <Icon name="audioLines" size={48} style={{ color: "rgba(235,235,245,0.4)", marginBottom: 16 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: "#555" }}>Audio only mode</div>
            </div>
          )}
        </div>
      );
    }

    // ── Scraped image fallback ────────────────────────────────────────────────
    if (scraped?.image) {
      return (
        <div style={{ textAlign: "center" }}>
          <img
            src={proxiedMediaUrl(scraped.image)} alt={item.title}
            style={{ maxWidth: "80vw", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
          />
          <div style={{ marginTop: 16 }}>
            <a href={url} target="_blank" rel="noreferrer" style={{ color: T.text3, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
              Open original page <Icon name="external" size={13} />
            </a>
          </div>
        </div>
      );
    }

    // ── External link card ───────────────────────────────────────────────────
    return (
      <div style={{ textAlign: "center", padding: "32px 24px", maxWidth: 320 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Icon name="external" size={20} style={{ color: "rgba(235,235,245,0.45)" }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#f5f5f7", marginBottom: 6, lineHeight: 1.3 }}>{item.title || "External link"}</div>
        <div style={{ fontSize: 11, color: "rgba(235,235,245,0.3)", marginBottom: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</div>
        <a href={url} target="_blank" rel="noreferrer" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "9px 18px", background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20,
          color: "#f5f5f7", fontSize: 13, fontWeight: 500, textDecoration: "none"
        }}>
          Open <Icon name="external" size={12} />
        </a>
      </div>
    );
  };

  const isWide = ["youtube","vimeo","gdrive"].includes(type);
  const showMute = !!directVideo || type === "youtube" || type === "vimeo";
  const canAudioMode = !!directVideo;

  return (
    <div
      onClick={handleClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "rgba(0,0,0,0.95)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(12px)"
      }}
    >
      {/* Top controls */}
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1001, display: "flex", gap: 8 }}>
        {canAudioMode && pipSupported && (
          <button onClick={(e) => { e.stopPropagation(); togglePiP(); }} style={{ ...ctrlBtn, background: isPiP ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)" }} title="Picture in Picture">
            <Icon name="pip" size={15} />
          </button>
        )}
        {canAudioMode && (
          <button onClick={(e) => { e.stopPropagation(); setAudioMode((m) => !m); }} style={{ ...ctrlBtn, background: audioMode ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)" }} title="Audio only">
            <Icon name="headphones" size={15} />
          </button>
        )}
        {showMute && (
          <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} style={ctrlBtn} title={muted ? "Unmute" : "Mute"}>
            <Icon name={muted ? "volumeOff" : "volume"} size={15} />
          </button>
        )}
        <button onClick={handleClose} style={ctrlBtn}><Icon name="x" size={15} /></button>
      </div>

      {/* Nav arrows */}
      {hasPrev && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate?.(currentIdx - 1); }} style={{ ...arrowBtn, left: 12 }}>
          <Icon name="chevronLeft" size={22} />
        </button>
      )}
      {hasNext && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate?.(currentIdx + 1); }} style={{ ...arrowBtn, right: 12 }}>
          <Icon name="chevronRight" size={22} />
        </button>
      )}

      <div onClick={(e) => e.stopPropagation()}>
        {renderContent()}
      </div>
    </div>
  );
}

const galleryArrow = (side) => ({
  position: "absolute", top: "50%", transform: "translateY(-50%)",
  [side]: 8,
  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
  border: "none", color: "#fff", cursor: "pointer",
  borderRadius: "50%", width: 36, height: 36,
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
});

const driveFrameWrap = {
  width: "min(94vw,1100px)",
  height: "min(86vh,720px)",
  background: "#fff", borderRadius: 8, overflow: "hidden"
};

const frameStyle = {
  width: "100%", height: "100%", border: "none", borderRadius: 8, background: "#fff", display: "block"
};

const ctrlBtn = {
  background: "rgba(255,255,255,0.07)", border: "none",
  color: "#f5f5f7", cursor: "pointer", borderRadius: "50%",
  width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
  backdropFilter: "blur(12px)"
};

const arrowBtn = {
  position: "absolute", top: "50%", transform: "translateY(-50%)",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
  color: "#f5f5f7", cursor: "pointer", borderRadius: "50%",
  width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1001, backdropFilter: "blur(16px)"
};
