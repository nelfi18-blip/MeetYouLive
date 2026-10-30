"use strict";

/**
 * Admin-only, read-only COIN ECONOMY CONTROL diagnostic for MeetYouLive
 * Technologies LLC.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * ─────────────────────────────────────────────────────────────────────────
 * This is a financial RISK diagnostic, not a new accounting system and not
 * a tax filing. It complements (and never duplicates) the existing monthly
 * (adminMonthlyFinancialReport.service.js) and annual
 * (adminAnnualFinancialReport.service.js) reports: those compute Stripe
 * charges/fees and period payouts; THIS service answers a narrower
 * question — "of the Coins currently sitting in `User.coins`/
 * `User.earningsCoins`, how much is backed by verifiable purchase/reward
 * evidence in MongoDB, and how much (admin adjustments, legacy data)
 * requires manual reconciliation before any future net-revenue
 * calculation can safely rely on it?"
 *
 * This service NEVER writes to MongoDB or Stripe, never credits/debits
 * coins, never creates/updates Payout or WithdrawalRequest documents, and
 * never changes the 60/40 split, the withdrawal conversion rate, or any
 * balance. It only reads already-stored documents.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY "CURRENT BALANCE", NOT "LIFETIME GROSS CREDITED"
 * ─────────────────────────────────────────────────────────────────────────
 * `User.coins`/`User.earningsCoins` are running balances: they go up when
 * Coins are credited and down when they are spent/withdrawn. This service
 * reports the CURRENT snapshot of those fields (`coinsBalance`,
 * `creatorEarnings`) separately from the historical CREDIT evidence found
 * in `CoinTransaction` (`purchaseCredits`, `rewardCredits`,
 * `adminAdjustments`). The two are intentionally NEVER reconciled into a
 * single "verified vs. unverified" percentage here: `CoinTransaction` only
 * records credits/debits since each feature started logging them, while
 * `User.coins` may include coins from earlier, unlogged code paths. Any
 * gap between the two is therefore a DATA GAP to flag, never a figure to
 * compute and present as fact.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PURCHASE PROVIDER ATTRIBUTION (read-only evidence, never inferred)
 * ─────────────────────────────────────────────────────────────────────────
 * `CoinTransaction` has no dedicated `provider`/`paymentProvider` field.
 * Provider is attributed ONLY from stored metadata evidence already
 * written by the crediting code path:
 *   - `metadata.platform === "google_play"` → Google Play Billing
 *     (googlePlayPurchase.controller.js).
 *   - `metadata.stripeSessionId` present (and platform is not Google
 *     Play) → Stripe Checkout (payment.controller.js).
 *   - Neither present → `unknown` — NEVER guessed as Stripe or any other
 *     provider. Future payment providers must add their own metadata tag
 *     to be attributed here instead of falling into `unknown`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ADMIN ADJUSTMENTS — NO DEDICATED "PROMOTIONAL GRANT" TYPE TODAY
 * ─────────────────────────────────────────────────────────────────────────
 * `CoinTransaction.type === "admin_adjustment"` is currently used ONLY by
 * withdraw.controller.js to reserve coins when a withdrawal is requested
 * (negative amount, `metadata.withdrawalId` set) and to refund them if the
 * withdrawal is rejected (positive amount, `metadata.withdrawalId` set).
 * There is currently NO separate code path that grants promotional/
 * manually-adjusted Coins — so every `admin_adjustment` record found today
 * is withdrawal-related. This service still splits the type into
 * `withdrawalRelated` (metadata.withdrawalId present) vs. `other` (absent)
 * so that if/when a genuine promotional-grant code path is added, it
 * surfaces here automatically without further changes, and so the UI
 * never has to assume `other === 0` means "no promotional grants exist" —
 * it means "none were found with the evidence available today".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PAYOUT vs. WITHDRAWAL REQUEST — NEVER SUMMED
 * ─────────────────────────────────────────────────────────────────────────
 * Same rule as the monthly/annual reports: `Payout` and `WithdrawalRequest`
 * are independent models with no shared reference. Their totals are never
 * added together here, to avoid double-counting the same physical
 * withdrawal obligation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HISTORICAL CONVERSION REFERENCE — NOT A NEW NET FIGURE
 * ─────────────────────────────────────────────────────────────────────────
 * `creatorEarnings.estimatedUsdAtHistoricalRate` applies the EXISTING
 * 1 Coin = $0.10 conversion (the same constant used by
 * withdraw.controller.js/creator.controller.js) purely as a reference so
 * admins can see today's `earningsCoins` balance in USD terms. It is
 * NEVER the future 60/40 net-of-commission calculation, never a tax
 * figure, and never presented as money actually collected or settled.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS SERVICE DOES NOT KNOW (always surfaced in `dataGaps`)
 * ─────────────────────────────────────────────────────────────────────────
 * It never has, and never fabricates: settled/net revenue after payment
 * processor fees, taxes or withholding, refund/chargeback rates against
 * Coins already spent, per-currency conversion for non-USD purchases, or
 * Google Play's actual settled payout to the company. See `dataGaps`.
 */

const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const Payout = require("../models/Payout.js");
const WithdrawalRequest = require("../models/WithdrawalRequest.js");

// Same historical reference rate used across the codebase (1 coin = $0.10).
const COINS_PER_USD = 10;

const REWARD_TYPES = ["daily_reward", "referral_reward", "mission_reward"];

/**
 * Logs the full error server-side but returns only a sanitized, non-
 * sensitive shape to the client — mirrors
 * adminMonthlyFinancialReport.service.js's sanitizeError.
 */
function sanitizeError(scope, err) {
  // eslint-disable-next-line no-console
  console.error(`adminCoinEconomyControl.${scope} error:`, err);
  return {
    scope,
    type: typeof err?.type === "string" ? err.type : null,
    code: typeof err?.code === "string" || typeof err?.code === "number" ? err.code : null,
  };
}

function unavailable(scope, err) {
  return {
    available: false,
    reason: "query_failed",
    message: `No se pudo obtener ${scope}; detalle registrado en el servidor`,
    ...sanitizeError(scope, err),
  };
}

/**
 * Current `User.coins`/`earningsCoins`/`agencyEarningsCoins` balances —
 * a point-in-time snapshot, never a historical/period total.
 */
async function getCoinsBalanceSnapshot() {
  try {
    const [agg] = await User.aggregate([
      {
        $group: {
          _id: null,
          totalCoins: { $sum: "$coins" },
          totalEarningsCoins: { $sum: "$earningsCoins" },
          totalAgencyEarningsCoins: { $sum: "$agencyEarningsCoins" },
          usersWithCoins: { $sum: { $cond: [{ $gt: ["$coins", 0] }, 1, 0] } },
          usersWithEarnings: { $sum: { $cond: [{ $gt: ["$earningsCoins", 0] }, 1, 0] } },
        },
      },
    ]);
    const totals = agg || {
      totalCoins: 0,
      totalEarningsCoins: 0,
      totalAgencyEarningsCoins: 0,
      usersWithCoins: 0,
      usersWithEarnings: 0,
    };
    return {
      available: true,
      asOfNow: true,
      totalCoins: totals.totalCoins || 0,
      totalEarningsCoins: totals.totalEarningsCoins || 0,
      totalAgencyEarningsCoins: totals.totalAgencyEarningsCoins || 0,
      usersWithCoins: totals.usersWithCoins || 0,
      usersWithEarnings: totals.usersWithEarnings || 0,
      source: "User.coins / User.earningsCoins / User.agencyEarningsCoins (current stored balances)",
      note:
        "Saldo actual (snapshot), no un total histórico bruto acreditado: no distingue cuánto de este saldo ya fue " +
        "gastado, retirado o proviene de compras, recompensas o ajustes administrativos.",
    };
  } catch (err) {
    return unavailable("getCoinsBalanceSnapshot", err);
  }
}

/**
 * Purchase Coins credits (`CoinTransaction.type=purchase`,
 * `status=completed`), grouped by provider EVIDENCE found in stored
 * metadata only (see module doc). Lifetime totals (no period filter) —
 * this is a balance-backing diagnostic, not a monthly/annual report.
 */
async function getPurchaseCreditsByProvider() {
  try {
    const rows = await CoinTransaction.aggregate([
      { $match: { type: "purchase", status: "completed" } },
      {
        $project: {
          amount: 1,
          provider: {
            $cond: [
              { $eq: ["$metadata.platform", "google_play"] },
              "google_play",
              {
                $cond: [
                  { $ne: [{ $ifNull: ["$metadata.stripeSessionId", null] }, null] },
                  "stripe",
                  "unknown",
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$provider",
          totalCoins: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const byProvider = { stripe: { totalCoins: 0, count: 0 }, google_play: { totalCoins: 0, count: 0 }, unknown: { totalCoins: 0, count: 0 } };
    let totalCoins = 0;
    let count = 0;
    for (const row of rows) {
      const key = byProvider[row._id] ? row._id : "unknown";
      byProvider[key] = {
        totalCoins: (byProvider[key].totalCoins || 0) + (row.totalCoins || 0),
        count: (byProvider[key].count || 0) + (row.count || 0),
      };
      totalCoins += row.totalCoins || 0;
      count += row.count || 0;
    }

    return {
      available: true,
      byProvider,
      totalCoins,
      count,
      source:
        "CoinTransaction type=purchase status=completed, agrupado por evidencia en metadata " +
        "(metadata.platform=google_play → google_play; metadata.stripeSessionId presente → stripe; ninguno → unknown)",
      note:
        "Cifras de Coins acreditados en MongoDB, no ingresos monetarios cobrados ni liquidados. 'unknown' nunca se " +
        "asume como Stripe u otro proveedor: requiere revisión manual.",
    };
  } catch (err) {
    return unavailable("getPurchaseCreditsByProvider", err);
  }
}

/** Reward Coins credits (daily/referral/mission), lifetime, by type. */
async function getRewardCredits() {
  try {
    const rows = await CoinTransaction.aggregate([
      { $match: { type: { $in: REWARD_TYPES }, status: "completed" } },
      { $group: { _id: "$type", totalCoins: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const byType = Object.fromEntries(REWARD_TYPES.map((type) => [type, { totalCoins: 0, count: 0 }]));
    let totalCoins = 0;
    let count = 0;
    for (const row of rows) {
      if (!byType[row._id]) continue;
      byType[row._id] = { totalCoins: row.totalCoins || 0, count: row.count || 0 };
      totalCoins += row.totalCoins || 0;
      count += row.count || 0;
    }
    return {
      available: true,
      byType,
      totalCoins,
      count,
      source: `CoinTransaction type in [${REWARD_TYPES.join(", ")}], status=completed`,
      note: "Recompensas acreditadas en MongoDB; no representan ingresos monetarios.",
    };
  } catch (err) {
    return unavailable("getRewardCredits", err);
  }
}

/**
 * Admin-adjustment Coins movements, split by whether they carry
 * `metadata.withdrawalId` (withdrawal reservation/reversal, see module
 * doc) vs. not (the only bucket that could ever hold a genuine
 * promotional/manual grant today).
 */
async function getAdminAdjustments() {
  try {
    const rows = await CoinTransaction.aggregate([
      { $match: { type: "admin_adjustment" } },
      {
        $project: {
          amount: 1,
          bucket: {
            $cond: [
              { $ne: [{ $ifNull: ["$metadata.withdrawalId", null] }, null] },
              "withdrawalRelated",
              "other",
            ],
          },
        },
      },
      { $group: { _id: "$bucket", totalCoins: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const byBucket = { withdrawalRelated: { totalCoins: 0, count: 0 }, other: { totalCoins: 0, count: 0 } };
    let totalCoins = 0;
    let count = 0;
    for (const row of rows) {
      const key = byBucket[row._id] ? row._id : "other";
      byBucket[key] = { totalCoins: row.totalCoins || 0, count: row.count || 0 };
      totalCoins += row.totalCoins || 0;
      count += row.count || 0;
    }
    return {
      available: true,
      withdrawalRelated: byBucket.withdrawalRelated,
      other: byBucket.other,
      totalCoins,
      count,
      source: "CoinTransaction type=admin_adjustment, dividido por presencia de metadata.withdrawalId",
      note:
        "Hoy no existe un tipo de transacción dedicado para Coins promocionales/otorgadas manualmente por " +
        "administración; 'withdrawalRelated' son reservas/reversas de retiro (ver withdraw.controller.js) y 'other' " +
        "es el único conjunto que podría contener ajustes administrativos genuinos, pero no puede verificarse como " +
        "tal sin revisión manual caso por caso.",
    };
  } catch (err) {
    return unavailable("getAdminAdjustments", err);
  }
}

/** Point-in-time Payout obligations, by status bucket — never summed with WithdrawalRequest. */
async function getPayoutObligations() {
  try {
    const rows = await Payout.aggregate([
      { $match: { status: { $in: ["pending", "approved", "paid"] } } },
      { $group: { _id: "$status", totalCoins: { $sum: "$amountCoins" }, totalUsd: { $sum: "$amountUsd" }, count: { $sum: 1 } } },
    ]);
    const byStatus = { pending: { totalCoins: 0, totalUsd: 0, count: 0 }, approved: { totalCoins: 0, totalUsd: 0, count: 0 }, paid: { totalCoins: 0, totalUsd: 0, count: 0 } };
    for (const row of rows) {
      if (byStatus[row._id]) {
        byStatus[row._id] = { totalCoins: row.totalCoins || 0, totalUsd: row.totalUsd || 0, count: row.count || 0 };
      }
    }
    return {
      available: true,
      pendingApproved: {
        totalCoins: byStatus.pending.totalCoins + byStatus.approved.totalCoins,
        totalUsd: byStatus.pending.totalUsd + byStatus.approved.totalUsd,
        count: byStatus.pending.count + byStatus.approved.count,
      },
      paidLifetime: byStatus.paid,
      source: "Payout.status in [pending, approved, paid] (lifetime, as of now)",
    };
  } catch (err) {
    return unavailable("getPayoutObligations", err);
  }
}

/** Point-in-time WithdrawalRequest obligations, by status bucket. */
async function getWithdrawalRequestObligations() {
  try {
    const rows = await WithdrawalRequest.aggregate([
      { $match: { status: { $in: ["pending", "approved", "paid"] } } },
      { $group: { _id: "$status", totalCoins: { $sum: "$amountCoins" }, totalUsd: { $sum: "$amountUSD" }, count: { $sum: 1 } } },
    ]);
    const byStatus = { pending: { totalCoins: 0, totalUsd: 0, count: 0 }, approved: { totalCoins: 0, totalUsd: 0, count: 0 }, paid: { totalCoins: 0, totalUsd: 0, count: 0 } };
    for (const row of rows) {
      if (byStatus[row._id]) {
        byStatus[row._id] = { totalCoins: row.totalCoins || 0, totalUsd: row.totalUsd || 0, count: row.count || 0 };
      }
    }
    return {
      available: true,
      pendingApproved: {
        totalCoins: byStatus.pending.totalCoins + byStatus.approved.totalCoins,
        totalUsd: byStatus.pending.totalUsd + byStatus.approved.totalUsd,
        count: byStatus.pending.count + byStatus.approved.count,
      },
      paidLifetime: byStatus.paid,
      source: "WithdrawalRequest.status in [pending, approved, paid] (lifetime, as of now)",
      note: "WithdrawalRequest no tiene campo paidAt verificable; este total es histórico completo, no de un período.",
    };
  } catch (err) {
    return unavailable("getWithdrawalRequestObligations", err);
  }
}

/**
 * Builds the full Coin Economy Control diagnostic. Every sub-section is
 * independently `available`/`unavailable` (fix pattern reused from the
 * monthly/annual reports) — a failure in one section never blanks out or
 * fabricates figures in another.
 */
async function getCoinEconomyControl() {
  const [coinsBalance, purchaseCredits, rewardCredits, adminAdjustments, payoutObligations, withdrawalRequestObligations] =
    await Promise.all([
      getCoinsBalanceSnapshot(),
      getPurchaseCreditsByProvider(),
      getRewardCredits(),
      getAdminAdjustments(),
      getPayoutObligations(),
      getWithdrawalRequestObligations(),
    ]);

  const creatorEarnings = coinsBalance.available
    ? {
        available: true,
        totalEarningsCoins: coinsBalance.totalEarningsCoins,
        estimatedUsdAtHistoricalRate: coinsBalance.totalEarningsCoins / COINS_PER_USD,
        conversionRate: "1 coin = $0.10 USD (tasa histórica de referencia, no el cálculo neto 60/40 futuro)",
        note:
          "Saldo actual de earningsCoins (ya neto de retiros/payouts realizados), no un total histórico bruto " +
          "ganado. Esta conversión es una referencia bajo la tasa vigente, no un importe neto nuevo bajo el futuro " +
          "60/40.",
      }
    : { available: false, reason: coinsBalance.reason, message: coinsBalance.message };

  const allAvailable = [
    coinsBalance,
    purchaseCredits,
    rewardCredits,
    adminAdjustments,
    payoutObligations,
    withdrawalRequestObligations,
  ].every((section) => section.available !== false);

  const dataGaps = [
    "settlementRevenue", // Settled/net revenue after processor fees is never computed here.
    "taxesAndWithholding", // No tax/withholding figures are produced.
    "refundsAgainstSpentCoins", // Coins already spent cannot be clawed back; refund risk on those is not quantified.
    "nonUsdCurrencyConversion", // Google Play / multi-currency Stripe purchases are not converted to a single currency.
    "googlePlaySettledPayout", // Google's actual net settlement to the company is not available in MongoDB.
    "legacyUnloggedCredits", // User.coins/earningsCoins may include credits from before CoinTransaction logging existed.
  ];

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    asOfNow: true,
    complete: allAvailable,
    coinsBalance,
    purchaseCredits,
    rewardCredits,
    adminAdjustments,
    creatorEarnings,
    withdrawalObligations: {
      payouts: payoutObligations,
      withdrawalRequests: withdrawalRequestObligations,
      note:
        "Payout y WithdrawalRequest son modelos independientes sin referencia compartida; sus totales nunca se " +
        "suman entre sí para evitar duplicar la misma obligación de retiro.",
    },
    dataGaps,
    warnings: allAvailable
      ? []
      : ["Una o más fuentes de este diagnóstico no pudieron leerse por completo; ver available=false en cada sección."],
  };
}

module.exports = {
  getCoinEconomyControl,
  COINS_PER_USD,
  REWARD_TYPES,
};
