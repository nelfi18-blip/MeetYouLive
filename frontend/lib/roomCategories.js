/**
 * Shared metadata for social room categories.
 * Used by /rooms (listing) and /rooms/[id] (room detail) pages.
 *
 * Visible text (label/description) is NOT stored here — only i18n keys are.
 * This keeps the category IDs stable (they are persisted in MongoDB) while
 * letting the UI render them in the user's active language (ES/EN/PT).
 */
export const ROOM_CATEGORY_META = {
  confianza_amor:   { emoji: "💖", color: "#f472b6", glow: "rgba(244,114,182,0.3)", labelKey: "rooms.categories.confianza_amor.label",   descKey: "rooms.categories.confianza_amor.desc" },
  rompe_hielo:      { emoji: "🔥", color: "#fb923c", glow: "rgba(251,146,60,0.3)",  labelKey: "rooms.categories.rompe_hielo.label",      descKey: "rooms.categories.rompe_hielo.desc" },
  consejos_citas:   { emoji: "💬", color: "#818cf8", glow: "rgba(129,140,248,0.3)", labelKey: "rooms.categories.consejos_citas.label",   descKey: "rooms.categories.consejos_citas.desc" },
  mala_suerte_amor: { emoji: "😅", color: "#34d399", glow: "rgba(52,211,153,0.3)",  labelKey: "rooms.categories.mala_suerte_amor.label", descKey: "rooms.categories.mala_suerte_amor.desc" },
};

export const ROOM_CATEGORY_ORDER = ["confianza_amor", "rompe_hielo", "consejos_citas", "mala_suerte_amor"];

/**
 * Resolve the display title/description for a room.
 *
 * Rooms are currently seeded server-side with fixed Spanish text per
 * category (see backend DEFAULT_ROOMS). For any room whose category is
 * one of the known standard categories, prefer the translated
 * labelKey/descKey so the catalog respects the active language. For
 * unknown/future categories (or rooms without a matching meta entry),
 * fall back to the raw room.title/room.description so custom room text
 * is never overwritten.
 */
export function getRoomDisplayText(room, t) {
  const meta = room && ROOM_CATEGORY_META[room.category];
  if (meta) {
    return { title: t(meta.labelKey), description: t(meta.descKey) };
  }
  return { title: room?.title, description: room?.description };
}
