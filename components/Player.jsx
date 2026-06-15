"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icons";
import { T } from "@/lib/theme";
import { getEmbed } from "@/lib/sources";
import { proxiedStreamUrl } from "@/lib/utils";
import { saveProgress, getItemComments, addItemComment, deleteItemComment } from "@/lib/supabase";

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

export default function Player({ item, items = [], currentIdx = 0, onNavigate, onClose, userId, resumeAt = 0, rating = 0, onRate, onAddMoment, oilCount = 0, onOil }) {
  const [muted, setMuted]   = useState(false);
  const [isPiP, setIsPiP]   = useState(false);
  const [parent, setParent] = useState("localhost");
  const [useRelay, setUseRelay] = useState(false);
  const [relayReason, setRelayReason] = useState("");
  const [enhanceMode, setEnhanceMode] = useState("off");
  const [qualityLevels, setQualityLevels] = useState([]);
  const [quality, setQuality] = useState("auto");
  const [showComments, setShowComments] = useState(false);
  const [markNotice, setMarkNotice] = useState("");
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [driveFallback, setDriveFallback] = useState(false);

  const backdropTap = useRef(0);

  // Extraction state (used when source.id === "extract")
  const [extracted, setExtracted] = useState(null); // { url, type, resolution } | null
  const [extractErr, setExtractErr] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshCount = useRef(0); // bail after too many auto-refresh attempts
  const hlsRecoverCount = useRef(0); // recover once before falling back to relay
  const markNoticeTimer = useRef(null);
  const seekTarget = useRef(0);   // where to resume after a refresh

  // Reset relay mode when changing items. Direct playback is always tried first.
  useEffect(() => {
    setUseRelay(false);
    setRelayReason("");
    setQualityLevels([]);
    setQuality("auto");
    hlsRecoverCount.current = 0;
    setMarkNotice("");
    setDriveFallback(false);
  }, [item.url]);

  useEffect(() => {
    if (typeof window !== "undefined") setIsTouchDevice(window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth < 820);
  }, []);

  // Set Twitch parent param from current hostname (required by Twitch embeds)
  useEffect(() => {
    if (typeof window !== "undefined") setParent(window.location.hostname || "localhost");
  }, []);

  const baseEmbed = getEmbed(item.url, { muted, parent });

  // Callable extractor. cacheBust=true forces a fresh request so we can
  // re-extract when the previous signed URL expires mid-playback.
  const runExtract = useCallback(async ({ cacheBust = false } = {}) => {
    setExtractErr("");
    const u = `/api/extract?url=${encodeURIComponent(item.url)}${cacheBust ? `&t=${Date.now()}` : ""}`;
    try {
      const r = await fetch(u, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.sources?.length) {
        setExtractErr(j.error || "Could not find a video on that page.");
        return null;
      }
      return j.sources[0]; // highest resolution, sorted server-side
    } catch (e) {
      setExtractErr(e.message || "Extraction failed.");
      return null;
    }
  }, [item.url]);

  // Initial extraction on open / item change
  useEffect(() => {
    if (baseEmbed?.kind !== "extract") return;
    let cancelled = false;
    refreshCount.current = 0;
    setExtracted(null); setExtracting(true);
    runExtract().then((s) => {
      if (cancelled) return;
      if (s) setExtracted(s);
      setExtracting(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url, baseEmbed?.kind]);

  // Refresh the stream: keep current playback position, re-extract, swap src.
  const refreshStream = useCallback(async () => {
    if (baseEmbed?.kind !== "extract") return;
    if (refreshing) return;
    seekTarget.current = videoRef.current?.currentTime || 0;
    setRefreshing(true);
    const next = await runExtract({ cacheBust: true });
    if (next) {
      // Force the <video> element to remount with the new src by clearing
      // extracted first, then setting it. Without the clear, React skips
      // the update if the URL host is the same and only the token differs.
      setExtracted(null);
      setUseRelay(false);
      setRelayReason("");
      // Defer one tick so React commits the unmount
      setTimeout(() => setExtracted(next), 0);
      refreshCount.current += 1;
    }
    setRefreshing(false);
  }, [baseEmbed?.kind, refreshing, runExtract]);

  // After a refresh, when the new <video> mounts, seek back to where we left off.
  // Triggered by onLoadedMetadata in the video element below.
  const onLoadedMetadata = () => {
    if (seekTarget.current > 2 && videoRef.current) {
      videoRef.current.currentTime = seekTarget.current;
      seekTarget.current = 0;
    }
  };

  // <video> error handler. Most common cause: signed URL expired mid-playback.
  // Auto-refresh up to 2 times before giving up.
  const handleVideoError = () => {
    // First failure path: the browser likely hit CORS on a direct file/HLS stream.
    // Switch the same source through the secured server relay before giving up.
    if ((embed?.kind === "video" || embed?.kind === "hls") && embed?.src && /^https?:\/\//i.test(embed.src) && !useRelay) {
      setRelayReason("Direct playback was blocked. Using the secure relay path.");
      setUseRelay(true);
      return;
    }

    if (baseEmbed?.kind !== "extract") {
      setRelayReason("Playback failed. Open the original source or move this file to a CORS-friendly host.");
      return;
    }
    if (refreshCount.current >= 2) {
      setExtractErr("Stream keeps expiring. Try opening the original.");
      return;
    }
    refreshStream();
  };

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

  const mediaSrc = (embed?.kind === "video" || embed?.kind === "hls") && useRelay
    ? proxiedStreamUrl(embed.src)
    : embed?.src;

  const hasNext = currentIdx < items.length - 1;
  const hasPrev = currentIdx > 0;

  const videoRef = useRef(null);
  const ytPlayer = useRef(null);
  const ytSlot   = useRef(null);
  const twSlot   = useRef(null);
  const hlsRef   = useRef(null);
  const stageRef = useRef(null);
  const lastSave = useRef(0);
  const touch    = useRef({ x: null, y: null });

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track native fullscreen state so the button reflects reality
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stageRef.current?.requestFullscreen) await stageRef.current.requestFullscreen();
    } catch {}
  };
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;

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

  useEffect(() => () => { if (markNoticeTimer.current) clearTimeout(markNoticeTimer.current); }, []);

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
      v.src = mediaSrc;
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
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
          maxBufferLength: 45,
          maxMaxBufferLength: 90,
        });
        hlsRef.current = hls;
        hls.loadSource(mediaSrc);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const levels = (hls.levels || []).map((l, idx) => ({ idx, height: l.height, bitrate: l.bitrate })).filter((l) => l.height || l.bitrate);
          setQualityLevels(levels);
        });
        if (resumeAt > 2) v.currentTime = resumeAt;
        v.play().catch(() => {});
        // Hand fatal errors (mostly expired-token segment 403s) to the
        // same refresh path the <video> element uses for direct MP4s.
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsRecoverCount.current < 1) {
            hlsRecoverCount.current += 1;
            hls.recoverMediaError();
            return;
          }
          handleVideoError();
        });
      }
    })();
    return () => {
      destroyed = true;
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaSrc]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = quality === "auto" ? -1 : Number(quality);
  }, [quality]);

  // ── Direct video resume ─────────────────────────────────────────────────
  useEffect(() => {
    if ((embed?.kind === "video" || embed?.kind === "drive") && videoRef.current && resumeAt > 2) {
      videoRef.current.currentTime = resumeAt;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaSrc]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = quality === "auto" ? -1 : Number(quality);
  }, [quality]);

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
  const canPip = (embed?.kind === "video" || embed?.kind === "hls" || (embed?.kind === "drive" && !driveFallback)) && pipSupported;
  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); setIsPiP(false); }
      else if (videoRef.current) { await videoRef.current.requestPictureInPicture(); setIsPiP(true); }
    } catch {}
  };

  // ── Mute (best-effort across embed types) ───────────────────────────────
  const canMute = embed?.kind === "video" || embed?.kind === "hls" || embed?.kind === "youtube-api" || (embed?.kind === "drive" && !driveFallback);
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
    if (!isTouchDevice && dy < -70 && Math.abs(dy) > Math.abs(dx) * 1.5) { handleClose(); return; }
    if (Math.abs(dx) < 60) return;
    if (dx > 0 && hasNext) onNavigate?.(currentIdx + 1);
    if (dx < 0 && hasPrev) onNavigate?.(currentIdx - 1);
  };

  const enhanceFilter = enhanceMode === "crisp" ? "contrast(1.18) saturate(1.08) brightness(1.04)" : enhanceMode === "cinema" ? "contrast(1.14) saturate(0.96) brightness(0.98)" : enhanceMode === "soft" ? "contrast(1.05) saturate(1.03) brightness(1.01)" : "none";

  const markMoment = () => {
    const seconds = videoRef.current?.currentTime || ytPlayer.current?.getCurrentTime?.() || Number(resumeAt || 0) || 0;
    const markRating = rating || null;
    onAddMoment?.({ seconds, rating: markRating });
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    setMarkNotice(`Marked ${mins}:${secs}${markRating ? ` · ★ ${markRating}` : ""}`);
    if (markNoticeTimer.current) clearTimeout(markNoticeTimer.current);
    markNoticeTimer.current = setTimeout(() => setMarkNotice(""), 1800);
  };

  const splashCanvasRef = useRef(null);
  const splashAnimRef   = useRef(null);
  const [splashZone, setSplashZone] = useState("C");
  const [paintMode, setPaintMode]   = useState("paint"); // "paint" | "slap"
  const [slapHand, setSlapHand]     = useState("R");     // "L" | "R"

  const ZONES = {
    TL: [0.22, 0.25], TR: [0.78, 0.25],
    C:  [0.50, 0.48],
    BL: [0.22, 0.72], BR: [0.78, 0.72],
  };

  // ── Hand slap animation ────────────────────────────────────────────────────
  const triggerSlap = useCallback((e) => {
    e?.stopPropagation?.();
    onOil?.();

    const canvas = splashCanvasRef.current;
    if (!canvas) return;
    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    if (splashAnimRef.current) cancelAnimationFrame(splashAnimRef.current);

    const [zx, zy] = ZONES[splashZone] || ZONES.C;
    const tx = W * zx;
    const ty = H * zy;
    const flip = slapHand === "L" ? -1 : 1; // mirror for left hand

    const SMACK_T  = 0.22;
    const RECOIL_T = 0.50;
    const DUR      = 950;
    const born     = performance.now();
    const markRot  = (Math.random() - 0.5) * 0.3;
    const markScl  = 0.9 + Math.random() * 0.2;

    // ── Draw hand as ONE continuous blob path (no per-finger loop jitter) ──
    // Viewed face-on: palm at bottom, 4 fingers up, thumb to the side
    // All coords relative to center, then translated/flipped
    function handPath(ctx, s) {
      // s = scale factor (shrinks on recoil)
      const p = (x, y) => [x * s * flip, y * s]; // apply scale + mirror
      ctx.beginPath();
      // Start bottom-left of palm, go clockwise
      // Palm bottom
      ctx.moveTo(...p(-38,  30));
      ctx.bezierCurveTo(...p(-45, 42), ...p( 45, 42), ...p( 38,  30));
      // Palm right side up to pinky base
      ctx.bezierCurveTo(...p( 48, 18), ...p( 48,  0), ...p( 44, -10));
      // Pinky finger
      ctx.bezierCurveTo(...p( 50,-12), ...p( 54,-55), ...p( 44, -70));
      ctx.bezierCurveTo(...p( 36,-80), ...p( 28,-78), ...p( 30, -65));
      ctx.bezierCurveTo(...p( 30,-55), ...p( 34,-16), ...p( 28, -14));
      // Ring finger
      ctx.bezierCurveTo(...p( 24,-16), ...p( 22,-85), ...p( 12, -96));
      ctx.bezierCurveTo(...p(  2,-104), ...p( -8,-100), ...p( -6, -88));
      ctx.bezierCurveTo(...p( -4,-78), ...p(  4,-16), ...p( -2, -15));
      // Middle finger
      ctx.bezierCurveTo(...p( -6,-17), ...p(-14,-92), ...p(-24,-100));
      ctx.bezierCurveTo(...p(-34,-108), ...p(-44,-102), ...p(-42, -90));
      ctx.bezierCurveTo(...p(-40,-78), ...p(-30,-16), ...p(-36, -14));
      // Index finger
      ctx.bezierCurveTo(...p(-40,-14), ...p(-52,-74), ...p(-58, -80));
      ctx.bezierCurveTo(...p(-66,-86), ...p(-72,-76), ...p(-68, -66));
      ctx.bezierCurveTo(...p(-64,-56), ...p(-50, -8), ...p(-50,   2));
      // Left palm side down to thumb
      ctx.bezierCurveTo(...p(-52,  8), ...p(-56, 18), ...p(-52,  28));
      // Thumb (sticking out to the left)
      ctx.bezierCurveTo(...p(-52, 34), ...p(-80, 30), ...p(-88,  16));
      ctx.bezierCurveTo(...p(-96,  2), ...p(-86,-12), ...p(-74, -10));
      ctx.bezierCurveTo(...p(-62, -8), ...p(-48, 20), ...p(-42,  28));
      ctx.closePath();
    }

    // ── Handprint: same silhouette but flattened + squashed ─────────────────
    function printPath(ctx, s) {
      const p = (x, y) => [x * s * flip * markScl, y * s * markScl * 0.55]; // squash vertically = flat on glass
      ctx.save();
      ctx.rotate(markRot);
      ctx.beginPath();
      ctx.moveTo(...p(-38,  30));
      ctx.bezierCurveTo(...p(-45, 42), ...p( 45, 42), ...p( 38,  30));
      ctx.bezierCurveTo(...p( 48, 18), ...p( 48,  0), ...p( 44, -10));
      ctx.bezierCurveTo(...p( 50,-12), ...p( 54,-55), ...p( 44, -70));
      ctx.bezierCurveTo(...p( 36,-80), ...p( 28,-78), ...p( 30, -65));
      ctx.bezierCurveTo(...p( 30,-55), ...p( 34,-16), ...p( 28, -14));
      ctx.bezierCurveTo(...p( 24,-16), ...p( 22,-85), ...p( 12, -96));
      ctx.bezierCurveTo(...p(  2,-104), ...p( -8,-100), ...p( -6, -88));
      ctx.bezierCurveTo(...p( -4,-78), ...p(  4,-16), ...p( -2, -15));
      ctx.bezierCurveTo(...p( -6,-17), ...p(-14,-92), ...p(-24,-100));
      ctx.bezierCurveTo(...p(-34,-108), ...p(-44,-102), ...p(-42, -90));
      ctx.bezierCurveTo(...p(-40,-78), ...p(-30,-16), ...p(-36, -14));
      ctx.bezierCurveTo(...p(-40,-14), ...p(-52,-74), ...p(-58, -80));
      ctx.bezierCurveTo(...p(-66,-86), ...p(-72,-76), ...p(-68, -66));
      ctx.bezierCurveTo(...p(-64,-56), ...p(-50, -8), ...p(-50,   2));
      ctx.bezierCurveTo(...p(-52,  8), ...p(-56, 18), ...p(-52,  28));
      ctx.bezierCurveTo(...p(-52, 34), ...p(-80, 30), ...p(-88,  16));
      ctx.bezierCurveTo(...p(-96,  2), ...p(-86,-12), ...p(-74, -10));
      ctx.bezierCurveTo(...p(-62, -8), ...p(-48, 20), ...p(-42,  28));
      ctx.closePath();
      ctx.restore();
    }

    function draw(now) {
      const t = Math.min(1, (now - born) / DUR);
      ctx.clearRect(0, 0, W, H);

      // ── Fly-in and recoil ────────────────────────────────────────────────
      if (t < RECOIL_T) {
        const flyT   = Math.min(1, t / SMACK_T);
        const eased  = 1 - Math.pow(1 - flyT, 3);
        const offX   = (isLeft ? -1 : 1) * W * 0.6; // comes from left or right
        const offY   = -H * 0.28;
        const hx     = tx + offX * (1 - eased);
        const hy     = ty + offY * (1 - eased);
        const recoilT = t < SMACK_T ? 0 : (t - SMACK_T) / (RECOIL_T - SMACK_T);
        const recoilY = recoilT * H * -0.35;
        const squeeze = t < SMACK_T
          ? 1 + eased * 0.08          // slight squish on approach
          : 1 - recoilT * 0.15;       // bounce back
        const handA = Math.min(1, flyT * 3);

        ctx.save();
        ctx.translate(hx, hy + recoilY);
        // Skin gradient for 3D feel
        const hGrd = ctx.createRadialGradient(-20 * flip, -30, 8, 0, 0, 120);
        hGrd.addColorStop(0,    `rgba(255,220,175,${handA})`);
        hGrd.addColorStop(0.5,  `rgba(235,185,130,${handA})`);
        hGrd.addColorStop(1,    `rgba(195,140,90,${handA * 0.8})`);
        handPath(ctx, squeeze);
        ctx.fillStyle = hGrd;
        ctx.shadowColor = `rgba(0,0,0,${handA * 0.4})`;
        ctx.shadowBlur  = 18;
        ctx.fill();
        ctx.shadowBlur  = 0;
        // Edge outline
        handPath(ctx, squeeze);
        ctx.strokeStyle = `rgba(170,110,65,${handA * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // ── Impact flash ─────────────────────────────────────────────────────
      if (t >= SMACK_T && t < SMACK_T + 0.1) {
        const ft = (t - SMACK_T) / 0.1;
        const fa = (1 - ft) * 0.75;
        const fr = 50 + ft * 100;
        const fg = ctx.createRadialGradient(tx, ty, 0, tx, ty, fr);
        fg.addColorStop(0,   `rgba(255,240,200,${fa})`);
        fg.addColorStop(0.4, `rgba(255,120,60,${fa * 0.55})`);
        fg.addColorStop(1,   `rgba(220,40,20,0)`);
        ctx.beginPath();
        ctx.arc(tx, ty, fr, 0, Math.PI * 2);
        ctx.fillStyle = fg;
        ctx.fill();
      }

      // ── Handprint welt — appears on smack, stays and fades ───────────────
      if (t >= SMACK_T) {
        const age  = (t - SMACK_T) / (1 - SMACK_T);
        const pa   = Math.max(0, 0.92 - age * 0.58);
        // Outer welt glow (skin reaction)
        ctx.save();
        ctx.translate(tx, ty);
        printPath(ctx, 1);
        const welt = ctx.createRadialGradient(0, -20 * markScl, 0, 0, 0, 110 * markScl);
        welt.addColorStop(0,   `rgba(210,45,45,${pa})`);
        welt.addColorStop(0.55,`rgba(185,25,25,${pa * 0.85})`);
        welt.addColorStop(0.85,`rgba(155,15,15,${pa * 0.5})`);
        welt.addColorStop(1,   `rgba(120,10,10,0)`);
        ctx.fillStyle = welt;
        ctx.shadowColor = `rgba(200,30,30,${pa * 0.6})`;
        ctx.shadowBlur  = 22;
        ctx.fill();
        ctx.shadowBlur  = 0;
        // Inner darker print
        ctx.save();
        ctx.globalAlpha = pa * 0.45;
        printPath(ctx, 0.82);
        ctx.fillStyle = "rgba(130,10,10,1)";
        ctx.fill();
        ctx.restore();
        ctx.restore();
      }

      if (t < 1) {
        splashAnimRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    }

    splashAnimRef.current = requestAnimationFrame(draw);
  }, [onOil, splashZone, slapHand]);

  const triggerOil = useCallback((e) => {
    e?.stopPropagation?.();
    onOil?.();

    const canvas = splashCanvasRef.current;
    if (!canvas) return;
    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    if (splashAnimRef.current) cancelAnimationFrame(splashAnimRef.current);

    // Impact point driven by selected zone + small random jitter
    const [zx, zy] = ZONES[splashZone] || ZONES.C;
    const cx = W * zx + (Math.random() - 0.5) * W * 0.06;
    const cy = H * zy + (Math.random() - 0.5) * H * 0.05;

    // ── Blob lobes — radial gradients composited "lighter" = merged organic mass
    const lobes = Array.from({ length: 7 + Math.floor(Math.random() * 5) }, (_, i) => {
      const a = (i / 7) * Math.PI * 2 + (Math.random() - 0.5) * 1.2;
      const d = i === 0 ? 0 : 12 + Math.random() * 32;
      return {
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        vx: i === 0 ? 0 : Math.cos(a) * (0.6 + Math.random() * 1.4),
        vy: i === 0 ? 0 : Math.sin(a) * (0.6 + Math.random() * 1.4),
        r: i === 0 ? 38 + Math.random() * 18 : 12 + Math.random() * 22,
        life: 1,
        decay: i === 0 ? 0.012 : 0.016 + Math.random() * 0.01,
        grav: 0.06 + Math.random() * 0.08,
      };
    });

    // ── Tendrils: thick filled shapes, not stroked lines ─────────────────────
    // Each tendril is drawn as a filled path: two bezier edges + rounded tip
    const arms = Array.from({ length: 6 + Math.floor(Math.random() * 4) }, () => {
      const a      = Math.random() * Math.PI * 2;
      const len    = 70 + Math.random() * 120;
      const perpA  = a + Math.PI * 0.5 * (Math.random() > 0.5 ? 1 : -1);
      const cpDist = 25 + Math.random() * 55;
      return {
        angle: a,
        len,
        // Root width (fat) and tip radius
        rootW: 18 + Math.random() * 28,
        tipR:  8  + Math.random() * 14,
        // Bezier control point for the spine of the tendril
        cpx: cx + Math.cos(a) * len * 0.45 + Math.cos(perpA) * cpDist,
        cpy: cy + Math.sin(a) * len * 0.45 + Math.sin(perpA) * cpDist,
        // End point
        ex: cx + Math.cos(a) * len,
        ey: cy + Math.sin(a) * len + 10 + Math.random() * 20,
        prog: 0,
        speed: 0.055 + Math.random() * 0.05,
        life: 1,
        decay: 0.015 + Math.random() * 0.01,
      };
    });

    // ── Droplets ─────────────────────────────────────────────────────────────
    const drops = Array.from({ length: 40 + Math.floor(Math.random() * 30) }, () => {
      const a = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 18;
      return {
        x: cx + (Math.random() - 0.5) * 30,
        y: cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - Math.random() * 5,
        r: 1.5 + Math.random() * 6,
        life: 1,
        decay: 0.016 + Math.random() * 0.016,
        grav: 0.2 + Math.random() * 0.2,
      };
    });

    // ── Drips: thin vertical threads growing downward ─────────────────────────
    const drips = Array.from({ length: 4 + Math.floor(Math.random() * 3) }, () => ({
      x: cx + (Math.random() - 0.5) * 80,
      y: cy + 20 + Math.random() * 30,
      w: 1.5 + Math.random() * 4,
      len: 0,
      maxLen: 50 + Math.random() * 100,
      spd: 1.2 + Math.random() * 2,
      life: 1,
      decay: 0.009,
    }));

    const born = performance.now();

    function draw(now) {
      const age = (now - born) / 1000;
      ctx.clearRect(0, 0, W, H);

      // ── Central blob mass — lighter composite for merged blobby look ─────
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      lobes.forEach((l) => {
        if (l.life <= 0) return;
        l.vy += l.grav;
        l.x  += l.vx; l.y += l.vy;
        l.vx *= 0.96; l.vy *= 0.96;
        l.life -= l.decay;
        const a = Math.max(0, l.life);
        const r = l.r * (0.5 + a * 0.5);
        // Offset highlight for 3D sheen — light source top-left
        const grd = ctx.createRadialGradient(
          l.x - r * 0.3, l.y - r * 0.3, r * 0.02,
          l.x, l.y, r
        );
        grd.addColorStop(0,    `rgba(255,255,255,${a * 0.95})`);  // bright highlight
        grd.addColorStop(0.18, `rgba(252,254,255,${a * 0.88})`);  // sheen ring
        grd.addColorStop(0.45, `rgba(235,245,255,${a * 0.62})`);  // mid body
        grd.addColorStop(0.75, `rgba(210,230,255,${a * 0.25})`);  // edge shadow
        grd.addColorStop(1,    `rgba(180,210,255,0)`);
        ctx.beginPath();
        ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      });
      ctx.restore();

      // ── Tendrils — drawn as filled shapes, fat at root, rounded tip ────────
      arms.forEach((arm) => {
        if (arm.life <= 0) return;
        arm.prog  = Math.min(1, arm.prog + arm.speed);
        arm.life -= arm.decay;
        const p  = arm.prog;
        const al = arm.life;
        if (p <= 0.01) return;

        // Tip position along bezier at progress p
        const tipX = (1-p)*(1-p)*cx + 2*(1-p)*p*arm.cpx + p*p*arm.ex;
        const tipY = (1-p)*(1-p)*cy + 2*(1-p)*p*arm.cpy + p*p*arm.ey;

        // Spine tangent at tip — perpendicular gives us the width offset
        const dt  = 0.02;
        const p2  = Math.min(1, p + dt);
        const tx2 = (1-p2)*(1-p2)*cx + 2*(1-p2)*p2*arm.cpx + p2*p2*arm.ex;
        const ty2 = (1-p2)*(1-p2)*cy + 2*(1-p2)*p2*arm.cpy + p2*p2*arm.ey;
        const tang = Math.atan2(ty2 - tipY, tx2 - tipX);
        const perp = tang + Math.PI * 0.5;

        // Root width tapers to near-zero at tip
        const rootW = arm.rootW * al;
        const midW  = rootW * 0.55; // slight waist in the middle

        // Draw filled tendril: left bezier edge → rounded tip arc → right edge back → root arc
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(perp) * rootW, cy + Math.sin(perp) * rootW);
        // Left bezier edge to tip
        ctx.quadraticCurveTo(
          arm.cpx + Math.cos(perp) * midW,
          arm.cpy + Math.sin(perp) * midW,
          tipX + Math.cos(perp) * arm.tipR * al * p,
          tipY + Math.sin(perp) * arm.tipR * al * p
        );
        // Rounded tip arc
        ctx.arc(tipX, tipY, arm.tipR * al * p, perp, perp + Math.PI, false);
        // Right bezier edge back to root
        ctx.quadraticCurveTo(
          arm.cpx - Math.cos(perp) * midW,
          arm.cpy - Math.sin(perp) * midW,
          cx - Math.cos(perp) * rootW,
          cy - Math.sin(perp) * rootW
        );
        // Root arc to close
        ctx.arc(cx, cy, rootW, perp + Math.PI, perp, false);
        ctx.closePath();

        // Fill with gradient: bright at root, semi-transparent at tip
        const tGrd = ctx.createLinearGradient(cx, cy, tipX, tipY);
        tGrd.addColorStop(0,    `rgba(255,255,255,${al * 0.92})`);
        tGrd.addColorStop(0.4,  `rgba(248,252,255,${al * 0.80})`);
        tGrd.addColorStop(0.75, `rgba(235,245,255,${al * 0.60})`);
        tGrd.addColorStop(1,    `rgba(220,238,255,${al * 0.20})`);
        ctx.fillStyle = tGrd;
        ctx.shadowColor = "rgba(255,255,255,0.3)";
        ctx.shadowBlur  = 6;
        ctx.fill();
        ctx.shadowBlur  = 0;
      });

      // ── Droplets ─────────────────────────────────────────────────────────
      drops.forEach((d) => {
        if (d.life <= 0) return;
        d.vy += d.grav; d.x += d.vx * 0.97; d.y += d.vy; d.vx *= 0.98;
        d.life -= d.decay;
        // Small sheen on each droplet
        const dr = Math.max(0.4, d.r * d.life);
        const dg = ctx.createRadialGradient(d.x - dr*0.3, d.y - dr*0.3, 0.2, d.x, d.y, dr);
        dg.addColorStop(0, `rgba(255,255,255,${d.life * 0.95})`);
        dg.addColorStop(1, `rgba(220,235,255,0)`);
        ctx.beginPath();
        ctx.arc(d.x, d.y, dr, 0, Math.PI * 2);
        ctx.fillStyle = dg;
        ctx.fill();
      });

      // ── Drips ────────────────────────────────────────────────────────────
      drips.forEach((dr) => {
        if (dr.life <= 0) return;
        dr.len   = Math.min(dr.maxLen, dr.len + dr.spd * (1 + age * 0.3));
        dr.life -= dr.decay;
        const dg = ctx.createLinearGradient(dr.x, dr.y, dr.x, dr.y + dr.len);
        dg.addColorStop(0,    `rgba(255,255,255,${dr.life * 0.9})`);
        dg.addColorStop(0.65, `rgba(255,255,255,${dr.life * 0.45})`);
        dg.addColorStop(1,    `rgba(255,255,255,0)`);
        ctx.beginPath();
        ctx.moveTo(dr.x, dr.y);
        ctx.lineTo(dr.x, dr.y + dr.len);
        ctx.strokeStyle = dg;
        ctx.lineWidth   = dr.w * dr.life;
        ctx.lineCap     = "round";
        ctx.stroke();
        // Bead at tip
        ctx.beginPath();
        ctx.arc(dr.x, dr.y + dr.len, dr.w * 0.9 * dr.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${dr.life * 0.7})`;
        ctx.fill();
      });

      const anyAlive = lobes.some((l) => l.life > 0)
        || arms.some((a) => a.life > 0)
        || drops.some((d) => d.life > 0)
        || drips.some((dr) => dr.life > 0);

      if (anyAlive) {
        splashAnimRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    }

    splashAnimRef.current = requestAnimationFrame(draw);
  }, [onOil, splashZone]);

  const openPopout = useCallback(() => {
    const target = (embed?.kind === "video" || embed?.kind === "hls") ? (mediaSrc || embed.src) :
      embed?.kind === "drive" && !driveFallback ? embed.src : item.url;
    try { window.open(target || item.url, "vaultPopout", "popup=yes,width=960,height=640,noopener,noreferrer"); }
    catch { window.open(target || item.url, "_blank", "noopener,noreferrer"); }
  }, [embed, mediaSrc, item.url, driveFallback]);

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
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={(e) => { e.stopPropagation(); openPopout(); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(255,255,255,0.10)", border: `1px solid ${T.border}`, borderRadius: 20, color: T.text1, fontSize: 12, cursor: "pointer" }}>
              Pop out <Icon name="external" size={12} />
            </button>
            <a href={item.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "rgba(255,255,255,0.08)", border: `1px solid ${T.border}`, borderRadius: 20, color: T.text1, fontSize: 12, textDecoration: "none" }}>
              Open original <Icon name="external" size={12} />
            </a>
          </div>
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
      const wrap =
        embed.sizing === "portrait" ? stagePortrait :
        embed.sizing === "tall"     ? stageTall :
        embed.sizing === "drive"    ? stageDrive(isFullscreen) :
                                      stageWide;
      // "tall" content (Reddit posts, Facebook embeds) often needs scroll
      // inside the iframe to surface video controls hidden below the fold.
      const allowScroll = embed.sizing === "tall";
      return (
        <div style={wrap}>
          <iframe
            src={embed.src}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
            allowFullScreen
            scrolling={allowScroll ? "yes" : "no"}
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
        <div style={mediaShell(isFullscreen)}>
          <video
            ref={videoRef}
            src={mediaSrc}
            controls autoPlay playsInline preload="metadata"
            muted={muted}
            onTimeUpdate={onTimeUpdate}
            onError={handleVideoError}
            onLoadedMetadata={onLoadedMetadata}
            style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: isFullscreen ? 0 : 8, display: "block", background: "#000", filter: enhanceFilter }}
          />
          {relayReason && <RelayBadge text={relayReason} active={useRelay} />}
          {refreshing && <RefreshOverlay />}
        </div>
      );
    }

    if (embed.kind === "hls") {
      return (
        <div style={mediaShell(isFullscreen)}>
          <video
            ref={videoRef}
            controls autoPlay playsInline preload="metadata"
            muted={muted}
            onTimeUpdate={onTimeUpdate}
            onError={handleVideoError}
            onLoadedMetadata={onLoadedMetadata}
            style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: isFullscreen ? 0 : 8, display: "block", background: "#000", filter: enhanceFilter }}
          />
          {relayReason && <RelayBadge text={relayReason} active={useRelay} />}
          {refreshing && <RefreshOverlay />}
        </div>
      );
    }


    if (embed.kind === "drive") {
      if (driveFallback) {
        return (
          <div style={stageDrive(isFullscreen)}>
            <iframe src={embed.preview} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen scrolling="no" style={frameInner} />
            <RelayBadge text="Google Drive preview mode. Progress and Enhance only work when Drive allows direct playback." active={false} />
          </div>
        );
      }
      return (
        <div style={mediaShell(isFullscreen)}>
          <video
            ref={videoRef}
            src={embed.src}
            controls autoPlay playsInline preload="metadata"
            muted={muted}
            onTimeUpdate={onTimeUpdate}
            onError={() => setDriveFallback(true)}
            onLoadedMetadata={onLoadedMetadata}
            style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: isFullscreen ? 0 : 8, display: "block", background: "#000", filter: enhanceFilter }}
          />
        </div>
      );
    }

    if (embed.kind === "pdf") {
      return <PdfViewer src={embed.src} userId={userId} itemKey={item.key} resumeAt={resumeAt} />;
    }

    if (embed.kind === "image") {
      return <ImageViewer src={embed.src} alt={item.title || ""} />;
    }

    return null;
  };

  const handleBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return;
    if (!isTouchDevice) { handleClose(); return; }
    const now = Date.now();
    if (now - backdropTap.current < 320) handleClose();
    backdropTap.current = now;
  };

  return (
    <div
      onClick={handleBackdropClick}
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
      <div style={topControls}>
        {(embed?.kind === "video" || embed?.kind === "hls" || embed?.kind === "youtube-api" || (embed?.kind === "drive" && !driveFallback)) && (
          <select value={enhanceMode} onChange={(e) => { e.stopPropagation(); setEnhanceMode(e.target.value); }} onClick={(e) => e.stopPropagation()} style={selectBtn} title="View enhancement">
            <option value="off">Enhance Off</option>
            <option value="soft">Soft</option>
            <option value="crisp">Crisp</option>
            <option value="cinema">Cinema</option>
          </select>
        )}
        {qualityLevels.length > 0 && (
          <select value={quality} onChange={(e) => { e.stopPropagation(); setQuality(e.target.value); }} onClick={(e) => e.stopPropagation()} style={selectBtn} title="HLS quality">
            <option value="auto">Auto</option>
            {qualityLevels.map((l) => <option key={l.idx} value={l.idx}>{l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}kbps`}</option>)}
          </select>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 2, background: "rgba(255,255,255,0.07)", borderRadius: 999, padding: "0 8px", height: 38, backdropFilter: "blur(12px)" }}>
          {[1,2,3,4,5].map((n) => <button key={n} onClick={(e) => { e.stopPropagation(); onRate?.(rating === n ? null : n); }} style={{ background: "transparent", border: "none", color: n <= rating ? T.amber : T.text4, cursor: "pointer", fontSize: 16, padding: 1 }}>★</button>)}
        </div>
        <button onClick={(e) => { e.stopPropagation(); markMoment(); }} style={{ ...ctrlBtn, width: "auto", padding: "0 10px", borderRadius: 18, fontSize: 11 }} title="Mark this timestamp">
          Mark
        </button>
        <button onClick={(e) => { e.stopPropagation(); setShowComments((v) => !v); }} style={{ ...ctrlBtn, background: showComments ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)" }} title="Comments">
          <Icon name="comment" size={15} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); openPopout(); }} style={ctrlBtn} title="Pop out player">
          <Icon name="external" size={14} />
        </button>
        {(embed?.kind === "video" || embed?.kind === "hls") && embed?.src && /^https?:\/\//i.test(embed.src) && !useRelay && (
          <button onClick={(e) => { e.stopPropagation(); setRelayReason("Using the secure relay path."); setUseRelay(true); }} style={{ ...ctrlBtn, width: "auto", padding: "0 10px", borderRadius: 18, fontSize: 11 }} title="Use secure relay">
            Relay
          </button>
        )}
        {baseEmbed?.kind === "extract" && extracted && (
          <button onClick={(e) => { e.stopPropagation(); refreshCount.current = 0; refreshStream(); }} style={ctrlBtn} title="Refresh stream (use if playback stops)">
            <Icon name="sync" size={15} style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }} />
          </button>
        )}
        {canPip && (
          <button onClick={(e) => { e.stopPropagation(); togglePiP(); }} style={{ ...ctrlBtn, background: isPiP ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)" }} title="Picture in Picture">
            <Icon name="pip" size={15} />
          </button>
        )}
        {canFullscreen && (
          <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} style={{ ...ctrlBtn, background: isFullscreen ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)" }} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <Icon name="fullscreen" size={15} />
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
      {markNotice && <div style={markToast}>{markNotice}</div>}


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

      {/* Paint / Slap panel */}
      <div style={{ position: "absolute", right: 16, bottom: 18, zIndex: 9, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>

        {/* Mode toggle: Paint | Slap */}
        <div style={{ display: "flex", gap: 3, background: "rgba(0,0,0,0.45)", borderRadius: 8, padding: 3 }}>
          {["paint", "slap"].map((m) => (
            <button key={m} onClick={(e) => { e.stopPropagation(); setPaintMode(m); }} style={{
              border: "none", cursor: "pointer", borderRadius: 6, padding: "3px 8px",
              fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
              background: paintMode === m ? "rgba(255,255,255,0.9)" : "transparent",
              color: paintMode === m ? "#000" : "rgba(255,255,255,0.6)",
              transition: "all 0.15s",
            }}>
              {m === "paint" ? "💧" : "👋"} {m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Zone grid — shared by both modes */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,18px)", gap: 3 }}>
          {[
            ["TL",""],["",""],["TR",""],
            ["",""],["C",""],["",""],
            ["BL",""],["",""],["BR",""],
          ].map(([zone], idx) => zone ? (
            <button key={zone} onClick={(e) => { e.stopPropagation(); setSplashZone(zone); }} style={{
              width: 18, height: 18, borderRadius: 4, border: "none", cursor: "pointer",
              background: splashZone === zone ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)",
              transition: "background 0.15s",
            }} title={zone} />
          ) : (
            <div key={idx} style={{ width: 18, height: 18 }} />
          ))}
        </div>

        {/* Hand selector — only shown in slap mode */}
        {paintMode === "slap" && (
          <div style={{ display: "flex", gap: 4 }}>
            {["L", "R"].map((h) => (
              <button key={h} onClick={(e) => { e.stopPropagation(); setSlapHand(h); }} style={{
                width: 32, height: 26, border: "none", cursor: "pointer", borderRadius: 6,
                fontSize: 11, fontWeight: 800,
                background: slapHand === h ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.18)",
                color: slapHand === h ? "#000" : "rgba(255,255,255,0.7)",
                transform: h === "L" ? "scaleX(-1)" : "none",
                transition: "all 0.15s",
              }}>
                {h === "L" ? "🤚" : "🤚"}
              </button>
            ))}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={paintMode === "slap" ? triggerSlap : triggerOil}
          style={oilBtn}
          title={paintMode === "slap" ? "Slap" : "Shoot"}
          aria-label={paintMode === "slap" ? "Slap" : "Shoot paint"}
        >
          {paintMode === "slap"
            ? <span style={{ fontSize: 22, lineHeight: 1 }}>👋</span>
            : <span style={oilDropIcon} />
          }
          {oilCount > 0 && <span style={oilCountBadge}>{oilCount}</span>}
        </button>
      </div>
      <canvas
        ref={splashCanvasRef}
        style={{
          position: "fixed", inset: 0, zIndex: 998,
          pointerEvents: "none",
          width: "100vw", height: "100vh",
        }}
      />

      <div ref={stageRef} onClick={(e) => e.stopPropagation()} style={isFullscreen ? fullscreenStage : undefined}>{renderStage()}</div>
      {showComments && (
        <CommentsPanel
          userId={userId}
          itemKey={item.key}
          title={item.title || item.url}
          onClose={() => setShowComments(false)}
        />
      )}
    </div>
  );
}

function CommentsPanel({ userId, itemKey, title, onClose }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!userId || !itemKey) return;
    setLoading(true); setError("");
    try { setComments(await getItemComments(userId, itemKey)); }
    catch (e) { setError(e.message || "Could not load comments."); }
    finally { setLoading(false); }
  }, [userId, itemKey]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const text = body.trim();
    if (!text || !userId) return;
    setSaving(true); setError("");
    try {
      const row = await addItemComment(userId, itemKey, text);
      if (row) setComments((prev) => [...prev, row]);
      setBody("");
    } catch (e) { setError(e.message || "Could not save comment."); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!userId) return;
    const ok = window.confirm("Delete this comment?");
    if (!ok) return;
    setComments((prev) => prev.filter((c) => c.id !== id));
    await deleteItemComment(userId, id).catch(() => {});
  };

  return (
    <div onClick={(e) => e.stopPropagation()} style={commentsPanel}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, color: T.text1, fontWeight: 700 }}>Comments</div>
          <div style={{ fontSize: 11, color: T.text4, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        </div>
        <button onClick={onClose} style={miniBtn}><Icon name="x" size={14} /></button>
      </div>

      {!userId && <div style={commentNotice}>Sign in to save comments.</div>}
      {error && <div style={{ ...commentNotice, color: "#ff9b9b" }}>{error}</div>}

      <div style={{ display: "grid", gap: 8, maxHeight: "42dvh", overflow: "auto", marginBottom: 12 }}>
        {loading && <div style={commentNotice}>Loading...</div>}
        {!loading && comments.length === 0 && <div style={commentNotice}>No comments yet.</div>}
        {comments.map((c) => (
          <div key={c.id} style={commentRow}>
            <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{c.body}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 7, gap: 8 }}>
              <div style={{ fontSize: 10, color: T.text4 }}>{new Date(c.created_at).toLocaleString()}</div>
              <button onClick={() => remove(c.id)} style={{ ...miniBtn, width: 26, height: 26 }}><Icon name="trash" size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment..." rows={3} style={commentInput} />
      <button onClick={add} disabled={!body.trim() || saving || !userId} style={{ ...commentSave, opacity: body.trim() && userId ? 1 : 0.45 }}>{saving ? "Saving..." : "Add comment"}</button>
    </div>
  );
}


function PdfViewer({ src, userId, itemKey, resumeAt = 0 }) {
  const [page, setPage] = useState(Math.max(1, Math.floor(Number(resumeAt || 1))));
  const pageRef = useRef(page);

  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => () => { if (userId && itemKey) saveProgress(userId, itemKey, pageRef.current || 1, 0); }, [userId, itemKey]);

  const setAndSave = (next) => {
    const safe = Math.max(1, next);
    setPage(safe);
    if (userId && itemKey) saveProgress(userId, itemKey, safe, 0);
  };

  const pdfSrc = `${src}#page=${page}&toolbar=1&navpanes=0&view=FitH`;
  return (
    <div style={pdfShell}>
      <iframe src={pdfSrc} title="PDF viewer" style={frameInner} />
      <div style={pdfControls}>
        <button onClick={(e) => { e.stopPropagation(); setAndSave(page - 1); }} style={pdfBtn}>Prev</button>
        <div style={{ color: T.text1, fontSize: 12, minWidth: 72, textAlign: "center" }}>Page {page}</div>
        <button onClick={(e) => { e.stopPropagation(); setAndSave(page + 1); }} style={pdfBtn}>Next</button>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const pdfShell = { position: "relative", width: "min(96vw, 980px)", height: "min(86dvh, 900px)", background: "#111", borderRadius: 12, overflow: "hidden" };
const pdfControls = { position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.62)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 999, padding: 5, backdropFilter: "blur(12px)" };
const pdfBtn = { padding: "7px 11px", borderRadius: 999, background: "rgba(255,255,255,0.10)", border: "none", color: T.text1, cursor: "pointer", fontSize: 12, fontWeight: 700 };

const fullscreenStage = { width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" };

const topControls = {
  position: "absolute", top: 16, left: 16, right: 16, zIndex: 1001,
  display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end",
  maxWidth: "calc(100vw - 32px)", overflowX: "auto", overflowY: "hidden",
  paddingBottom: 5, WebkitOverflowScrolling: "touch", scrollbarWidth: "thin",
};

const markToast = {
  position: "absolute", top: 66, right: 16, zIndex: 1002,
  padding: "7px 11px", borderRadius: 999, background: "rgba(0,0,0,0.72)",
  border: "1px solid rgba(255,255,255,0.12)", color: T.text1, fontSize: 12,
  boxShadow: "0 12px 40px rgba(0,0,0,0.45)", backdropFilter: "blur(12px)",
};

const mediaShell = (fullscreen) => ({
  position: "relative",
  width: fullscreen ? "100vw" : "min(94vw, 1280px)",
  height: fullscreen ? "100vh" : "min(86vh, calc(94vw * 9 / 16))",
  maxHeight: fullscreen ? "100vh" : "86vh",
  background: "#000",
  borderRadius: fullscreen ? 0 : 8,
  overflow: "hidden",
});

const stageWide = {
  width: "min(94vw, 1280px)",
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

// Post-style content (Reddit, Facebook) — full height, narrower to feel mobile-native
const stageTall = {
  width: "min(94vw, 540px)",
  height: "min(88vh, 820px)",
  background: "#fff",
  borderRadius: 10,
  overflow: "hidden",
};

const stageDrive = (fullscreen) => ({
  width: fullscreen ? "100vw" : "min(96vw, 980px)",
  height: fullscreen ? "100vh" : "min(78vh, 860px)",
  background: "#000",
  borderRadius: fullscreen ? 0 : 10,
  overflow: "hidden",
});

const frameInner = {
  width: "100%",
  height: "100%",
  border: "none",
  display: "block",
  background: "#000",
};

const selectBtn = {
  height: 38,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#f5f5f7",
  borderRadius: 18,
  padding: "0 10px",
  fontSize: 11,
  backdropFilter: "blur(12px)",
};


const commentsPanel = {
  position: "absolute",
  right: 14,
  bottom: 14,
  width: "min(380px, calc(100vw - 28px))",
  maxHeight: "72dvh",
  background: "rgba(14,14,14,0.96)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: 14,
  zIndex: 1002,
  boxShadow: "0 24px 80px rgba(0,0,0,0.72)",
  backdropFilter: "blur(18px)",
};

const commentRow = {
  padding: 10,
  borderRadius: 11,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const commentNotice = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.045)",
  color: T.text4,
  fontSize: 12,
  lineHeight: 1.45,
};

const commentInput = {
  width: "100%",
  resize: "vertical",
  minHeight: 78,
  padding: 10,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 11,
  color: T.text1,
  fontSize: 12,
  outline: "none",
  marginBottom: 8,
};

const commentSave = {
  width: "100%",
  padding: "10px 12px",
  background: "rgba(255,255,255,0.13)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: T.text1,
  borderRadius: 11,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const miniBtn = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.075)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: T.text2,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
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

function RelayBadge({ text, active }) {
  return (
    <div style={{ position: "absolute", left: 10, bottom: 10, right: 10, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ padding: "6px 10px", borderRadius: 999, background: active ? "rgba(50,215,75,0.16)" : "rgba(255,255,255,0.10)", border: `1px solid ${active ? "rgba(50,215,75,0.24)" : T.border}`, color: active ? "rgba(205,255,214,0.92)" : T.text2, fontSize: 11, backdropFilter: "blur(12px)", maxWidth: "min(82vw, 520px)", textAlign: "center" }}>
        {text}
      </div>
    </div>
  );
}

function RefreshOverlay() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(4px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      borderRadius: 8, gap: 12, pointerEvents: "none",
    }}>
      <div style={{ width: 28, height: 28, border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 12, color: "#fff", fontWeight: 500, letterSpacing: 0.3 }}>Refreshing stream...</div>
    </div>
  );
}

// ─── Image viewer with pinch/wheel zoom and drag pan ────────────────────────
function ImageViewer({ src, alt }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragState  = useRef(null);
  const pinchState = useRef(null);
  const lastTap    = useRef(0);

  const clamp = (s) => Math.max(1, Math.min(8, s));

  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  // Mouse wheel zoom
  const onWheel = (e) => {
    e.preventDefault();
    setScale((s) => {
      const next = clamp(s + (-e.deltaY * 0.002) * s);
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  // Touch: pinch zoom + one-finger pan + double-tap reset
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinchState.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
      dragState.current = null;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 280) { reset(); lastTap.current = 0; return; }
      lastTap.current = now;
      if (scale > 1) dragState.current = { x: e.touches[0].clientX - pos.x, y: e.touches[0].clientY - pos.y };
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinchState.current) {
      e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setScale(clamp((d / pinchState.current.d) * pinchState.current.scale));
    } else if (e.touches.length === 1 && dragState.current) {
      e.preventDefault();
      setPos({
        x: e.touches[0].clientX - dragState.current.x,
        y: e.touches[0].clientY - dragState.current.y,
      });
    }
  };
  const onTouchEnd = () => { pinchState.current = null; dragState.current = null; };

  // Mouse drag pan
  const onMouseDown = (e) => {
    e.preventDefault();
    if (scale > 1) dragState.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };
  const onMouseMove = (e) => {
    if (dragState.current) setPos({ x: e.clientX - dragState.current.x, y: e.clientY - dragState.current.y });
  };
  const onMouseUp = () => { dragState.current = null; };
  const onDoubleClick = () => { scale === 1 ? setScale(2.5) : reset(); };

  const zoomBy = (factor) => {
    setScale((s) => {
      const next = clamp(s * factor);
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh" }}>
      <div
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
        style={{
          width: "100vw", height: "100dvh",
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: scale > 1 ? (dragState.current ? "grabbing" : "grab") : "zoom-in",
          userSelect: "none",
          touchAction: "none",
          background: "#000",
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            width: "100vw", height: "100dvh",
            objectFit: "contain", display: "block",
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: "center",
            transition: (dragState.current || pinchState.current) ? "none" : "transform 0.12s ease-out",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Zoom controls (visible only when not at default scale, or on desktop hover) */}
      <div style={{
        position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
        display: "flex", gap: 6,
        background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: 4,
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(10px)",
      }}>
        <button onClick={(e) => { e.stopPropagation(); zoomBy(1/1.5); }} style={zoomBtn} title="Zoom out">
          <Icon name="zoomOut" size={14} />
        </button>
        <div style={{ fontSize: 11, color: "#fff", padding: "0 8px", alignSelf: "center", fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "center" }}>
          {Math.round(scale * 100)}%
        </div>
        <button onClick={(e) => { e.stopPropagation(); zoomBy(1.5); }} style={zoomBtn} title="Zoom in">
          <Icon name="zoomIn" size={14} />
        </button>
        {scale !== 1 && (
          <button onClick={(e) => { e.stopPropagation(); reset(); }} style={zoomBtn} title="Reset">
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

const zoomBtn = {
  background: "rgba(255,255,255,0.08)",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  borderRadius: "50%",
  width: 30, height: 30,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const oilBtn = {
  position: "relative", zIndex: 9,
  width: 46, height: 46, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.34)",
  background: "radial-gradient(circle at 35% 27%, #fff 0 18%, rgba(255,255,255,0.86) 42%, rgba(255,255,255,0.42) 100%)",
  color: "#080808", boxShadow: "0 16px 38px rgba(0,0,0,0.44), inset 0 1px 9px rgba(255,255,255,0.7)", cursor: "pointer", display: "grid", placeItems: "center",
  backdropFilter: "blur(10px)",
};
const oilDropIcon = {
  width: 16, height: 20, borderRadius: "55% 55% 62% 38% / 62% 62% 45% 45%",
  background: "linear-gradient(145deg, #fff, rgba(255,255,255,0.86))",
  transform: "rotate(36deg)",
  boxShadow: "0 0 10px rgba(255,255,255,0.75)",
};
const oilCountBadge = {
  position: "absolute", right: -5, top: -5, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
  background: "#fff", color: "#000", border: "1px solid rgba(0,0,0,0.18)", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center",
};

