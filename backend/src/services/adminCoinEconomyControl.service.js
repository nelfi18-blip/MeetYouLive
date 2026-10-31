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
 * A record is further pulled into its own `testCredits` bucket whenever it
 * carries `metadata.testCredit === true` (e.g. the +19,980 coin test
 * credit dated 2026-10-17, also tagged `noStripeCharge=true` /
 * `payoutProtectionEnforced=false`). Test credits are NEVER classified as
 * income/earnings evidence, regardless of their bucket or amount. `status`
 * is also respected: only `status=completed` rows count toward
 * `withdrawalRelated`/`other`/`testCredits`; `status=failed` rows are
 * excluded entirely (`excludedFailed`) and any other non-completed status
 * is shown separately (`excludedNonCompleted`) — never silently folded
 * into a completed total.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GOOGLE PLAY REVIEW ACCOUNT PREPARATIONS (GooglePlayReviewPrep)
 * ─────────────────────────────────────────────────────────────────────────
 * `GooglePlayReviewPrep` (see backend/scripts/set-google-play-review-accounts.js,
 * introduced in PR #922) records reversible, script-applied Coin balance
 * preparations for Google Play review accounts. This service reads ONLY
 * the currently-active (non-reverted) documents, generically by
 * `accountType` — it never hardcodes a specific email or a specific coin
 * amount, so the figures stay correct however many accounts are prepared
 * in the future. The Coins held by these accounts are real `User.coins`
 * values already counted inside `coinsBalance.totalCoins`; this section is
 * an informational cross-reference only and is never subtracted from, or
 * added again to, the general balance totals.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GOOGLE PLAY TEST/REVIEW PURCHASES CANNOT BE AUTO-DETECTED
 * ─────────────────────────────────────────────────────────────────────────
 * Unlike `admin_adjustment` (which can carry `metadata.testCredit`),
 * `CoinTransaction.type=purchase` records credited via Google Play have NO
 * stored marker distinguishing a confirmed test/review purchase (e.g. a
 * known 100-coin test purchase) from a real one. `purchaseCredits` never
 * assumes a Google Play purchase is test or real; see
 * `dataGaps.googlePlayPurchaseTestVsRealAmbiguity` — these must be treated
 * as pending manual reconciliation, never as confirmed revenue.
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
 * Coins already spent, per-currency conversion for non-USD purchases,
 * Google Play's actual settled payout to the company, or a reliable way to
 * tell a Google Play test/review purchase apart from a real one. At least
 * one historical real Stripe charge is also known to still be unreconciled
 * against current records. See `dataGaps`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `complete` MEANS "ALL QUERIES SUCCEEDED", NEVER "FINANCIALLY RECONCILED"
 * ─────────────────────────────────────────────────────────────────────────
 * The top-level `complete` flag is `true` only when every sub-section's
 * `available !== false` — i.e. every MongoDB query in this diagnostic
 * returned data. It is intentionally NOT a claim that the figures are
 * reconciled, settled, or net of fees/taxes/refunds. Callers (including
 * the admin UI) must label this "queries completed", never "complete"
 * on its own, to avoid implying a definitive financial reconciliation.
 */

const User = require("../models/User.js");
const CoinTransaction = require("../models/CoinTransaction.js");
const Payout = require("../models/Payout.js");
const WithdrawalRequest = require("../models/WithdrawalRequest.js");
const GooglePlayReviewPrep = require("../models/GooglePlayReviewPrep.js");

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
      { $match: { type: "purchase" } },
      {
        $project: {
          amount: 1,
          status: 1,
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
          _id: { provider: "$provider", status: "$status" },
          totalCoins: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const byProvider = { stripe: { totalCoins: 0, count: 0 }, google_play: { totalCoins: 0, count: 0 }, unknown: { totalCoins: 0, count: 0 } };
    // Failed purchase attempts (status="failed") must never inflate the
    // "completed" credited totals above — they are counted here instead so
    // they stay visible rather than silently vanishing. Purchases stuck in
    // "pending" (every purchase row starts "pending" and is only flipped to
    // "completed" once fully delivered — see googlePlayPurchase.controller.js
    // / payment.controller.js) are surfaced separately as possible partial
    // or unresolved deliveries, never folded into the completed totals.
    const excludedFailed = { totalCoins: 0, count: 0 };
    const pendingPartialDeliveries = { totalCoins: 0, count: 0 };
    let totalCoins = 0;
    let count = 0;
    for (const row of rows) {
      const providerKey = byProvider[row._id.provider] ? row._id.provider : "unknown";
      const status = row._id.status;
      const totalCoinsRow = row.totalCoins || 0;
      const countRow = row.count || 0;
      if (status === "completed") {
        byProvider[providerKey] = {
          totalCoins: byProvider[providerKey].totalCoins + totalCoinsRow,
          count: byProvider[providerKey].count + countRow,
        };
        totalCoins += totalCoinsRow;
        count += countRow;
      } else if (status === "failed") {
        excludedFailed.totalCoins += totalCoinsRow;
        excludedFailed.count += countRow;
      } else if (status === "pending") {
        pendingPartialDeliveries.totalCoins += totalCoinsRow;
        pendingPartialDeliveries.count += countRow;
      }
      // status="refunded" purchases are intentionally excluded from every
      // bucket here: the clawback itself is recorded as its own
      // CoinTransaction type="refund" and is out of scope for this credits
      // diagnostic to avoid double-counting the same coins twice.
    }

    return {
      available: true,
      byProvider,
      totalCoins,
      count,
      excludedFailed,
      pendingPartialDeliveries,
      source:
        "CoinTransaction type=purchase, agrupado por evidencia en metadata " +
        "(metadata.platform=google_play → google_play; metadata.stripeSessionId presente → stripe; ninguno → unknown); " +
        "solo status=completed se incluye en byProvider/totalCoins",
      note:
        "Cifras de Coins acreditados en MongoDB, no ingresos monetarios cobrados ni liquidados. 'unknown' nunca se " +
        "asume como Stripe u otro proveedor: requiere revisión manual. Las compras de Google Play completadas no " +
        "tienen una marca que distinga automáticamente una compra de prueba/revisión de una compra real " +
        "(ver dataGaps.googlePlayPurchaseTestVsRealAmbiguity): deben tratarse como pendientes de conciliación, " +
        "nunca como ingreso confirmado, hasta su revisión manual.",
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
          status: 1,
          bucket: {
            $cond: [
              { $ne: [{ $ifNull: ["$metadata.withdrawalId", null] }, null] },
              "withdrawalRelated",
              "other",
            ],
          },
          // Explicit, evidence-based marker — never inferred from the
          // amount or from any user's email. A record is only ever
          // identified as a test credit when it carries
          // metadata.testCredit === true (see e.g. the one-off +19,980
          // coin test credit dated 2026-10-17, which also carries
          // metadata.noStripeCharge=true / payoutProtectionEnforced=false).
          testCredit: { $eq: ["$metadata.testCredit", true] },
        },
      },
      {
        $group: {
          _id: { bucket: "$bucket", testCredit: "$testCredit", status: "$status" },
          totalCoins: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const empty = () => ({ totalCoins: 0, count: 0 });
    const withdrawalRelated = empty();
    const other = empty();
    const testCredits = empty();
    const excludedFailed = empty();
    const excludedNonCompleted = empty();

    for (const row of rows) {
      const { bucket, testCredit, status } = row._id;
      const totalCoinsRow = row.totalCoins || 0;
      const countRow = row.count || 0;

      if (status === "failed") {
        excludedFailed.totalCoins += totalCoinsRow;
        excludedFailed.count += countRow;
        continue;
      }
      if (status !== "completed") {
        // pending/refunded admin_adjustment rows are never counted as
        // completed credits — surfaced separately, never silently dropped.
        excludedNonCompleted.totalCoins += totalCoinsRow;
        excludedNonCompleted.count += countRow;
        continue;
      }
      if (testCredit) {
        // Test credits are identified explicitly and ALWAYS reported in
        // their own bucket — never folded into `withdrawalRelated` or
        // `other`, and never classified as income/earnings evidence.
        testCredits.totalCoins += totalCoinsRow;
        testCredits.count += countRow;
        continue;
      }
      if (bucket === "withdrawalRelated") {
        withdrawalRelated.totalCoins += totalCoinsRow;
        withdrawalRelated.count += countRow;
      } else {
        other.totalCoins += totalCoinsRow;
        other.count += countRow;
      }
    }

    const totalCoins = withdrawalRelated.totalCoins + other.totalCoins + testCredits.totalCoins;
    const count = withdrawalRelated.count + other.count + testCredits.count;

    return {
      available: true,
      withdrawalRelated,
      other,
      testCredits,
      excludedFailed,
      excludedNonCompleted,
      totalCoins,
      count,
      source:
        "CoinTransaction type=admin_adjustment; solo status=completed entra en withdrawalRelated/other/testCredits " +
        "(status=failed y status pending/refunded se muestran aparte); dividido por metadata.withdrawalId y " +
        "metadata.testCredit === true",
      note:
        "Hoy no existe un tipo de transacción dedicado para Coins promocionales/otorgadas manualmente por " +
        "administración; 'withdrawalRelated' son reservas/reversas de retiro (ver withdraw.controller.js), " +
        "'testCredits' son movimientos marcados explícitamente con metadata.testCredit=true (créditos de prueba, " +
        "NUNCA clasificados como ingreso) y 'other' es el único conjunto que podría contener ajustes " +
        "administrativos genuinos, pero no puede verificarse como tal sin revisión manual caso por caso.",
    };
  } catch (err) {
    return unavailable("getAdminAdjustments", err);
  }
}

/**
 * Active (non-reverted) Google Play review-account preparations
 * (`GooglePlayReviewPrep`, see backend/scripts/set-google-play-review-accounts.js).
 * Read-only aggregate — never queries by a hardcoded email or an exact
 * coin amount; it reads whatever active preparation documents exist today
 * for ANY account/accountType, so this stays correct if the review
 * preparation mechanism is reused for other accounts in the future.
 *
 * The Coins currently held by prepared accounts are already included in
 * `coinsBalance.totalCoins` above (they are real `User.coins` values) —
 * this section is purely an informational cross-reference so admins can
 * see how much of that balance is explained by a known, reversible review
 * preparation, NOT a deduction or a second balance.
 */
async function getGooglePlayReviewPreparations() {
  try {
    const activePreps = await GooglePlayReviewPrep.find({ revertedAt: null })
      .select("email accountType appliedAt")
      .lean();

    const byAccountType = {};
    for (const prep of activePreps) {
      const key = prep.accountType || "unknown";
      byAccountType[key] = (byAccountType[key] || 0) + 1;
    }

    const preparedEmails = activePreps.map((prep) => prep.email).filter(Boolean);
    const preparedUsers = preparedEmails.length
      ? await User.find({ email: { $in: preparedEmails } }).select("email coins").lean()
      : [];
    const coinsByEmail = new Map(preparedUsers.map((user) => [user.email, user.coins || 0]));
    const preparedAccountsCurrentCoins = preparedEmails.reduce(
      (sum, email) => sum + (coinsByEmail.get(email) || 0),
      0
    );

    return {
      available: true,
      activePreparations: activePreps.length,
      byAccountType,
      preparedAccountsCurrentCoins,
      source:
        "GooglePlayReviewPrep (revertedAt=null), cruzado por email con User.coins — solo lectura, nunca escribe",
      note:
        "Preparaciones activas de cuentas de revisión de Google Play (ver GooglePlayReviewPrep / " +
        "backend/scripts/set-google-play-review-accounts.js). Los Coins de estas cuentas YA están incluidos en " +
        "coinsBalance.totalCoins de arriba; esta cifra es solo una referencia agregada y nunca se resta ni se " +
        "duplica en los saldos generales. No se exponen correos ni identificadores individuales.",
    };
  } catch (err) {
    return unavailable("getGooglePlayReviewPreparations", err);
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
  const [
    coinsBalance,
    purchaseCredits,
    rewardCredits,
    adminAdjustments,
    payoutObligations,
    withdrawalRequestObligations,
    googlePlayReviewPreparations,
  ] = await Promise.all([
    getCoinsBalanceSnapshot(),
    getPurchaseCreditsByProvider(),
    getRewardCredits(),
    getAdminAdjustments(),
    getPayoutObligations(),
    getWithdrawalRequestObligations(),
    getGooglePlayReviewPreparations(),
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
    googlePlayReviewPreparations,
  ].every((section) => section.available !== false);

  const dataGaps = [
    "settlementRevenue", // Settled/net revenue after processor fees is never computed here.
    "taxesAndWithholding", // No tax/withholding figures are produced.
    "refundsAgainstSpentCoins", // Coins already spent cannot be clawed back; refund risk on those is not quantified.
    "nonUsdCurrencyConversion", // Google Play / multi-currency Stripe purchases are not converted to a single currency.
    "googlePlaySettledPayout", // Google's actual net settlement to the company is not available in MongoDB.
    "legacyUnloggedCredits", // User.coins/earningsCoins may include credits from before CoinTransaction logging existed.
    "googlePlayPurchaseTestVsRealAmbiguity", // Completed Google Play purchases have no stored marker distinguishing a test/review purchase from a real one (e.g. the confirmed 100-coin test credit); they must be treated as pending reconciliation, never as confirmed revenue.
    "unreconciledHistoricalStripeCharges", // At least one historical real Stripe charge is known to be unreconciled against current records; see stripeReconciliation.service.js for the existing (period-scoped) reconciliation tool.
  ];

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    asOfNow: true,
    // NOTE: `complete` means "every query in this diagnostic returned
    // data" (available !== false in every section) — it is deliberately
    // NOT a claim that the underlying figures are financially reconciled.
    // The frontend must label this as "queries completed", never as
    // "complete"/"reconciled", to avoid suggesting a definitive financial
    // conciliation that this read-only diagnostic does not perform.
    complete: allAvailable,
    coinsBalance,
    purchaseCredits,
    rewardCredits,
    adminAdjustments,
    creatorEarnings,
    googlePlayReviewPreparations,
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
