const User = require("../models/User.js");

// ---------------------------------------------------------------------------
// Platform-wide cap on the purchasable `coins` wallet (User.coins).
//
// Stripe requires that no user can hold more than USD $2,000 worth of coins
// at any given time. The current coin economy has NO single USD/coin rate
// (packages range from $0.0285/coin to $0.0499/coin — see
// coins.controller.js COIN_PACKAGES), so the cap is sized using the most
// expensive package rate (Starter Pack, $0.0499/coin) to stay conservative
// regardless of how the balance was accumulated (purchase, reward, refund,
// referral, etc.):
//
//   40,000 coins x $0.0499/coin = $1,996.00 USD < $2,000 USD
//
// IMPORTANT: this cap applies ONLY to the purchasable `coins` wallet. It
// must NEVER be applied to `earningsCoins`, `agencyEarningsCoins`,
// `totalAgencyGeneratedCoins`, or any other creator/agency payout balance —
// those are distinct balances outside the scope of this requirement.
// ---------------------------------------------------------------------------
const MAX_USER_COINS_BALANCE = 40000;

/**
 * Returns how many of `amount` coins can still be credited to a wallet
 * currently holding `currentCoins`, without the result exceeding
 * MAX_USER_COINS_BALANCE. Always between 0 and `amount`.
 */
function amountThatFits(currentCoins, amount) {
  const current = Number(currentCoins) || 0;
  const requested = Math.max(0, Math.trunc(Number(amount) || 0));
  if (requested <= 0) return 0;
  return Math.max(0, Math.min(requested, MAX_USER_COINS_BALANCE - current));
}

/**
 * Returns true when crediting `amount` coins to a wallet currently holding
 * `currentCoins` would NOT be reduced/capped, i.e. the full amount fits
 * under MAX_USER_COINS_BALANCE. Used for pre-flight checks (e.g. before
 * creating a Stripe Checkout session) so we never charge a user for coins
 * that cannot be credited in full.
 */
function fitsWithinCap(currentCoins, amount) {
  const requested = Math.max(0, Math.trunc(Number(amount) || 0));
  return amountThatFits(currentCoins, requested) === requested;
}

/**
 * Atomically credits up to `amount` coins to a user's purchasable `coins`
 * wallet, guaranteeing the resulting balance never exceeds
 * MAX_USER_COINS_BALANCE.
 *
 * Enforcement is done with a single MongoDB update pipeline
 * (`findOneAndUpdate` with an aggregation-pipeline update). Single-document
 * updates are always atomic in MongoDB, so this is race-safe even under
 * concurrent callers (duplicate webhook deliveries, simultaneous purchases,
 * rewards, refunds, etc.) with or without an external session/transaction.
 *
 * Returns:
 *   {
 *     userFound: boolean,      // false when the user document does not exist
 *     requested: number,       // amount originally requested (>= 0)
 *     credited: number,        // amount actually applied (0 <= credited <= requested)
 *     capped: boolean,         // true when credited < requested (cap reached)
 *     previousCoins: number|null,
 *     newCoins: number|null,   // previousCoins + credited
 *   }
 *
 * IMPORTANT: never call this for `earningsCoins`/`agencyEarningsCoins`
 * /`totalAgencyGeneratedCoins` — it only ever touches `coins`.
 */
async function creditCoinsWithCap(userId, amount, { session } = {}) {
  const requested = Math.max(0, Math.trunc(Number(amount) || 0));

  if (requested <= 0) {
    const user = await User.findById(userId).select("coins").session(session || null);
    const coins = user ? user.coins || 0 : null;
    return {
      userFound: Boolean(user),
      requested: 0,
      credited: 0,
      capped: false,
      previousCoins: coins,
      newCoins: coins,
    };
  }

  // Single atomic find-and-modify: the credited amount is computed from the
  // document's *current* `coins` value at the moment MongoDB applies the
  // update, so this is race-safe without needing a separate read beforehand.
  const before = await User.findOneAndUpdate(
    { _id: userId },
    [
      {
        $set: {
          coins: {
            $add: [
              { $ifNull: ["$coins", 0] },
              {
                $max: [
                  0,
                  {
                    $min: [
                      requested,
                      { $subtract: [MAX_USER_COINS_BALANCE, { $ifNull: ["$coins", 0] }] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    ],
    { new: false, session }
  ).select("coins");

  if (!before) {
    return {
      userFound: false,
      requested,
      credited: 0,
      capped: false,
      previousCoins: null,
      newCoins: null,
    };
  }

  const previousCoins = before.coins || 0;
  const credited = amountThatFits(previousCoins, requested);
  const newCoins = previousCoins + credited;

  return {
    userFound: true,
    requested,
    credited,
    capped: credited < requested,
    previousCoins,
    newCoins,
  };
}

module.exports = {
  MAX_USER_COINS_BALANCE,
  amountThatFits,
  fitsWithinCap,
  creditCoinsWithCap,
};
