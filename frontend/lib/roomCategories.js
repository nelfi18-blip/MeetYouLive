/**
 * Shared metadata for social room categories.
 * Used by /rooms (listing) and /rooms/[id] (room detail) pages.
 */
export const ROOM_CATEGORY_META = {
  confianza_amor:   { emoji: "💖", label: "Confianza en el amor",   color: "#f472b6", glow: "rgba(244,114,182,0.3)", desc: "Autoestima, miedos y crecer en el amor" },
  rompe_hielo:      { emoji: "🔥", label: "Rompe el hielo",          color: "#fb923c", glow: "rgba(251,146,60,0.3)",  desc: "Practica conversaciones y supera la timidez" },
  consejos_citas:   { emoji: "💬", label: "Consejos de citas",       color: "#818cf8", glow: "rgba(129,140,248,0.3)", desc: "Consejos reales sobre primeras citas y conexiones" },
  mala_suerte_amor: { emoji: "😅", label: "Mala suerte en el amor",  color: "#34d399", glow: "rgba(52,211,153,0.3)",  desc: "Ríe, desahógate y apóyate con otros" },
};

export const ROOM_CATEGORY_ORDER = ["confianza_amor", "rompe_hielo", "consejos_citas", "mala_suerte_amor"];
