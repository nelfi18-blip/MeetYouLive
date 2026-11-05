/**
 * Country-inspired VCR pilot destinations. Original stylized environments,
 * Original pilot art, not official geospatial replicas or finished photorealistic worlds.
 * Stable IDs map to server-allocated country instances; coordinates are local to each world.
 */
export const VCR_COUNTRIES = Object.freeze([
  { id: "us", code: "US", emoji: "🇺🇸", landmark: "skyline" },
  { id: "fr", code: "FR", emoji: "🇫🇷", landmark: "tower" },
  { id: "jp", code: "JP", emoji: "🇯🇵", landmark: "neon" },
  { id: "ae", code: "AE", emoji: "🇦🇪", landmark: "spire" },
  { id: "br", code: "BR", emoji: "🇧🇷", landmark: "beach" },
  { id: "eg", code: "EG", emoji: "🇪🇬", landmark: "pyramids" },
]);

export function findVcrCountry(id) {
  return VCR_COUNTRIES.find((entry) => entry.id === id) || null;
}
