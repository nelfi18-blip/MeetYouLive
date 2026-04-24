/**
 * Commission split calculation.
 *
 * Business rule: platform always takes 40% (fixed).
 * Agency percentage applies only to the creator-side 60%.
 *
 * Example (100 coins, 20% agency):
 *   platform = 40, creatorSide = 60
 *   agency   = floor(60 * 0.20) = 12
 *   creator  = 60 - 12 = 48
 *
 * @param {number} total      Total coins in the transaction
 * @param {number} agencyPct  Agency commission percentage (5–30)
 * @returns {{ platform: number, agency: number, creator: number }}
 */
export function calcSplit(total, agencyPct) {
  const platform = Math.floor(total * 0.40);
  const creatorSide = total - platform;
  const agency = Math.floor(creatorSide * (agencyPct / 100));
  const creator = creatorSide - agency;
  return { platform, agency, creator };
}
