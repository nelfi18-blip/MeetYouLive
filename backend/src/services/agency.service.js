/**
 * Agency service — reusable helpers for split calculations and validation.
 *
 * FIXED RULE: Platform always takes 40%. Agency percentage comes only from
 * the creator's 60% side. The platform share is never reduced.
 *
 * Example with 10% agency:
 *   total=100 → platform=40, agencyShare=6 (10% of 60), creatorNet=54
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
