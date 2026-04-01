/**
 * Gift rarity styles and shared constants for GiftEffect and GiftPanel.
 */

export const RARITY_STYLES = {
  common: {
    color: "#94a3b8",
    glow: "rgba(148,163,184,0.45)",
    label: "Común",
    gradient: "linear-gradient(135deg,#475569,#64748b)",
    animationClass: "effect-float",
    overlayOpacity: 0,
    particleCount: 0,
  },
  uncommon: {
    color: "#4ade80",
    glow: "rgba(74,222,128,0.45)",
    label: "Poco común",
    gradient: "linear-gradient(135deg,#16a34a,#4ade80)",
    animationClass: "effect-float",
    overlayOpacity: 0,
    particleCount: 0,
  },
  rare: {
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.5)",
    label: "Raro",
    gradient: "linear-gradient(135deg,#2563eb,#60a5fa)",
    animationClass: "effect-mid",
    overlayOpacity: 0.2,
    particleCount: 10,
  },
  epic: {
    color: "#c084fc",
    glow: "rgba(192,132,252,0.55)",
    label: "Épico",
    gradient: "linear-gradient(135deg,#7c3aed,#c084fc)",
    animationClass: "effect-mid",
    overlayOpacity: 0.35,
    particleCount: 20,
  },
  legendary: {
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.55)",
    label: "Legendario",
    gradient: "linear-gradient(135deg,#d97706,#fbbf24)",
    animationClass: "effect-full",
    overlayOpacity: 0.6,
    particleCount: 40,
  },
  mythic: {
    color: "#f43f5e",
    glow: "rgba(244,63,94,0.6)",
    label: "Mítico",
    gradient: "linear-gradient(135deg,#be123c,#f43f5e)",
    animationClass: "effect-full",
    overlayOpacity: 0.75,
    particleCount: 60,
  },
};
