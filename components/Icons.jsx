"use client";

const paths = {
  vault:      <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5V3h8v2M8 11h8"/></>,
  home:       <><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
  star:       <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3z"/>,
  clock:      <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  video:      <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></>,
  image:      <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.6"/><path d="M4 17l5-5 4 4 3-3 4 4"/></>,
  music:      <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  headphones: <><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></>,
  shuffle:    <><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></>,
  repeat:     <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
  repeatOne:  <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><line x1="12" y1="8" x2="12" y2="16"/></>,
  skipBack:   <><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></>,
  skipForward:<><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></>,
  queue:      <><path d="M3 7h14"/><path d="M3 12h14"/><path d="M3 17h10"/><path d="M17 15l4 4-4 4"/></>,
  bookOpen:   <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
  fileText:   <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
  link:       <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></>,
  folder:     <><path d="M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></>,
  drive:      <><path d="M8.4 4h7.2l5 8.7-3.6 6.3H7l-3.6-6.3L8.4 4z"/><path d="M8.4 4l3.6 8.7h8.6"/><path d="M3.4 12.7H12L7 19"/></>,
  settings:   <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a8 8 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L15 6h-6l-.4 3a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 3h6l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2.2-1.5z"/></>,
  logout:     <><path d="M10 4H5v16h5"/><path d="M15 16l4-4-4-4"/><path d="M9 12h10"/></>,
  x:          <><path d="M6 6l12 12"/><path d="M18 6L6 18"/></>,
  menu:       <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
  chevronRight:<path d="M9 5l7 7-7 7"/>,
  chevronLeft: <path d="M15 5l-7 7 7 7"/>,
  chevronUp:   <path d="M18 15l-6-6-6 6"/>,
  chevronDown: <path d="M6 9l6 6 6-6"/>,
  plus:       <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  play:       <path d="M8 5v14l11-7L8 5z"/>,
  pause:      <><path d="M8 5v14"/><path d="M16 5v14"/></>,
  sync:       <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M19 11a7 7 0 0 0-12-4.5L4 9"/><path d="M5 13a7 7 0 0 0 12 4.5L20 15"/></>,
  // View mode icons
  showcase:   <><rect x="3" y="3" width="8" height="11" rx="1"/><rect x="13" y="3" width="8" height="11" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></>,
  grid:       <><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></>,
  compact:    <><rect x="4" y="4" width="4" height="4"/><rect x="10" y="4" width="4" height="4"/><rect x="16" y="4" width="4" height="4"/><rect x="4" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="16" y="10" width="4" height="4"/><rect x="4" y="16" width="4" height="4"/><rect x="10" y="16" width="4" height="4"/><rect x="16" y="16" width="4" height="4"/></>,
  list:       <><path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
  document:   <><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></>,
  file:       <><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/></>,
  alert:      <><path d="M12 3l10 18H2L12 3z"/><path d="M12 9v5"/><path d="M12 18h.01"/></>,
  volume:     <><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18 6a8 8 0 0 1 0 12"/></>,
  volumeOff:  <><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M18 9l-5 5"/><path d="M13 9l5 5"/></>,
  external:   <><path d="M14 4h6v6"/><path d="M10 14L20 4"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></>,
  inbox:      <><path d="M4 4h16l-2 10h-4a2 2 0 0 1-4 0H6L4 4z"/><path d="M4 14v5h16v-5"/></>,
  table:      <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="M9 5v14"/></>,
  audioLines: <><path d="M2 12h2"/><path d="M6 8v8"/><path d="M10 4v16"/><path d="M14 8v8"/><path d="M18 10v4"/><path d="M22 12h-2"/></>,
  pip:        <><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="8" height="5" rx="1" fill="currentColor" stroke="none"/></>,
  download:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  history:    <><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></>,
  sort:       <><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></>,
  addCircle:  <><circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/></>,
  listMusic:  <><path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></>,
};

export default function Icon({ name, size = 16, strokeWidth = 1.8, filled = false, style }) {
  const content = paths[name] || paths.link;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "inline-block", flexShrink: 0, ...style }}
    >
      {content}
    </svg>
  );
}
