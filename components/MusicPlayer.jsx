"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icons";
import { saveProgress } from "@/lib/supabase";
import { T } from "@/lib/theme";

export default function MusicPlayer({ queue, currentIdx, onIdxChange, onClose, userId }) {
  const audioRef    = useRef(null);
  const saveTimer   = useRef(0);
  const shuffleOrder= useRef([]);

  const [playing,   setPlaying]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [duration,  setDuration]  = useState(0);
  const [volume,    setVolume]    = useState(1);
  const [muted,     setMuted]     = useState(false);
  const [shuffle,   setShuffle]   = useState(false);
  const [repeat,    setRepeat]    = useState("none");
  const [showQueue, setShowQueue] = useState(false);

  const item = queue[currentIdx] || null;

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !item) return;
    a.src = item.url;
    a.volume = volume;
    a.muted = muted;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    setProgress(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.url]);

  useEffect(() => {
    const idxs = queue.map((_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    shuffleOrder.current = idxs;
  }, [queue]);

  const goNext = useCallback(() => {
    if (!queue.length) return;
    if (repeat === "one") { audioRef.current?.play(); return; }
    if (shuffle) {
      const cur = shuffleOrder.current.indexOf(currentIdx);
      onIdxChange(shuffleOrder.current[(cur + 1) % queue.length]);
    } else if (currentIdx < queue.length - 1) {
      onIdxChange(currentIdx + 1);
    } else if (repeat === "all") {
      onIdxChange(0);
    } else {
      setPlaying(false);
    }
  }, [queue.length, currentIdx, repeat, shuffle, onIdxChange]);

  const goPrev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    if (shuffle) {
      const cur = shuffleOrder.current.indexOf(currentIdx);
      onIdxChange(shuffleOrder.current[(cur - 1 + queue.length) % queue.length]);
    } else {
      onIdxChange(Math.max(0, currentIdx - 1));
    }
  }, [currentIdx, queue.length, shuffle, onIdxChange]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setProgress(a.duration ? a.currentTime / a.duration : 0);
    setDuration(a.duration || 0);
    const now = Date.now();
    if (userId && item && now - saveTimer.current > 5000) {
      saveTimer.current = now;
      saveProgress(userId, item.key, a.currentTime, a.duration || 0);
    }
  };

  const handleEnded = () => {
    if (userId && item && audioRef.current) saveProgress(userId, item.key, 0, audioRef.current.duration || 0);
    goNext();
  };

  const seekTo = (e) => {
    const a = audioRef.current;
    if (!a) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * (a.duration || 0);
  };

  const fmt = (s) => {
    if (!s || isNaN(s)) return "0:00";
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  };

  if (!item) return null;

  return (
    <>
      <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onEnded={handleEnded}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)} />

      {/* Queue panel */}
      {showQueue && (
        <div style={{
          position: "fixed", right: 0, bottom: 68, width: "min(320px, 100vw)",
          maxHeight: "50vh", overflowY: "auto",
          background: "rgba(10,10,10,0.96)", backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: `1px solid ${T.border}`, borderLeft: `1px solid ${T.border}`,
          zIndex: 900, fontFamily: "Inter, sans-serif"
        }}>
          <div style={{ padding: "11px 16px", fontSize: 10, color: T.text4, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${T.borderSub}` }}>
            Up Next — {queue.length} tracks
          </div>
          {queue.map((track, i) => (
            <button key={track.key} onClick={() => onIdxChange(i)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "9px 14px", background: i === currentIdx ? "rgba(255,255,255,0.05)" : "transparent",
              border: "none", cursor: "pointer", textAlign: "left",
              borderBottom: `1px solid ${T.borderSub}`
            }}>
              <div style={{ width: 30, height: 30, borderRadius: T.r4, background: T.bgCard, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={i === currentIdx && playing ? "audioLines" : "music"} size={13} style={{ color: i === currentIdx ? T.text1 : T.text4 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: i === currentIdx ? T.text1 : T.text2, fontWeight: i === currentIdx ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {track.title}
                </div>
                {track.tags?.length > 0 && <div style={{ fontSize: 10, color: T.text4, marginTop: 1 }}>{track.tags.join(", ")}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Player bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 901,
        background: "rgba(6,6,6,0.96)", backdropFilter: "blur(24px) saturate(1.2)",
        WebkitBackdropFilter: "blur(24px) saturate(1.2)",
        borderTop: `1px solid ${T.border}`,
        fontFamily: "Inter, sans-serif", userSelect: "none"
      }}>
        {/* Progress */}
        <div onClick={seekTo} style={{ height: 2, background: "rgba(255,255,255,0.08)", cursor: "pointer", position: "relative" }}>
          <div style={{ height: "100%", width: `${progress * 100}%`, background: "rgba(255,255,255,0.55)", transition: "width 0.3s linear" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px" }}>
          {/* Track info */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: T.r6, background: T.bgCard, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${T.border}` }}>
              <Icon name={playing ? "audioLines" : "music"} size={16} style={{ color: T.text2 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </div>
              <div style={{ fontSize: 10, color: T.text4, marginTop: 1 }}>
                {fmt(duration > 0 ? progress * duration : 0)} / {fmt(duration)}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CtrlBtn onClick={() => setShuffle(!shuffle)} active={shuffle} title="Shuffle"><Icon name="shuffle" size={14} /></CtrlBtn>
            <CtrlBtn onClick={goPrev} title="Previous"><Icon name="skipBack" size={17} /></CtrlBtn>
            <button onClick={togglePlay} style={{
              width: 38, height: 38, borderRadius: "50%",
              background: T.text1, border: "none", color: "#000",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
            }}>
              <Icon name={playing ? "pause" : "play"} size={16} />
            </button>
            <CtrlBtn onClick={goNext} title="Next"><Icon name="skipForward" size={17} /></CtrlBtn>
            <CtrlBtn onClick={() => setRepeat(repeat === "none" ? "all" : repeat === "all" ? "one" : "none")} active={repeat !== "none"} title={`Repeat: ${repeat}`}>
              <Icon name={repeat === "one" ? "repeatOne" : "repeat"} size={14} />
            </CtrlBtn>
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <CtrlBtn onClick={() => { const a = audioRef.current; if (a) { a.muted = !a.muted; setMuted(a.muted); } }} title={muted ? "Unmute" : "Mute"}>
              <Icon name={muted ? "volumeOff" : "volume"} size={14} />
            </CtrlBtn>
            <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
              onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v; }}
              style={{ width: 60, accentColor: "rgba(255,255,255,0.6)", cursor: "pointer" }} />
            <CtrlBtn onClick={() => setShowQueue(!showQueue)} active={showQueue} title="Queue"><Icon name="queue" size={14} /></CtrlBtn>
            <CtrlBtn onClick={onClose} title="Close"><Icon name="x" size={14} /></CtrlBtn>
          </div>
        </div>
      </div>
    </>
  );
}

function CtrlBtn({ onClick, children, active, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "none", border: "none", cursor: "pointer",
      color: active ? T.text1 : T.text3,
      width: 30, height: 30, borderRadius: T.r4,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "color 0.12s"
    }}>
      {children}
    </button>
  );
}
