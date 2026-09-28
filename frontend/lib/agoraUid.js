/**
 * fnv1aHash - deterministic string -> uint32 hash used to derive Agora numeric UIDs.
 *
 * Mirrors backend/src/controllers/agora.controller.js::fnv1aHash exactly, so the
 * frontend can map an Agora remote `uid` back to the MongoDB user that owns it
 * (host or approved guest) without any additional backend round-trip.
 */
export function fnv1aHash(str) {
  let hash = 2166136261;
  const safe = String(str);
  for (let i = 0; i < safe.length; i++) {
    hash ^= safe.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1; // ensure non-zero, matches backend
}
