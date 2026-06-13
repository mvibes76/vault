"use client";
import { useMemo } from "react";
import Icon from "./Icons";
import Thumbnail from "./Thumbnail";
import { typeLabel, mediaCategory } from "@/lib/utils";
import { T } from "@/lib/theme";

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// A single horizontal scroll shelf
function Shelf({ title, items, onOpen, onSeeAll, userData, scraped }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.text1, letterSpacing: -0.2 }}>{title}</span>
        {onSeeAll && (
          <button onClick={onSeeAll} style={{ background: "none", border: "none", color: T.text3, fontSize: 12, cursor: "pointer", padding: "2px 0" }}>
            See all <Icon name="chevronRight" size={12} />
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", padding: "0 16px", WebkitOverflowScrolling: "touch" }}>
        {items.slice(0, 12).map((item) => {
          const progress = userData?.[item.key]?.progress && userData?.[item.key]?.duration
            ? userData[item.key].progress / userData[item.key].duration : 0;
          return (
            <div
              key={item.key}
              onClick={() => onOpen(item)}
              style={{ flexShrink: 0, width: 140, cursor: "pointer" }}
            >
              <div style={{ borderRadius: 8, overflow: "hidden", position: "relative", aspectRatio: "16/9", background: T.bgCard }}>
                <Thumbnail item={item} scraped={scraped?.[item.url]} />
                {progress > 0.02 && (
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(0,0,0,0.4)" }}>
                    <div style={{ height: "100%", width: `${progress * 100}%`, background: T.green, opacity: 0.7 }} />
                  </div>
                )}
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: T.text2, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                {item.title}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Featured hero — first Continue Watching item or first item overall
function Hero({ item, onOpen, scraped }) {
  if (!item) return null;
  return (
    <div
      onClick={() => onOpen(item)}
      style={{ position: "relative", width: "100%", aspectRatio: "16/9", overflow: "hidden", cursor: "pointer" }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <Thumbnail item={item} scraped={scraped} />
      </div>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)"
      }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 16px" }}>
        <div style={{ fontSize: 9, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
          {typeLabel[item.type]}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: T.text1, letterSpacing: -0.3, lineHeight: 1.2 }}>
          {item.title}
        </div>
        {item.note && (
          <div style={{ fontSize: 12, color: T.text3, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.note}
          </div>
        )}
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: T.text1, border: "none", borderRadius: 20, color: "#000", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <Icon name="play" size={12} /> Play
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", border: "none", borderRadius: 20, color: T.text1, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            <Icon name="external" size={12} /> Info
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomeView({ allItems, tabs, userData, scrapedMap, onOpen, onNavigate, isMobile, onQuickAdd }) {
  const continueItems = useMemo(() =>
    allItems.filter((i) => {
      const d = userData?.[i.key];
      return d?.progress > 5 && d?.duration > 0 && d.progress / d.duration < 0.95;
    }).sort((a, b) => new Date(userData[b.key]?.updated_at || 0) - new Date(userData[a.key]?.updated_at || 0)),
  [allItems, userData]);

  const recentItems = useMemo(() => [...allItems].slice(-20).reverse(), [allItems]);

  const videoItems  = useMemo(() => allItems.filter((i) => mediaCategory(i.type) === "Videos"), [allItems]);
  const musicItems  = useMemo(() => allItems.filter((i) => mediaCategory(i.type) === "Music"),  [allItems]);
  const readItems   = useMemo(() => allItems.filter((i) => mediaCategory(i.type) === "Reading"),[allItems]);

  const hero = continueItems[0] || recentItems[0];
  const sharedProps = { onOpen, userData, scraped: scrapedMap };

  // Quick stats
  const totalItems = allItems.length;
  const favCount   = allItems.filter((i) => userData?.[i.key]?.favorite).length;

  return (
    <div style={{ minHeight: "100%", paddingBottom: isMobile ? 80 : 24, fontFamily: "Inter, sans-serif" }}>
      {/* Hero */}
      {hero && <Hero item={hero} onOpen={onOpen} scraped={scrapedMap?.[hero.url]} />}

      {/* Greeting + stats */}
      <div style={{ padding: "20px 16px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: T.text1, letterSpacing: -0.4 }}>{greeting()}</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{totalItems} items · {favCount} saved</div>
        </div>
        <button onClick={onQuickAdd} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: T.text2, cursor: "pointer" }} title="Add to Vault">
          <Icon name="addCircle" size={18} />
        </button>
      </div>

      <div style={{ height: 16 }} />

      {continueItems.length > 0 && (
        <Shelf title="Continue Watching" items={continueItems} onSeeAll={() => onNavigate("continue")} {...sharedProps} />
      )}

      <Shelf title="Recently Added" items={recentItems} onSeeAll={() => onNavigate("all")} {...sharedProps} />

      {videoItems.length > 0 && (
        <Shelf title="Videos" items={videoItems} onSeeAll={() => onNavigate("type:Videos")} {...sharedProps} />
      )}

      {musicItems.length > 0 && (
        <Shelf title="Music" items={musicItems} onSeeAll={() => onNavigate("type:Music")} {...sharedProps} />
      )}

      {readItems.length > 0 && (
        <Shelf title="Reading" items={readItems} onSeeAll={() => onNavigate("type:Reading")} {...sharedProps} />
      )}

      {/* Collections */}
      {tabs.length > 0 && (
        <div style={{ padding: "0 0 8px" }}>
          <div style={{ padding: "0 16px", marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.text1, letterSpacing: -0.2 }}>Collections</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px" }}>
            {tabs.map((t) => (
              <button key={t.name} onClick={() => onNavigate(`tab:${t.name}`)} style={{
                padding: "14px 14px", background: T.bgCard, borderRadius: 10,
                border: `1px solid ${T.border}`, cursor: "pointer", textAlign: "left",
                display: "flex", flexDirection: "column", gap: 4
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: T.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", width: "100%" }}>{t.name}</span>
                <span style={{ fontSize: 10, color: T.text4 }}>{t.items.length} items</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
