"use client";
import Icon from "./Icons";
import { T } from "@/lib/theme";

const TABS = [
  { id: "home",      icon: "home",      label: "Home"    },
  { id: "browse",    icon: "grid",      label: "Browse"  },
  { id: "search",    icon: "audioLines",label: "Search"  },
  { id: "continue",  icon: "clock",     label: "Watching"},
  { id: "more",      icon: "menu",      label: "More"    },
];

export default function BottomNav({ activeTab, onTab, musicOpen }) {
  const extraBottom = musicOpen ? 68 : 0;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 850,
      background: "rgba(6,6,6,0.94)", backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderTop: `1px solid ${T.border}`,
      paddingBottom: `calc(env(safe-area-inset-bottom) + ${extraBottom}px)`,
      fontFamily: "Inter, sans-serif"
    }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTab(tab.id)}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 4, padding: "10px 4px 8px",
                background: "none", border: "none", cursor: "pointer",
                color: active ? T.text1 : T.text4,
                transition: "color 0.12s", minHeight: 56
              }}
            >
              <Icon name={tab.icon} size={22} strokeWidth={active ? 2 : 1.6} />
              <span style={{ fontSize: 9.5, fontWeight: active ? 600 : 400, letterSpacing: 0.2 }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
