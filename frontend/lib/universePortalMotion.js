/**
 * Cinematic universe portal preview — pure motion model.
 * No app routing, login or production onboarding depends on this file.
 * Deliberately ends in a still, user-controlled carousel.
 */
export const PORTAL_TIMELINE_MS = Object.freeze({
  globe: 3200,
  approach: 3300,
  reveal: 4000,
  total: 10500,
});

export const PORTAL_PHASES = Object.freeze(["globe", "approach", "reveal", "ready"]);

export function getPortalPhase(elapsedMs, reduceMotion = false) {
  if (reduceMotion) return "ready";
  const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (time < PORTAL_TIMELINE_MS.globe) return "globe";
  if (time < PORTAL_TIMELINE_MS.globe + PORTAL_TIMELINE_MS.approach) return "approach";
  if (time < PORTAL_TIMELINE_MS.total) return "reveal";
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
