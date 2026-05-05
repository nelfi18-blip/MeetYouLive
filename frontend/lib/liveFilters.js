/**
 * Frontend safety filters for live streams
 * Ensures only truly active streams are displayed
 */

/**
 * Filter array of lives to include ONLY truly active streams
 * A live is ACTIVE only if:
 * - isLive === true OR status === "live"
 * - AND endedAt is null
 * 
 * Also removes duplicates by _id
 * 
 * @param {Array} lives - Array of live stream objects
 * @returns {Array} - Filtered array with only active lives (no duplicates)
 */
export function filterActiveLives(lives) {
  if (!Array.isArray(lives)) return [];
  
  const safeLives = lives
    .filter((live) => {
      if (!live) return false;
      
      // Active condition: (isLive === true OR status === "live") AND no endedAt
      const isActiveStatus = live.isLive === true || live.status === "live";
      const notEnded = !live.endedAt;
      
      return isActiveStatus && notEnded;
    })
    .filter((live, index, arr) => {
      // Remove duplicates: keep only first occurrence of each _id
      return arr.findIndex((l) => l._id === live._id) === index;
    });
  
  return safeLives;
}
