"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { getEmbed } from "@/lib/sources";
import { saveProgress } from "@/lib/supabase";

// ─── YouTube IFrame API loader (one-time, page-wide) ─────────────────────────
let ytApiLoaded = false;
let ytApiQueue = [];
function loadYTApi(cb) {
  if (typeof window === "undefined") return;
  if (window.YT && window.YT.Player) { cb(); return; }
  ytApiQueue.push(cb);
  if (!ytApiLoaded) {
    ytApiLoaded = true;
    window.onYouTubeIframeAPIReady = () => { ytApiQueue.forEach((f) => f()); ytApiQueue = []; };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(s);
  }
}

// ─── Twitter widgets.js loader ──────────────────────────────────────────────
let twLoaded = false;
let twQueue = [];
function loadTwitterWidgets(cb) {
  if (typeof window === "undefined") return;
  if (window.twttr?.widgets) { cb(window.twttr); return; }
  twQueue.push(cb);
  if (!twLoaded) {
    twLoaded = true;
    const s = document.createElement("script");
    s.src = "https://platform.twitter.com/widgets.js";
    s.async = true;
    s.charset = "utf-8";
    s.onload = () => {
      const t = setInterval(() => {
        if (window.twttr?.widgets) { clearInterval(t); twQueue.forEach((f) => f(window.twttr)); twQueue = []; }
      }, 50);
    };
    document.body.appendChild(s);
  }
}

// ─── Main Player ────────────────────────────────────────────────────────────

export default function Player({ item, items = [], currentIdx = 0, onNavigate, onClose, userId, resumeAt = 0 }) {
  const [muted, setMuted]   = useState(false);
  const [isPiP, setIsPiP]   = useState(false);
  const [parent, setParent] = useState("localhost");

  // Extraction state (used when source.id === "extract")
  const [extracted, setExtracted] = useState(null); // { url, type, resolution } | null
  const [extractErr, setExtractErr] = useState("");
  const [extracting, setExtracting] = useState(false);

  // Set Twitch parent param from current hostname (required by Twitch embeds)
  useEffect(() => {
    if (typeof window !== "undefined") setParent(window.location.hostname || "localhost");
  }, []);

  const baseEmbed = getEmbed(item.url, { muted, parent });

  // When the source is the catch-all "extract", call /api/extract and
  // synthesize a video/hls embed from whatever it returns.
  useEffect(() => {
    if (baseEmbed?.kind !== "extract") return;
    let cancelled = false;
    setExtracted(null); setExtractErr(""); setExtracting(true);
    fetch(`/api/extract?url=${encodeURIComponent(item.url)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok || !j.sources?.length) {
          setExtractErr(j.error || "Could not find a video on that page.");
        } else {
          // sources arrive sorted by resolution desc; pick highest
          setExtracted(j.sources[0]);
        }
      })
      .catch((e) => { if (!cancelled) setExtractErr(e.message || "Extraction failed."); })
      .finally(() => { if (!cancelled) setExtracting(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url, baseEmbed?.kind]);

  // Effective embed: extraction result overrides "extract" placeholder
  const embed = (() => {
    if (baseEmbed?.kind !== "extract") return baseEmbed;
    if (!extracted) return baseEmbed; // still loading or errored
    const isHls = /\.(m3u8)(\?|$)/i.test(extracted.url) ||
                  /mpegurl/i.test(extracted.type || "");
    return isHls
      ? { kind: "hls",   src: extracted.url, source: baseEmbed.source }
      : { kind: "video", src: extracted.url, source: baseEmbed.source };
  })();

  const hasNext = currentIdx < items.length - 1;
  const hasPrev = currentIdx > 0;

  const videoRef = useRef(null);
  const ytPlayer = useRef(null);
  const ytSlot   = useRef(null);
  const twSlot   = useRef(null);
  const hlsRef   = useRef(null);
  const lastSave = useRef(0);
  const touch    = useRef({ x: null, y: null });

  // ── Keyboard + scroll lock ──────────────────────────────────────────────
  const handleClose = useCallback(() => {
    const v = videoRef.current;
    if (v && userId) saveProgress(userId, item.key, v.currentTime || 0, v.duration || 0);
    onClose();
  }, [userId, item.key, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape")    handleClose();
      if (e.key === "ArrowRight" && hasNext) onNavigate?.(currentIdx + 1);
      if (e.key === "ArrowLeft"  && hasPrev) onNavigate?.(currentIdx - 1);
      if (e.key === " ")         { const v = videoRef.current; if (v) { e.preventDefault(); v.paused ? v.play() : v.pause(); } }
      if (e.key === "m" || e.key === "M") setMuted((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [hasNext, hasPrev, currentIdx, onNavigate, handleClose]);

  // ── YouTube IFrame setup + progress save on unmount ─────────────────────
  useEffect(() => {
    if (embed?.kind !== "youtube-api") return;
    const id = `yt-${embed.ytId}-${Date.now()}`;
    if (ytSlot.current) ytSlot.current.id = id;

    loadYTApi(() => {
      if (!ytSlot.current) return;
      ytSlot.current.id = id;
      ytPlayer.current = new window.YT.Player(id, {
        videoId: embed.ytId,
        playerVars: {
          autoplay: 1,
          mute: muted ? 1 : 0,
          start: resumeAt > 2 ? Math.floor(resumeAt) : 0,
          rel: 0, modestbranding: 1, playsinline: 1,
        },
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
  }, [embed?.ytId]);

  // ── Twitter widget rendering ────────────────────────────────────────────
  useEffect(() => {
    if (embed?.kind !== "twitter-widget") return;
    loadTwitterWidgets((twttr) => {
      if (twSlot.current) twttr.widgets.load(twSlot.current);
    });
  }, [embed?.kind, embed?.tweetId]);

  // ── HLS playback (dynamic import so non-HLS pages skip the bundle) ──────
  useEffect(() => {
    if (embed?.kind !== "hls") return;
    const v = videoRef.current;
    if (!v) return;

    // Native HLS (Safari + iOS): just set src
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = embed.src;
      if (resumeAt > 2) v.currentTime = resumeAt;
      v.play().catch(() => {});
      return;
    }

    // Everyone else: load hls.js
    let destroyed = false;
    (async () => {
      const Hls = (await import("hls.js")).default;
      if (destroyed) return;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(embed.src);
        hls.attachMedia(v);
        if (resumeAt > 2) v.currentTime = resumeAt;
        v.play().catch(() => {});
      }
    })();
    return () => {
      destroyed = true;
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed?.src]);

  // ── Direct video resume ─────────────────────────────────────────────────
  useEffect(() => {
    if (embed?.kind === "video" && videoRef.current && resumeAt > 2) {
      videoRef.current.currentTime = resumeAt;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed?.src]);

  // ── Periodic progress save for direct/HLS video ────────────────────────
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !userId) return;
    const now = Date.now();
    if (now - lastSave.current > 5000) {
      lastSave.current = now;
      saveProgress(userId, item.key, v.currentTime, v.duration || 0);
    }
  };

  // ── Picture-in-Picture (direct/HLS only) ────────────────────────────────
  const pipSupported = typeof document !== "undefined" && "pictureInPictureEnabled" in document;
  const canPip = (embed?.kind === "video" || embed?.kind === "hls") && pipSupported;
  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); setIsPiP(false); }
      else if (videoRef.current) { await videoRef.current.requestPictureInPicture(); setIsPiP(true); }
    } catch {}
  };

  // ── Mute (best-effort across embed types) ───────────────────────────────
  const canMute = embed?.kind === "video" || embed?.kind === "hls" || embed?.kind === "youtube-api";
  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      const v = videoRef.current;
      if (v) v.muted = next;
      const yt = ytPlayer.current;
      if (yt?.mute && yt?.unMute) { next ? yt.mute() : yt.unMute(); }
      return next;
    });
  };

  // ── Swipe: horizontal = navigate, vertical-up = close ───────────────────
  const onTouchStart = (e) => { touch.current.x = e.touches[0].clientX; touch.current.y = e.touches[0].clientY; };
  const onTouchEnd = (e) => {
    if (touch.current.x == null) return;
    const dx = touch.current.x - e.changedTouches[0].clientX;
    const dy = touch.current.y - e.changedTouches[0].clientY;
    touch.current.x = touch.current.y = null;
    if (dy < -70 && Math.abs(dy) > Math.abs(dx) * 1.5) { handleClose(); return; }
    if (Math.abs(dx) < 60) return;
    if (dx > 0 && hasNext) onNavigate?.(currentIdx + 1);
    if (dx < 0 && hasPrev) onNavigate?.(currentIdx - 1);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const renderStage = () => {
    if (!embed) {
      return (
        <div style={{ textAlign: "center", padding: "32px 24px", maxWidth: 320 }}>
          <Icon name="alert" size={28} style={{ color: T.text3, marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: T.text2, marginBottom: 6 }}>This URL can't be played inside the vault.</div>
          <div style={{ fontSize: 11, color: T.text4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.url}</div>
        </div>
      );
    }

    if (embed.kind === "extract") {
      if (extracting) {
        return (
          <div style={{ textAlign: "center", padding: "60px 30px" }}>
            <div style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 13, color: T.text2 }}>Looking for a video on that page...</div>
          </div>
        );
      }
      return (
        <div style={{ textAlign: "center", padding: "32px 24px", maxWidth: 360 }}>
          <Icon name="alert" size={28} style={{ color: T.text3, marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: T.text2, marginBottom: 8 }}>{extractErr || "Couldn't find a playable video."}</div>
          <div style={{ fontSize: 11, color: T.text4, marginBottom: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.url}</div>
          <a href={item.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(255,255,255,0.08)", border: `1px solid ${T.border}`, borderRadius: 20, color: T.text1, fontSize: 12, textDecoration: "none" }}>
            Open original <Icon name="external" size={12} />
          </a>
        </div>
      );
    }

    if (embed.kind === "youtube-api") {
      return (
        <div style={stageWide}>
          <div ref={ytSlot} style={frameInner} />
        </div>
      );
    }

    if (embed.kind === "iframe") {
      const wrap = embed.portrait ? stagePortrait : stageWide;
      return (
        <div style={wrap}>
          <iframe
            src={embed.src}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
            allowFullScreen
            scrolling="no"
            style={frameInner}
          />
        </div>
      );
    }

    if (embed.kind === "twitter-widget") {
      return (
        <div style={{ width: "min(90vw, 560px)", maxHeight: "86vh", overflow: "auto", background: "#fff", borderRadius: 10, padding: 12 }}>
          <div ref={twSlot}>
            <blockquote className="twitter-tweet" data-theme="dark">
              <a href={item.url}></a>
            </blockquote>
          </div>
        </div>
      );
    }

    if (embed.kind === "video") {
      return (
        <video
          ref={videoRef}
          src={embed.src}
          controls autoPlay playsInline
          muted={muted}
          onTimeUpdate={onTimeUpdate}
          style={{ maxWidth: "92vw", maxHeight: "86vh", borderRadius: 8, display: "block", background: "#000" }}
        />
      );
    }

    if (embed.kind === "hls") {
      return (
        <video
          ref={videoRef}
          controls autoPlay playsInline
          muted={muted}
          onTimeUpdate={onTimeUpdate}
          style={{ maxWidth: "92vw", maxHeight: "86vh", borderRadius: 8, display: "block", background: "#000" }}
        />
      );
    }

    if (embed.kind === "image") {
      return (
        <img
          src={embed.src}
          alt={item.title || ""}
          style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8, display: "block" }}
        />
      );
    }

    return null;
  };

  return (
    <div
      onClick={handleClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed", inset: 0, zIndex: 999,
        background: "rgba(0,0,0,0.95)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Top controls */}
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1001, display: "flex", gap: 8 }}>
        {canPip && (
          <button onClick={(e) => { e.stopPropagation(); togglePiP(); }} style={{ ...ctrlBtn, background: isPiP ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)" }} title="Picture in Picture">
            <Icon name="pip" size={15} />
          </button>
        )}
        {canMute && (
          <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} style={ctrlBtn} title={muted ? "Unmute" : "Mute"}>
            <Icon name={muted ? "volumeOff" : "volume"} size={15} />
          </button>
        )}
        <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...ctrlBtn, textDecoration: "none" }} title="Open original">
          <Icon name="external" size={14} />
        </a>
        <button onClick={handleClose} style={ctrlBtn} title="Close"><Icon name="x" size={15} /></button>
      </div>

      {/* Title chip (bottom) */}
      {item.title && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", maxWidth: "78vw", padding: "6px 14px", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, color: T.text2, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", backdropFilter: "blur(10px)" }}>
          {item.title}
        </div>
      )}

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

      <div onClick={(e) => e.stopPropagation()}>{renderStage()}</div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const stageWide = {
  width: "min(92vw, 1280px)",
  aspectRatio: "16 / 9",
  maxHeight: "86vh",
  background: "#000",
  borderRadius: 10,
  overflow: "hidden",
};

const stagePortrait = {
  width: "min(94vw, 420px)",
  height: "min(86vh, 760px)",
  background: "#000",
  borderRadius: 10,
  overflow: "hidden",
};

const frameInner = {
  width: "100%",
  height: "100%",
  border: "none",
  display: "block",
  background: "#000",
};

const ctrlBtn = {
  background: "rgba(255,255,255,0.07)",
  border: "none",
  color: "#f5f5f7",
  cursor: "pointer",
  borderRadius: "50%",
  width: 38, height: 38,
  display: "flex", alignItems: "center", justifyContent: "center",
  backdropFilter: "blur(12px)",
};

const arrowBtn = {
  position: "absolute", top: "50%", transform: "translateY(-50%)",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#f5f5f7", cursor: "pointer",
  borderRadius: "50%", width: 44, height: 44,
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1001, backdropFilter: "blur(16px)",
};
