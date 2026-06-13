"use client";
import { getYouTubeId, getGDriveId, proxiedMediaUrl, typeColor, typeLabel } from "@/lib/utils";
import Icon from "./Icons";
import { T } from "@/lib/theme";

export default function Thumbnail({ item, scraped }) {
  const { type, url, title } = item;
  const ytId = type === "youtube" ? getYouTubeId(url) : null;
  const gdId = type === "gdrive" ? getGDriveId(url) : null;
  const color = typeColor[type] || "#374151";

  if (type === "youtube" && ytId) {
    return (
      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000" }}>
        <img
          src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
          alt={title}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <PlayOverlay color="rgba(255,0,0,0.85)" />
      </div>
    );
  }

  if (type === "image") {
    return (
      <div style={{ width: "100%", paddingTop: "62%", position: "relative", overflow: "hidden", background: T.bgCard }}>
        <img
          src={proxiedMediaUrl(url)} alt={title}
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  if (type === "gdrive" && gdId) {
    return (
      <div style={{ width: "100%", paddingTop: "62%", position: "relative", overflow: "hidden", background: T.bgCard }}>
        <img
          src={`https://drive.google.com/thumbnail?id=${gdId}&sz=w400`}
          alt={title}
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  if (scraped?.image) {
    return (
      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: T.bgCard }}>
        <img
          src={proxiedMediaUrl(scraped.image)} alt={title}
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {scraped.video && <PlayOverlay color="rgba(0,0,0,0.7)" />}
      </div>
    );
  }

  // Type-specific icon fallback
  const iconMap = {
    facebook:"link", instagram:"image", tiktok:"video", twitter:"link",
    reddit:"link", vimeo:"video", video:"video",
    audio:"headphones", music:"music", gallery:"grid",
    "gdrive-folder":"folder", link:"link", unknown:"link"
  };

  const isMusic = ["audio","music"].includes(type);
  const bg = isMusic ? "linear-gradient(135deg, #2a0a1f, #4a0a35)" : T.bgRaised;
  const iconName = iconMap[type];

  if (iconName) {
    return (
      <div style={{ width:"100%", paddingTop:"56.25%", position:"relative", background: bg }}>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Icon name={iconName} size={28} style={{ color:"rgba(235,235,245,0.25)" }} />
        </div>
      </div>
    );
  }

  return <LetterCover title={title} />;
}

const PlayOverlay = ({ color }) => (
  <div style={{
    position: "absolute", inset: 0, display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.12)"
  }}>
    <div style={{
      width: 46, height: 46, borderRadius: "50%", background: color,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="white">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    </div>
  </div>
);


// Deterministic letter cover — uniform placeholder for any item without a natural thumbnail
function LetterCover({ title }) {
  const word  = title?.split(" ")[0] || "?";
  const letter= word[0]?.toUpperCase() || "?";
  const hash  = Math.abs([...title || ""].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0));
  const hue   = hash % 360;
  const bg    = `hsl(${hue}, 14%, 10%)`;
  const fg    = `hsl(${hue}, 30%, 48%)`;
  return (
    <div style={{ width: "100%", paddingTop: "56.25%", position: "relative", background: bg }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 44, fontWeight: 300, color: fg, lineHeight: 1, userSelect: "none", fontFamily: "Inter, sans-serif" }}>
          {letter}
        </span>
      </div>
    </div>
  );
}

const centerStyle = {
  position: "absolute", inset: 0, display: "flex",
  flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: 8
};
