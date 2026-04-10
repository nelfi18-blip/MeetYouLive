/**
 * Calculate a compatibility score between two users based on shared interests
 * and intent similarity.
 *
 * Score breakdown:
 *   - Up to 80 points: Jaccard-like interest overlap
 *     (sharedInterests / totalUniqueInterests) * 80
 *   - Up to 20 points: bonus when both users share the same intent
 *
 * Returns { compatibilityScore: number, sharedInterests: string[] }
 */
function calculateCompatibility(myInterests, myIntent, theirInterests, theirIntent) {
  const mine = myInterests || [];
  const theirs = theirInterests || [];

  const shared = mine.filter((i) => theirs.includes(i));
  const totalUnique = new Set([...mine, ...theirs]).size;
  const interestScore = totalUnique > 0 ? (shared.length / totalUnique) * 80 : 0;
  const intentBonus = myIntent && theirIntent && myIntent === theirIntent ? 20 : 0;
  const compatibilityScore = Math.round(Math.min(100, interestScore + intentBonus));

  return { compatibilityScore, sharedInterests: shared };
}

module.exports = { calculateCompatibility };
