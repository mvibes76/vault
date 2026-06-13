"use client";
import Icon from "./Icons";
import { T } from "@/lib/theme";

const TABS = [
  { id: "all",      icon: "home",    label: "All"      },
  { id: "favorites",icon: "star",    label: "Favorites"},
  { id: "search",   icon: "search",  label: "Search"   },
  { id: "continue", icon: "clock",   label: "Watching" },
  { id: "more",     icon: "menu",    label: "More"     },
];

export default function BottomNav({ activeTab, onTab }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 850,
      background: "rgba(6,6,6,0.94)", backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderTop: `1px solid ${T.border}`,
      paddingBottom: "env(safe-area-inset-bottom)",
      display: "flex",
    }}>
      {TABS.map((t) => {
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            style={{
              flex: 1, padding: "9px 0 11px",
              background: "transparent", border: "none",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              color: active ? T.text1 : T.text4,
              cursor: "pointer",
            }}
          >
            <Icon name={t.icon} size={19} filled={active && t.icon === "star"} />
            <span style={{ fontSize: 9.5, fontWeight: active ? 600 : 500, letterSpacing: 0.1 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
