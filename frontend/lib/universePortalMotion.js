/**
 * Cinematic universe portal preview — pure motion model.
 * No app routing, login or production onboarding depends on this file.
 * Deliberately ends in a still, user-controlled carousel.
 */
// Named durations keep the professional sequence legible and reviewable.
// Brand → globe → camera approach → portal ignition → ordered card reveal.
export const PORTAL_TIMELINE_MS = Object.freeze({
  brand: 1000,
  globe: 1600,
  approach: 1700,
  portal: 1400,
  reveal: 1500,
  orbit: 7300,
  total: 14500,
});

// A full turn, returning to World. Motion ends rather than looping without consent.
export const PORTAL_ORBIT_STEP_MS = 940;
export const PORTAL_ORBIT_STEPS = 7;

export const PORTAL_PHASES = Object.freeze([
  "brand", "globe", "approach", "portal", "reveal", "orbit", "ready",
]);

// Absolute timing avoids overlapping phase callbacks or an accidental
// fast-forward if a screen pauses and resumes during the introduction.
export const PORTAL_CUES_MS = Object.freeze({
  globe: PORTAL_TIMELINE_MS.brand,
  approach: PORTAL_TIMELINE_MS.brand + PORTAL_TIMELINE_MS.globe,
  portal: PORTAL_TIMELINE_MS.brand + PORTAL_TIMELINE_MS.globe + PORTAL_TIMELINE_MS.approach,
  reveal: PORTAL_TIMELINE_MS.brand + PORTAL_TIMELINE_MS.globe +
    PORTAL_TIMELINE_MS.approach + PORTAL_TIMELINE_MS.portal,
  orbit: PORTAL_TIMELINE_MS.brand + PORTAL_TIMELINE_MS.globe +
    PORTAL_TIMELINE_MS.approach + PORTAL_TIMELINE_MS.portal + PORTAL_TIMELINE_MS.reveal,
  ready: PORTAL_TIMELINE_MS.total,
});

export function getPortalPhase(elapsedMs, reduceMotion = false) {
  if (reduceMotion) return "ready";
  const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (time < PORTAL_CUES_MS.globe) return "brand";
  if (time < PORTAL_CUES_MS.approach) return "globe";
  if (time < PORTAL_CUES_MS.portal) return "approach";
  if (time < PORTAL_CUES_MS.reveal) return "portal";
  if (time < PORTAL_CUES_MS.orbit) return "reveal";
  if (time < PORTAL_CUES_MS.ready) return "orbit";
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

/**
 * Hero-card carousel position model. World and every other experience use
 * the SAME tall glass-card geometry. The selected card dominates the center;
 * adjacent cards form the curved, swipeable portal from the approved concept.
 * No autoplay after the entrance sequence. The hidden cards stay in the loop.
 */
export function getPortalVisualPose(index, selectedIndex, length) {
  const distance = getPortalCardOffset(index, selectedIndex, length);
  const abs = Math.abs(distance);
  const side = Math.sign(distance);
  const x = abs === 0 ? 0 : side * (119 + (abs - 1) * 75);
  const y = abs === 0 ? -5 : 19 + (abs - 1) * 11;
  const scale = abs === 0 ? 1 : abs === 1 ? .79 : abs === 2 ? .65 : .54;
  return {
    x, y, z: abs === 0 ? 90 : -35 - abs * 65,
    rotate: abs === 0 ? 0 : side * -17,
    scale, opacity: abs <= 2 ? 1 : abs === 3 ? .48 : 0,
    zIndex: 10 - abs,
  };
}
