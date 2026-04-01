/**
 * Shared gift rarity configuration.
 * Single source of truth for rarity colours, labels and animation settings.
 */

export const RARITY_STYLES = {
  common:    { color: "#94a3b8", glow: "rgba(148,163,184,0.35)",  label: "Común"      },
  uncommon:  { color: "#4ade80", glow: "rgba(74,222,128,0.35)",   label: "Poco común" },
  rare:      { color: "#60a5fa", glow: "rgba(96,165,250,0.4)",    label: "Raro"       },
  epic:      { color: "#c084fc", glow: "rgba(192,132,252,0.45)",  label: "Épico"      },
  legendary: { color: "#fbbf24", glow: "rgba(251,191,36,0.45)",   label: "Legendario" },
  mythic:    { color: "#f43f5e", glow: "rgba(244,63,94,0.5)",     label: "Mítico"     },
};

/** Animation intensity config keyed by rarity */
export const RARITY_EFFECT_CFG = {
  common:    { size: "sm",  duration: 2200, fullOverlay: false },
  uncommon:  { size: "sm",  duration: 2800, fullOverlay: false },
  rare:      { size: "md",  duration: 3500, fullOverlay: false },
  epic:      { size: "lg",  duration: 4200, fullOverlay: false },
  legendary: { size: "xl",  duration: 5000, fullOverlay: true  },
  mythic:    { size: "xxl", duration: 6000, fullOverlay: true  },
};

export const getRarityStyle = (rarity) => RARITY_STYLES[rarity] || RARITY_STYLES.common;
export const getRarityEffectCfg = (rarity) => RARITY_EFFECT_CFG[rarity] || RARITY_EFFECT_CFG.common;
