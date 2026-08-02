/**
 * Frontend safety helpers for live streams.
 * The backend is the source of truth for public Live state; this helper only
 * normalizes list shape and removes duplicate/invalid items for rendering.
 */

/**
 * Normalize backend public-live results and remove duplicates by _id.
 * 
 * @param {Array} lives - Array of live stream objects
 * @returns {Array} - Render-safe backend public live list (no duplicates)
 */
export function filterActiveLives(lives) {
  if (!Array.isArray(lives)) return [];
  
  const seen = new Set();
  return lives.filter((live) => {
    if (!live || !live._id) return false;
    const id = String(live._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
