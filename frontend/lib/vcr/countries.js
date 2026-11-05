/**
 * Country-inspired VCR pilot destinations. Original stylized environments,
 * NOT official geospatial replicas or live multiplayer country instances.
 * Stable IDs keep the eventual server-side location/presence model extensible.
 */
export const VCR_COUNTRIES = Object.freeze([
  { id: "us", code: "US", x: 0, z: 0, emoji: "🇺🇸", sky: 0x98b7d1, fog: 0xb5c7d9, landmark: "skyline" },
  { id: "fr", code: "FR", x: 44, z: 0, emoji: "🇫🇷", sky: 0xb1b7d4, fog: 0xc6bfd2, landmark: "tower" },
  { id: "jp", code: "JP", x: 44, z: -44, emoji: "🇯🇵", sky: 0x434e86, fog: 0x6a719b, landmark: "neon" },
  { id: "ae", code: "AE", x: -44, z: -44, emoji: "🇦🇪", sky: 0xe0be99, fog: 0xcab5a0, landmark: "spire" },
  { id: "br", code: "BR", x: -88, z: 44, emoji: "🇧🇷", sky: 0x93cccf, fog: 0xb9d2c5, landmark: "beach" },
  { id: "eg", code: "EG", x: 88, z: 88, emoji: "🇪🇬", sky: 0xd7b88d, fog: 0xd8c4a3, landmark: "pyramids" },
]);

export function findVcrCountry(id) {
  return VCR_COUNTRIES.find((entry) => entry.id === id) || null;
}
