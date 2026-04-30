/**
 * Agency service — reusable helpers for split calculations and validation.
 *
 * REVENUE SPLIT RULES (PLATFORM 40%):
 * ═══════════════════════════════════════════════════════════════════════
 * 1. Platform ALWAYS takes 40% first (calculated: floor(total * 0.40))
 * 2. Remaining 60% (calculated: total - platformShare) goes to creators
 * 3. If creator has parent agency (with subCreatorAgreed: true):
 *    - Parent receives: percentage% of the 60% creator side
 *    - Creator receives: remainder of the 60% creator side
 * 4. If creator has no parent: creator receives full 60%
 *
 * CALCULATION ORDER (atomic, prevents race conditions):
 * ═══════════════════════════════════════════════════════════════════════
 * Step 1: platformShare = floor(totalCoins * 0.40)          [40%]
 * Step 2: creatorSide = totalCoins - platformShare          [60%]
 * Step 3: agencyShare = floor(creatorSide * percentage/100) [agency's cut from 60%]
 * Step 4: creatorNetShare = creatorSide - agencyShare       [creator's net from 60%]
 *
 * EXAMPLES:
 * ═══════════════════════════════════════════════════════════════════════
 * Example 1 - No agency (100 coins):
 *   total=100 → platform=40 (40%), creator=60 (60%), agency=0
 *
 * Example 2 - With 10% agency (100 coins):
 *   total=100 → platform=40 (40%), agency=6 (10% of 60), creator=54 (remaining 54%)
 *
 * Example 3 - With 30% agency (1000 coins):
 *   total=1000 → platform=400 (40%), agency=180 (30% of 600), creator=420 (remaining 42%)
 *
 * SECURITY NOTES:
 * ═══════════════════════════════════════════════════════════════════════
 * - All calculations done server-side only
 * - Uses atomic DB operations with mongoose sessions
 * - Agency commission requires BOTH: status="active" AND subCreatorAgreed=true
 * - All transaction records stored in CoinTransaction and revenue models
 */

const PLATFORM_RATE = 0.40;
const CREATOR_RATE = 0.60;
const MIN_AGENCY_PERCENTAGE = 5;
const MAX_AGENCY_PERCENTAGE = 30;

/**
 * Calculate split for a monetized transaction.
 *
 * @param {number} totalCoins  - full transaction amount
 * @param {number|null} agencyPercentage - percentage of creator side going to agency (5–30), or null
 * @returns {{ platformShare: number, creatorNetShare: number, agencyShare: number }}
 */
const calculateSplit = (totalCoins, agencyPercentage) => {
  const platformShare = Math.floor(totalCoins * PLATFORM_RATE);
  const creatorSide = totalCoins - platformShare;

  let agencyShare = 0;
  let creatorNetShare = creatorSide;

  if (agencyPercentage && agencyPercentage >= MIN_AGENCY_PERCENTAGE && agencyPercentage <= MAX_AGENCY_PERCENTAGE) {
    agencyShare = Math.floor(creatorSide * (agencyPercentage / 100));
    creatorNetShare = creatorSide - agencyShare;
  }

  return { platformShare, creatorNetShare, agencyShare };
};

/**
 * Validate that an agency percentage is within allowed bounds.
 * @param {number} pct
 * @returns {boolean}
 */
const isValidPercentage = (pct) => {
  const n = Number(pct);
  return Number.isInteger(n) && n >= MIN_AGENCY_PERCENTAGE && n <= MAX_AGENCY_PERCENTAGE;
};

module.exports = {
  calculateSplit,
  isValidPercentage,
  PLATFORM_RATE,
  CREATOR_RATE,
  MIN_AGENCY_PERCENTAGE,
  MAX_AGENCY_PERCENTAGE,
};
