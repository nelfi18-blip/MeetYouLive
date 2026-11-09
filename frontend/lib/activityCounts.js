// Counts are trusted only when the activity endpoint returned all actual
// non-negative integer values. Missing data must never become fake activity.
export const ACTIVITY_COUNT_KEYS = Object.freeze([
  "onlineCount", "activeLivesCount", "likesToday", "boostActiveCount",
]);

export function normalizeActivityCounts(data) {
  if (!data || typeof data !== "object") return null;
  if (!ACTIVITY_COUNT_KEYS.every((key) => Number.isSafeInteger(data[key]) && data[key] >= 0)) return null;
  return Object.fromEntries(ACTIVITY_COUNT_KEYS.map((key) => [key, data[key]]));
}
