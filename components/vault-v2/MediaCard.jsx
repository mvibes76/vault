"use client";
import { useMemo, useState } from "react";
import Icon from "@/components/Icons";
import SyncBadge from "@/components/SyncBadge";
import { getSourceMeta, getThumbCandidates } from "@/lib/sources";
import { proxiedMediaUrl } from "@/lib/utils";

function pct(data) {
  const p = Number(data?.progress || 0);
  const d = Number(data?.duration || 0);
  return d > 0 ? Math.max(0, Math.min(100, (p / d) * 100)) : 0;
}

export default function MediaCard({ item, state = {}, onOpen }) {
  const source = getSourceMeta(item.url || "");
  const candidates = useMemo(() => {
    const list = [item.thumbnail, ...getThumbCandidates(item.url || "")].filter(Boolean);
    return [...new Set(list)];
  }, [item.thumbnail, item.url]);
  const [index, setIndex] = useState(0);
  const thumb = candidates[index] ? proxiedMediaUrl(candidates[index]) : "";
  const progress = pct(state);

  return (
    <article className="v2-card">
      <button
        type="button"
        className="v2-card-button"
        onClick={() => onOpen(item)}
        aria-label={`Open ${item.title || "media"}`}
      >
        <div className="v2-art">
          <div className="v2-art-fallback"><Icon name={item.type === "image" ? "grid" : "play"} size={28} /></div>
          {thumb ? (
            <img
              src={thumb}
              alt={item.title ? `${item.title} cover` : ""}
              loading="lazy"
              decoding="async"
              onError={() => setIndex((i) => i + 1)}
            />
          ) : null}
          <div className="v2-art-shade" />
          <div className="v2-playbubble"><Icon name="play" size={17} filled /></div>
          {state.favorite ? <div className="v2-favbadge" aria-label="Favorite"><Icon name="star" size={15} filled /></div> : null}
          <SyncBadge entityKey={item.key} style={{ left: 10, right: "auto", top: 10, bottom: "auto" }} />
        </div>
        <div className="v2-card-meta">
          <div className="v2-card-title" title={item.title || item.url}>{item.title || item.url}</div>
          <div className="v2-card-sub">
            <span>{source.name}</span>
            {state.rating ? <><span className="v2-dot" /><span>★ {state.rating}</span></> : null}
            {item.folder || state.folder ? <><span className="v2-dot" /><span>{item.folder || state.folder}</span></> : null}
          </div>
          {progress > 0 ? <div className="v2-progress" aria-label={`${Math.round(progress)}% complete`}><span style={{ width: `${progress}%` }} /></div> : null}
        </div>
      </button>
    </article>
  );
}
