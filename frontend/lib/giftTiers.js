/**
 * Gift Tier Classification Utilities
 * 
 * Shared logic for determining gift tiers based on type field or coin cost.
 * Used consistently across frontend and backend for gift categorization.
 */

// Tier boundaries based on coin cost
export const TIER_BOUNDARIES = {
  BASIC_MAX: 100,      // Basic tier: 0-100 coins
  PREMIUM_MAX: 500,    // Premium tier: 101-500 coins
  // Super tier: 501+ coins
};

/**
 * Determine the gift tier from a gift object
 * @param {Object} gift - Gift object with optional type, coinCost, and isSuper fields
 * @returns {"basic" | "premium" | "super"} - The gift tier
 */
export function getGiftTier(gift) {
  // Use explicit type field if present
  if (gift.type) {
    return gift.type;
  }
  
  // Fallback to coin cost boundaries
  if (gift.coinCost) {
    if (gift.coinCost > TIER_BOUNDARIES.PREMIUM_MAX) return "super";
    if (gift.coinCost > TIER_BOUNDARIES.BASIC_MAX) return "premium";
    return "basic";
  }
  
  // Legacy fallback using isSuper flag
  return gift.isSuper ? "super" : "basic";
}

/**
 * Check if a gift belongs to a specific tier
 * @param {Object} gift - Gift object
 * @param {"basic" | "premium" | "super"} tier - Tier to check
 * @returns {boolean}
 */
export function isGiftTier(gift, tier) {
  return getGiftTier(gift) === tier;
}

/**
 * Filter gifts by tier
 * @param {Array} gifts - Array of gift objects
 * @param {"basic" | "premium" | "super"} tier - Tier to filter by
 * @returns {Array} - Filtered gifts
 */
export function filterGiftsByTier(gifts, tier) {
  return gifts.filter(gift => getGiftTier(gift) === tier);
}
