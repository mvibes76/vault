// Apple-inspired dark mode design tokens
// Referenced across all components for visual consistency

export const T = {
  // Backgrounds — barely distinguishable from each other, like macOS
  bg:       "#000000",
  bgRaised: "#0d0d0d",
  bgCard:   "#111111",
  bgHover:  "#1a1a1a",
  bgMenu:   "#1c1c1e",   // Apple's exact elevated surface
  bgInput:  "#0d0d0d",

  // Borders — you should barely notice them
  border:    "rgba(255,255,255,0.07)",
  borderHov: "rgba(255,255,255,0.13)",
  borderSub: "rgba(255,255,255,0.04)",

  // Text — hierarchy through opacity, not weight
  text1: "#f5f5f7",                    // Apple primary label dark
  text2: "rgba(235,235,245,0.55)",     // secondary
  text3: "rgba(235,235,245,0.28)",     // tertiary
  text4: "rgba(235,235,245,0.14)",     // quaternary / disabled

  // Single accent — pure white interaction
  accent: "#ffffff",
  accentDim: "rgba(255,255,255,0.55)",

  // Semantic — used sparingly
  green:  "#32d74b",   // Apple green (success, progress)
  blue:   "#0a84ff",   // Apple blue (links, active)
  amber:  "rgba(251,191,36,0.75)",  // favorites — muted amber

  // Radii — Apple uses consistent rounding
  r4:  4,
  r6:  6,
  r10: 10,
  r12: 12,
  r14: 14,
};
