"use client";
import { useMemo } from "react";
import Icon from "./Icons";
import { mediaCategory } from "@/lib/utils";
import { T } from "@/lib/theme";

const TYPE_SECTIONS = [
  { id: "type:Videos",  icon: "video",    label: "Videos"  },
  { id: "type:Photos",  icon: "image",    label: "Photos"  },
  { id: "type:Music",   icon: "music",    label: "Music"   },
  { id: "type:Social",   icon: "link",     label: "Social"   },
  { id: "type:Links",   icon: "link",     label: "Links"   },
];

export default function BrowseView({ allItems, tabs, folders, userData, onNavigate, isMobile }) {
  const counts = useMemo(() => {
    const c = {};
    TYPE_SECTIONS.forEach(({ id }) => {
      c[id] = allItems.filter((i) => mediaCategory(i.type) === id.slice(5)).length;
    });
    tabs.forEach((t) => { c[`tab:${t.name}`] = t.items.length; });
    folders.forEach((f) => { c[`folder:${f.name}`] = allItems.filter((i) => userData?.[i.key]?.folder === f.name).length; });
    return c;
  }, [allItems, tabs, folders, userData]);

  return (
    <div style={{ padding: isMobile ? "16px 14px" : "24px", fontFamily: "Inter, sans-serif", paddingBottom: isMobile ? 96 : 32 }}>

      {/* Media types */}
      <Section label="Media Types">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {TYPE_SECTIONS.map(({ id, icon, label }) => {
            const count = counts[id] || 0;
            if (count === 0) return null;
            return (
              <TypeTile key={id} icon={icon} label={label} count={count} onClick={() => onNavigate(id)} />
            );
          })}
        </div>
      </Section>

      {/* Collections */}
      {tabs.length > 0 && (
        <Section label="Collections">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {tabs.map((t) => (
              <CollectionTile key={t.name} name={t.name} count={t.items.length} items={t.items} onClick={() => onNavigate(`tab:${t.name}`)} />
            ))}
          </div>
        </Section>
      )}

      {/* My Lists */}
      {folders.length > 0 && (
        <Section label="My Lists">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {folders.map((f) => (
              <TypeTile key={f.name} icon="listMusic" label={f.name} count={counts[`folder:${f.name}`] || 0} onClick={() => onNavigate(`folder:${f.name}`)} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.text4, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function TypeTile({ icon, label, count, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "16px 14px", background: T.bgCard,
      border: `1px solid ${T.border}`, borderRadius: 12,
      cursor: "pointer", textAlign: "left", width: "100%",
      transition: "border-color 0.15s"
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = T.borderHov}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = T.border}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon} size={17} style={{ color: T.text2 }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text1 }}>{label}</div>
        <div style={{ fontSize: 11, color: T.text4, marginTop: 1 }}>{count} items</div>
      </div>
    </button>
  );
}

function CollectionTile({ name, count, items, onClick }) {
  // Show first letter of collection name as cover art
  const letter = name[0]?.toUpperCase() || "?";
  const hue = Math.abs([...name].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % 360;

  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "14px 14px", background: T.bgCard,
      border: `1px solid ${T.border}`, borderRadius: 12,
      cursor: "pointer", textAlign: "left", width: "100%",
      transition: "border-color 0.15s"
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = T.borderHov}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = T.border}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `hsl(${hue},14%,12%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 300, color: `hsl(${hue},30%,50%)` }}>{letter}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 11, color: T.text4, marginTop: 1 }}>{count} items</div>
      </div>
    </button>
  );
}
