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

  const triggerOil = useCallback((e) => {
    e?.stopPropagation?.();
    onOil?.();

    const canvas = splashCanvasRef.current;
    if (!canvas) return;
    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");

    // Cancel any running animation
    if (splashAnimRef.current) cancelAnimationFrame(splashAnimRef.current);

    // ── Generate particles ──────────────────────────────────────────────────
    // Origin: roughly where the oil button sits (bottom-right)
    const ox = W - 80;
    const oy = H - 80;

    // Main arcing streams — thick ropes of fluid
    const streams = Array.from({ length: 5 + Math.floor(Math.random() * 4) }, () => {
      const angle = Math.PI + (Math.random() - 0.5) * 1.1;  // leftward arc
      const speed = 18 + Math.random() * 22;
      return {
        x: ox, y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (6 + Math.random() * 8), // upward bias
        life: 1,
        decay: 0.012 + Math.random() * 0.01,
        width: 6 + Math.random() * 14,
        wobble: (Math.random() - 0.5) * 0.04,
        trail: [],
      };
    });

    // Splatter micro-droplets — scatter all over screen
    const droplets = Array.from({ length: 60 + Math.floor(Math.random() * 40) }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 28;
      return {
        x: ox + (Math.random() - 0.5) * 40,
        y: oy + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (Math.random() * 12),
        r: 1.5 + Math.random() * 7,
        life: 0.7 + Math.random() * 0.3,
        decay: 0.008 + Math.random() * 0.018,
        gravity: 0.18 + Math.random() * 0.22,
        splat: false,
        splatY: 0,
        splatR: 0,
      };
    });

    // Central impact blob — the big mass that lands on screen
    const blob = {
      x: ox - (180 + Math.random() * 220),
      y: oy - (60 + Math.random() * 80),
      r: 0,
      targetR: 55 + Math.random() * 45,
      life: 1,
      decay: 0.006,
      arms: Array.from({ length: 8 + Math.floor(Math.random() * 6) }, () => ({
        angle: Math.random() * Math.PI * 2,
        len: 30 + Math.random() * 90,
        width: 3 + Math.random() * 10,
        tip: 1 + Math.random() * 4,
        curve: (Math.random() - 0.5) * 0.9,
      })),
      drips: Array.from({ length: 4 + Math.floor(Math.random() * 5) }, () => ({
        angle: Math.PI * 0.3 + Math.random() * Math.PI * 1.4, // downward range
        x: 0, y: 0,
        len: 0,
        targetLen: 40 + Math.random() * 120,
        speed: 0.6 + Math.random() * 1.2,
        width: 2 + Math.random() * 6,
        beaded: Math.random() > 0.4,
      })),
      born: performance.now(),
    };

    const startTime = performance.now();

    function draw(now) {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, W, H);

      // ── Draw streams ───────────────────────────────────────────────────────
      streams.forEach((s) => {
        if (s.life <= 0) return;
        s.trail.push({ x: s.x, y: s.y, w: s.width * s.life });
        if (s.trail.length > 28) s.trail.shift();

        s.vx += s.wobble;
        s.vy += 0.55; // gravity
        s.x  += s.vx;
        s.y  += s.vy;
        s.life -= s.decay;

        if (s.trail.length > 2) {
          ctx.beginPath();
          ctx.moveTo(s.trail[0].x, s.trail[0].y);
          for (let i = 1; i < s.trail.length; i++) {
            const t = s.trail[i];
            ctx.lineTo(t.x, t.y);
          }
          ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, s.life * 0.95)})`;
          ctx.lineWidth   = Math.max(0.5, s.width * s.life);
          ctx.lineCap     = "round";
          ctx.lineJoin    = "round";
          ctx.shadowColor = "rgba(255,255,255,0.6)";
          ctx.shadowBlur  = 8;
          ctx.stroke();
          ctx.shadowBlur  = 0;
        }
      });

      // ── Draw droplets ──────────────────────────────────────────────────────
      droplets.forEach((d) => {
        if (d.life <= 0) return;
        if (!d.splat) {
          d.vy += d.gravity;
          d.x  += d.vx * 0.96;
          d.y  += d.vy;
          d.vx *= 0.98;
          d.life -= d.decay;

          ctx.beginPath();
          ctx.arc(d.x, d.y, Math.max(0.3, d.r * d.life), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${Math.min(1, d.life * 1.1)})`;
          ctx.shadowColor = "rgba(255,255,255,0.5)";
          ctx.shadowBlur  = 4;
          ctx.fill();
          ctx.shadowBlur  = 0;

          // Splat when hitting bottom or edges
          if (d.y > H * 0.88 || d.x < 10 || d.x > W - 10) {
            d.splat  = true;
            d.splatY = d.y;
            d.splatR = d.r * (2 + Math.random() * 3);
          }
        } else {
          // Splat puddle
          d.life -= 0.005;
          const alpha = Math.max(0, d.life * 0.7);
          ctx.beginPath();
          ctx.ellipse(d.x, d.splatY, d.splatR * 1.8, d.splatR * 0.4, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fill();
        }
      });

      // ── Draw central blob ──────────────────────────────────────────────────
      if (blob.life > 0) {
        const age = (now - blob.born) / 1000;
        blob.r = Math.min(blob.targetR, blob.r + (blob.targetR - blob.r) * 0.18);
        blob.life -= blob.decay;
        const alpha = Math.min(1, blob.life * 1.3);

        // Core blob with radial gradient for 3D feel
        const grd = ctx.createRadialGradient(
          blob.x - blob.r * 0.28, blob.y - blob.r * 0.28, blob.r * 0.05,
          blob.x, blob.y, blob.r * 1.1
        );
        grd.addColorStop(0,   `rgba(255,255,255,${alpha})`);
        grd.addColorStop(0.5, `rgba(240,240,250,${alpha * 0.92})`);
        grd.addColorStop(1,   `rgba(200,210,230,${alpha * 0.4})`);

        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.shadowColor = "rgba(255,255,255,0.7)";
        ctx.shadowBlur  = 22;
        ctx.fill();
        ctx.shadowBlur  = 0;

        // Arms / tendrils shooting out
        blob.arms.forEach((arm) => {
          const ax = blob.x + Math.cos(arm.angle + age * arm.curve) * blob.r * 0.7;
          const ay = blob.y + Math.sin(arm.angle + age * arm.curve) * blob.r * 0.7;
          const ex = blob.x + Math.cos(arm.angle + age * arm.curve) * (blob.r + arm.len * Math.min(1, age * 2.2));
          const ey = blob.y + Math.sin(arm.angle + age * arm.curve) * (blob.r + arm.len * Math.min(1, age * 2.2));

          const gr = ctx.createLinearGradient(ax, ay, ex, ey);
          gr.addColorStop(0,   `rgba(255,255,255,${alpha * 0.95})`);
          gr.addColorStop(0.7, `rgba(255,255,255,${alpha * 0.6})`);
          gr.addColorStop(1,   `rgba(255,255,255,0)`);

          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ex, ey);
          ctx.strokeStyle = gr;
          ctx.lineWidth   = arm.width * Math.max(0, 1 - age * 0.5);
          ctx.lineCap     = "round";
          ctx.shadowColor = "rgba(255,255,255,0.4)";
          ctx.shadowBlur  = 6;
          ctx.stroke();
          ctx.shadowBlur  = 0;

          // Tip droplet
          if (age > 0.3) {
            ctx.beginPath();
            ctx.arc(ex, ey, arm.tip * Math.max(0, blob.life), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha * 0.85})`;
            ctx.fill();
          }
        });

        // Drips hanging downward
        blob.drips.forEach((dr) => {
          dr.len = Math.min(dr.targetLen, dr.len + dr.speed * (1 + age));
          const startX = blob.x + Math.cos(dr.angle) * blob.r * 0.6;
          const startY = blob.y + Math.sin(dr.angle) * blob.r * 0.6;
          const endX   = startX + Math.cos(dr.angle) * dr.len * 0.25;
          const endY   = startY + dr.len; // gravity pulls straight down

          const dg = ctx.createLinearGradient(startX, startY, endX, endY);
          dg.addColorStop(0,    `rgba(255,255,255,${alpha * 0.9})`);
          dg.addColorStop(0.65, `rgba(255,255,255,${alpha * 0.55})`);
          dg.addColorStop(1,    `rgba(255,255,255,0)`);

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          if (dr.beaded) {
            // Beaded drip — series of blobs
            const steps = Math.floor(dr.len / 14);
            for (let i = 1; i <= steps; i++) {
              const t  = i / Math.max(1, steps);
              const bx = startX + (endX - startX) * t;
              const by = startY + (endY - startY) * t;
              const br = (dr.width * 0.5) * (1 - t * 0.5) * alpha;
              ctx.beginPath();
              ctx.arc(bx, by, Math.max(0.2, br), 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255,255,255,${alpha * (1 - t * 0.7)})`;
              ctx.fill();
            }
          } else {
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = dg;
            ctx.lineWidth   = dr.width * alpha;
            ctx.lineCap     = "round";
            ctx.stroke();
          }
        });
      }

      // Keep running until everything fades
      const anyAlive = blob.life > 0
        || streams.some((s) => s.life > 0)
        || droplets.some((d) => d.life > 0);

      if (anyAlive) {
        splashAnimRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    }

    splashAnimRef.current = requestAnimationFrame(draw);
  }, [onOil]);

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

      <button
        onClick={triggerOil}
        style={oilBtn}
        title="Web squirt"
        aria-label="Web squirt"
      >
        <span style={oilDropIcon} />
        {oilCount > 0 && <span style={oilCountBadge}>{oilCount}</span>}
      </button>
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
  position: "absolute", right: 22, bottom: 24, zIndex: 9,
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

