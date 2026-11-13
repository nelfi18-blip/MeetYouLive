// Device-only validation of the optional World full-body reference photo.
// Selection NEVER uploads, persists, or invokes any AI provider.
export const WORLD_BODY_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
export const WORLD_BODY_REFERENCE_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);

export function validateWorldBodyReference(file) {
  if (!file || typeof file !== "object") return "missing";
  if (!WORLD_BODY_REFERENCE_TYPES.includes(file.type)) return "invalidType";
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > WORLD_BODY_REFERENCE_MAX_BYTES) return "invalidSize";
  return null;
}
