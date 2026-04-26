/**
 * Gift bundle configuration and helpers.
 * Discount rates must match BUNDLE_DISCOUNTS in backend/src/controllers/gift.controller.js.
 */

export const BUNDLE_CONFIG = {
  10: { emoji: "🔥", label: "Popular",    discountPct: 10 },
  50: { emoji: "⚡", label: "Mejor valor", discountPct: 20 },
};

/** Returns the discounted total coins for a given unitCost × qty. */
export const bundleTotal = (unitCost, qty) => {
  const disc = BUNDLE_CONFIG[qty]?.discountPct ?? 0;
  return Math.floor(unitCost * qty * (1 - disc / 100));
};

/** Returns the coin savings for a bundle compared to buying individually. */
export const bundleSavings = (unitCost, qty) =>
  unitCost * qty - bundleTotal(unitCost, qty);
