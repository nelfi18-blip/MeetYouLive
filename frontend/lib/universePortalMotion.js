/**
 * Cinematic universe portal preview — pure motion model.
 * No app routing, login or production onboarding depends on this file.
 * Deliberately ends in a still, user-controlled carousel.
 */
// Named durations keep the professional sequence legible and reviewable.
// Brand → globe → camera approach → portal ignition → ordered card reveal.
export const PORTAL_TIMELINE_MS = Object.freeze({
  brand: 1500,
  globe: 2800,
  approach: 2600,
  portal: 1800,
  reveal: 4200,
  total: 12900,
});

export const PORTAL_PHASES = Object.freeze([
  "brand", "globe", "approach", "portal", "reveal", "ready",
]);

// Absolute timing avoids overlapping phase callbacks or an accidental
// fast-forward if a screen pauses and resumes during the introduction.
export const PORTAL_CUES_MS = Object.freeze({
  globe: PORTAL_TIMELINE_MS.brand,
  approach: PORTAL_TIMELINE_MS.brand + PORTAL_TIMELINE_MS.globe,
  portal: PORTAL_TIMELINE_MS.brand + PORTAL_TIMELINE_MS.globe + PORTAL_TIMELINE_MS.approach,
  reveal: PORTAL_TIMELINE_MS.brand + PORTAL_TIMELINE_MS.globe +
    PORTAL_TIMELINE_MS.approach + PORTAL_TIMELINE_MS.portal,
  ready: PORTAL_TIMELINE_MS.total,
});

export function getPortalPhase(elapsedMs, reduceMotion = false) {
  if (reduceMotion) return "ready";
  const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (time < PORTAL_CUES_MS.globe) return "brand";
  if (time < PORTAL_CUES_MS.approach) return "globe";
  if (time < PORTAL_CUES_MS.portal) return "approach";
  if (time < PORTAL_CUES_MS.reveal) return "portal";
  if (time < PORTAL_CUES_MS.ready) return "reveal";
  return "ready";
}

export function normalizePortalIndex(index, length) {
  if (!Number.isInteger(index) || !Number.isInteger(length) || length < 1) return 0;
  return ((index % length) + length) % length;
}

/** Signed shortest distance around a circular selector. */
export function getPortalCardOffset(index, selectedIndex, length) {
  if (!Number.isInteger(length) || length < 1) return 0;
  const i = normalizePortalIndex(index, length);
  const selected = normalizePortalIndex(selectedIndex, length);
  let difference = i - selected;
  if (difference > length / 2) difference -= length;
  if (difference < -length / 2) difference += length;
  return difference;
}

export function getPortalCardStyle(index, selectedIndex, length, visible = true) {
  const distance = getPortalCardOffset(index, selectedIndex, length);
  const abs = Math.abs(distance);
  return {
    "--card-distance": distance,
    "--card-depth": abs,
    // A plain length keeps the 3D transform valid on older Android WebView/iOS Safari.
    "--card-x": `${distance * 108}px`,
    "--card-z": `${abs * -110}px`,
    "--card-angle": `${distance * -17}deg`,
    opacity: visible && abs <= 3 ? Math.max(0.18, 1 - abs * 0.23) : 0,
    zIndex: length - abs,
    pointerEvents: visible && abs <= 2 ? "auto" : "none",
  };
}
