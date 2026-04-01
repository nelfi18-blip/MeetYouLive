/**
 * Shared rarity style tokens used across gift UI components.
 *
 * Keys match the rarity values in the GiftCatalog model:
 * common | uncommon | rare | epic | legendary | mythic
 */
export const RARITY_STYLES = {
  common:    { borderColor: "rgba(148,163,184,0.35)",  boxShadow: "0 0 12px rgba(148,163,184,0.2)"  },
  uncommon:  { borderColor: "rgba(74,222,128,0.35)",   boxShadow: "0 0 12px rgba(74,222,128,0.25)"  },
  rare:      { borderColor: "rgba(96,165,250,0.4)",    boxShadow: "0 0 14px rgba(96,165,250,0.3)"   },
  epic:      { borderColor: "rgba(192,132,252,0.45)",  boxShadow: "0 0 18px rgba(192,132,252,0.35)" },
  legendary: { borderColor: "rgba(251,191,36,0.45)",   boxShadow: "0 0 22px rgba(251,191,36,0.4)"   },
  mythic:    { borderColor: "rgba(244,63,94,0.5)",     boxShadow: "0 0 26px rgba(244,63,94,0.45)"   },
};
