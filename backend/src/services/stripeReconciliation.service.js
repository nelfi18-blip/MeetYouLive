"use strict";

/**
 * Stripe ↔ Coins financial reconciliation (read-only).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * ─────────────────────────────────────────────────────────────────────────
 * This service never writes to Stripe or to MongoDB. It only reads:
 *   - MongoDB `CoinTransaction` documents of type "purchase" / status
 *     "completed" that carry `metadata.stripeSessionId` (set by the
 *     existing coins checkout webhook, see payment.controller.js).
 *   - Stripe Checkout Sessions (expanded to payment_intent → latest_charge
 *     → balance_transaction) for the authoritative gross/fee/net amounts,
 *     currency, and refund/dispute status of each purchase.
 *   - Stripe Balance Transactions (type "charge") for a bounded scan used
 *     to detect money movements that exist in Stripe but have no matching
 *     CoinTransaction in MongoDB ("missing_in_db").
 *
 * It is intentionally isolated from payment.controller.js / the Stripe
 * webhook handler: it does not reuse their mutation code paths, does not
 * credit coins, does not touch WithdrawalRequest/Payout, and does not
 * recompute creator earnings or commission splits.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DATE SEMANTICS
 * ─────────────────────────────────────────────────────────────────────────
 * `startDate`/`endDate` are interpreted as an inclusive-start,
 * exclusive-end window `[startDate, endDate)` applied to:
 *   - `CoinTransaction.createdAt` (when the DB purchase record was written
 *     by the webhook), and
 *   - Stripe's `created` timestamp (when the balance transaction was
 *     recorded by Stripe), converted to whole seconds since epoch.
 * These two timestamps are NOT guaranteed to be identical for the same
 * purchase (webhook processing, Stripe clock, network latency), so a
 * purchase whose CoinTransaction.createdAt falls just inside the window
 * may have a Stripe balance transaction just outside it, or vice versa.
 * This is a known limitation of any webhook-plus-ledger reconciliation and
 * is NOT silently corrected — such edge records simply surface as
 * `missing_in_stripe` / `missing_in_db` for that specific run; re-running
 * with a slightly wider window resolves them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KNOWN LIMITATIONS (documented, not "fixed" by guessing)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Historical CoinTransaction purchases created before `metadata.stripeSessionId`
 *    / `metadata.amountPaid` existed, or whose metadata is otherwise
 *    incomplete, are reported as `unresolved` (reason: "missing_identifiers").
 *    They are never guessed at or assigned a fabricated amount.
 * 2. The `missing_in_db` direction (Stripe → DB) requires listing Stripe
 *    Balance Transactions and resolving each charge back to a Checkout
 *    Session via `stripe.checkout.sessions.list({ payment_intent })`. This
 *    is bounded to `maxBalanceTransactionPages` (default 2, 100 per page)
 *    per request to avoid Stripe rate limits / request timeouts. If more
 *    pages exist, `stripeScan.truncated` is `true` and the result is never
 *    presented as a complete `missing_in_db` set for the whole range.
 * 3. Only Checkout-Session-based charges are considered "coin purchases".
 *    Any Stripe charge/balance transaction that cannot be resolved back to
 *    a Checkout Session is excluded from `missing_in_db` (it is simply not
 *    a coins purchase — e.g. subscription invoices, Sparks purchases) and
 *    is NOT counted anywhere in this report.
 * 4. Stripe bank payouts (`stripe.payouts.*`, money leaving the Stripe
 *    balance to the platform's bank account) are summarized separately
 *    under `stripeBankPayouts` for context only. They are never matched to
 *    individual CoinTransaction records and are unrelated to the
 *    application's own `Payout`/`WithdrawalRequest` models (creator
 *    payouts), which this service never reads or writes.
 * 5. All monetary amounts are returned as integer minor units (e.g. cents
 *    for USD) exactly as Stripe reports them, grouped by currency. Amounts
 *    in different currencies are never summed together.
 * 6. If Stripe is not configured, or any Stripe call fails (auth, rate
 *    limit, timeout, network), the response explicitly marks
 *    `ok: false` and/or `complete: false` with details in `errors`/
 *    `warnings` — it never reports partial sums as if they were final
 *    totals.
 */

const Stripe = require("stripe");
const CoinTransaction = require("../models/CoinTransaction.js");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_RANGE_DAYS = 92; // ~3 months, bounds Stripe pagination/timeouts
const DEFAULT_MAX_BALANCE_TX_PAGES = 2;
const BALANCE_TX_PAGE_LIMIT = 100;

let stripeClient;

/**
 * Lazily builds (and caches) a Stripe client using the SAME env var as the
 * rest of the backend (payment.controller.js). No new credentials are
 * introduced or stored.
 */
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
};

const isStripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

class ReconciliationValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReconciliationValidationError";
  }
}

/**
 * Validates and normalizes the requested date range + pagination.
 * Throws ReconciliationValidationError with a human-readable message on
 * any invalid input — the controller maps this to HTTP 400.
 */
function parseAndValidateOptions(rawOptions = {}) {
  const { startDate, endDate, page, pageSize, maxBalanceTransactionPages } = rawOptions;

  if (!startDate || !endDate) {
    throw new ReconciliationValidationError("startDate y endDate son obligatorios (ISO 8601)");
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ReconciliationValidationError("startDate/endDate deben ser fechas ISO 8601 válidas");
  }
  if (end <= start) {
    throw new ReconciliationValidationError("endDate debe ser posterior a startDate");
  }

  const rangeDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (rangeDays > DEFAULT_MAX_RANGE_DAYS) {
    throw new ReconciliationValidationError(
      `El rango máximo permitido es de ${DEFAULT_MAX_RANGE_DAYS} días; divide la consulta en rangos más pequeños`
    );
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedPageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE));
  const parsedMaxBtPages = Math.min(
    10,
    Math.max(1, parseInt(maxBalanceTransactionPages, 10) || DEFAULT_MAX_BALANCE_TX_PAGES)
  );

  return {
    startDate: start,
    endDate: end,
    page: parsedPage,
    pageSize: parsedPageSize,
    maxBalanceTransactionPages: parsedMaxBtPages,
  };
}

const toEpochSeconds = (date) => Math.floor(date.getTime() / 1000);

function emptyCurrencyBucket() {
  return {
    grossMinorUnits: 0,
    feeMinorUnits: 0,
    netMinorUnits: 0,
    refundedMinorUnits: 0,
    purchaseCount: 0,
  };
}

function addToCurrencyBucket(buckets, currency, field, amount) {
  if (!currency || typeof amount !== "number" || Number.isNaN(amount)) return;
  const code = currency.toLowerCase();
  if (!buckets[code]) buckets[code] = emptyCurrencyBucket();
  buckets[code][field] += amount;
}

/**
 * Resolves a single CoinTransaction purchase against Stripe by retrieving
 * its Checkout Session (expanded down to the balance transaction). Never
 * mutates anything in Stripe or MongoDB.
 */
async function resolveCoinTransactionAgainstStripe(stripe, coinTx) {
  const sessionId = coinTx?.metadata?.stripeSessionId;
  const amountPaidCents = coinTx?.metadata?.amountPaid;

  const base = {
    coinTransactionId: String(coinTx._id),
    userId: coinTx.userId ? String(coinTx.userId) : null,
    coinsAmount: coinTx.amount,
    createdAt: coinTx.createdAt,
    stripeSessionId: sessionId || null,
  };

  if (!sessionId || typeof amountPaidCents !== "number") {
    return {
      category: "unresolved",
      reason: "missing_identifiers",
      detail: "CoinTransaction no tiene metadata.stripeSessionId / metadata.amountPaid completos",
      ...base,
    };
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.latest_charge.balance_transaction"],
    });
  } catch (err) {
    if (err?.code === "resource_missing" || err?.statusCode === 404) {
      return { category: "missing_in_stripe", reason: "checkout_session_not_found", ...base };
    }
    return {
      category: "unresolved",
      reason: "stripe_error",
      detail: err?.message || "Error desconocido consultando Stripe",
      stripeErrorType: err?.type || null,
      ...base,
    };
  }

  const paymentIntent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = paymentIntent && typeof paymentIntent.latest_charge === "object" ? paymentIntent.latest_charge : null;
  const balanceTransaction = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;

  const grossCents = typeof session.amount_total === "number" ? session.amount_total : null;
  const currency = session.currency || null;

  const refunded = Boolean(charge?.refunded) || (charge?.amount_refunded || 0) > 0;
  const disputed = Boolean(charge?.disputed);

  if (refunded || disputed) {
    return {
      category: "refunded_or_disputed",
      reason: disputed ? "disputed" : "refunded",
      currency,
      grossCents,
      amountRefundedCents: charge?.amount_refunded ?? null,
      feeCents: balanceTransaction?.fee ?? null,
      netCents: balanceTransaction?.net ?? null,
      paymentIntentId: paymentIntent?.id || null,
      chargeId: charge?.id || null,
      amountPaidCents,
      ...base,
    };
  }

  if (grossCents === null || !currency) {
    return {
      category: "unresolved",
      reason: "incomplete_checkout_session",
      detail: "La sesión de Stripe no tiene amount_total/currency resueltos",
      ...base,
    };
  }

  if (currency.toLowerCase() !== "usd" && typeof amountPaidCents === "number") {
    // Project metadata.amountPaid assumes USD cents (see payment.controller.js);
    // never silently convert currencies — surface explicitly instead.
  }

  if (grossCents !== amountPaidCents) {
    return {
      category: "amount_mismatch",
      reason: "gross_amount_differs_from_metadata",
      currency,
      grossCents,
      amountPaidCents,
      feeCents: balanceTransaction?.fee ?? null,
      netCents: balanceTransaction?.net ?? null,
      paymentIntentId: paymentIntent?.id || null,
      chargeId: charge?.id || null,
      ...base,
    };
  }

  if (!balanceTransaction) {
    return {
      category: "unresolved",
      reason: "balance_transaction_not_available",
      detail: "El cargo aún no tiene balance_transaction resuelta en Stripe (posible estado pendiente)",
      currency,
      grossCents,
      paymentIntentId: paymentIntent?.id || null,
      chargeId: charge?.id || null,
      ...base,
    };
  }

  return {
    category: "matched",
    currency,
    grossCents,
    feeCents: balanceTransaction.fee,
    netCents: balanceTransaction.net,
    balanceTransactionId: balanceTransaction.id,
    paymentIntentId: paymentIntent?.id || null,
    chargeId: charge?.id || null,
    ...base,
  };
}

/**
 * Bounded scan of Stripe Balance Transactions (type "charge") within the
 * range, used only to discover charges that have NO matching
 * CoinTransaction in MongoDB ("missing_in_db"). Every charge is resolved
 * back to its Checkout Session (if any) via a list-by-payment_intent call;
 * charges with no associated Checkout Session are not coin purchases and
 * are excluded entirely (see limitation #3 in the module doc comment).
 */
async function scanForMissingInDb(stripe, { startDate, endDate, maxPages, knownSessionIds }) {
  const missing = [];
  const errors = [];
  let pagesFetched = 0;
  let truncated = false;
  let startingAfter;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (pagesFetched >= maxPages) {
        // There may be more balance transactions beyond what we scanned;
        // never claim this is a complete missing_in_db set.
        truncated = true;
        break;
      }

      const page = await stripe.balanceTransactions.list({
        type: "charge",
        created: { gte: toEpochSeconds(startDate), lt: toEpochSeconds(endDate) },
        limit: BALANCE_TX_PAGE_LIMIT,
        expand: ["data.source"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      pagesFetched += 1;

      for (const balanceTx of page.data) {
        const charge = typeof balanceTx.source === "object" ? balanceTx.source : null;
        const paymentIntentId = charge?.payment_intent;
        if (!paymentIntentId) continue; // not resolvable to a Checkout Session

        let checkoutSessionId = null;
        try {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: paymentIntentId,
            limit: 1,
          });
          checkoutSessionId = sessions?.data?.[0]?.id || null;
        } catch (err) {
          errors.push({
            scope: "missing_in_db_scan",
            paymentIntentId,
            message: err?.message || "Error resolviendo checkout session",
          });
          continue;
        }

        if (!checkoutSessionId) continue; // not a Checkout-based coin purchase

        if (!knownSessionIds.has(checkoutSessionId)) {
          missing.push({
            category: "missing_in_db",
            reason: "stripe_charge_without_coin_transaction",
            stripeSessionId: checkoutSessionId,
            paymentIntentId,
            chargeId: charge?.id || null,
            balanceTransactionId: balanceTx.id,
            currency: balanceTx.currency,
            grossCents: balanceTx.amount,
            feeCents: balanceTx.fee,
            netCents: balanceTx.net,
            createdAt: new Date(balanceTx.created * 1000),
          });
        }
      }

      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }
  } catch (err) {
    errors.push({ scope: "missing_in_db_scan", message: err?.message || "Error listando balance transactions" });
    truncated = true;
  }

  return { missing, errors, pagesFetched, truncated };
}

/**
 * Read-only summary of Stripe bank payouts (money leaving the Stripe
 * balance to the platform's bank account) in range — for context only,
 * never matched to individual purchases, never written anywhere, and
 * entirely unrelated to the app's own Payout/WithdrawalRequest models.
 */
async function summarizeStripeBankPayouts(stripe, { startDate, endDate }) {
  try {
    const page = await stripe.payouts.list({
      created: { gte: toEpochSeconds(startDate), lt: toEpochSeconds(endDate) },
      limit: 100,
    });
    const byCurrency = {};
    for (const payout of page.data) {
      addToCurrencyBucket(byCurrency, payout.currency, "grossMinorUnits", payout.amount);
    }
    return { ok: true, truncated: Boolean(page.has_more), byCurrency, count: page.data.length };
  } catch (err) {
    return { ok: false, error: err?.message || "Error listando payouts de Stripe" };
  }
}

/**
 * Main entry point: reconciles a page of MongoDB coin purchases against
 * Stripe, plus a bounded Stripe→DB scan for missing_in_db, within
 * [startDate, endDate). Purely read-only; no side effects anywhere.
 */
async function reconcileCoinPurchases(rawOptions = {}) {
  if (!isStripeConfigured()) {
    return {
      ok: false,
      complete: false,
      stripeConfigured: false,
      message: "Stripe no está configurado (STRIPE_SECRET_KEY ausente); no se puede conciliar",
    };
  }

  const options = parseAndValidateOptions(rawOptions);
  const stripe = getStripe();

  const { startDate, endDate, page, pageSize, maxBalanceTransactionPages } = options;

  const filter = {
    type: "purchase",
    status: "completed",
    createdAt: { $gte: startDate, $lt: endDate },
    "metadata.stripeSessionId": { $exists: true, $ne: null },
  };

  const [totalCandidates, coinTransactions] = await Promise.all([
    CoinTransaction.countDocuments(filter),
    CoinTransaction.find(filter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);

  const results = {
    matched: [],
    missing_in_stripe: [],
    missing_in_db: [],
    amount_mismatch: [],
    refunded_or_disputed: [],
    unresolved: [],
  };
  const errors = [];

  for (const coinTx of coinTransactions) {
    let resolved;
    try {
      resolved = await resolveCoinTransactionAgainstStripe(stripe, coinTx);
    } catch (err) {
      resolved = {
        category: "unresolved",
        reason: "unexpected_error",
        detail: err?.message || "Error inesperado",
        coinTransactionId: String(coinTx._id),
      };
      errors.push({ scope: "coin_transaction_resolution", coinTransactionId: String(coinTx._id), message: err?.message });
    }
    const { category, ...rest } = resolved;
    results[category].push(rest);
  }

  const byCurrency = {};
  for (const m of results.matched) {
    addToCurrencyBucket(byCurrency, m.currency, "grossMinorUnits", m.grossCents);
    addToCurrencyBucket(byCurrency, m.currency, "feeMinorUnits", m.feeCents);
    addToCurrencyBucket(byCurrency, m.currency, "netMinorUnits", m.netCents);
    addToCurrencyBucket(byCurrency, m.currency, "purchaseCount", 1);
  }
  for (const r of results.refunded_or_disputed) {
    addToCurrencyBucket(byCurrency, r.currency, "refundedMinorUnits", r.amountRefundedCents || 0);
  }

  const knownSessionIds = new Set(
    coinTransactions
      .map((tx) => tx?.metadata?.stripeSessionId)
      .filter(Boolean)
  );

  const missingInDbScan = await scanForMissingInDb(stripe, {
    startDate,
    endDate,
    maxPages: maxBalanceTransactionPages,
    knownSessionIds,
  });
  results.missing_in_db = missingInDbScan.missing;
  errors.push(...missingInDbScan.errors);

  const stripeBankPayouts = await summarizeStripeBankPayouts(stripe, { startDate, endDate });

  const complete = errors.length === 0 && !missingInDbScan.truncated;

  return {
    ok: true,
    complete,
    stripeConfigured: true,
    range: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    pagination: {
      page,
      pageSize,
      totalCandidates,
      hasMore: page * pageSize < totalCandidates,
    },
    summary: { byCurrency },
    stripeBankPayouts,
    stripeScan: {
      pagesFetched: missingInDbScan.pagesFetched,
      maxPages: maxBalanceTransactionPages,
      truncated: missingInDbScan.truncated,
    },
    results,
    warnings: missingInDbScan.truncated
      ? [
          "missing_in_db scan truncated por el límite de páginas de Stripe; no representa el total completo del rango",
        ]
      : [],
    errors,
  };
}

module.exports = {
  isStripeConfigured,
  reconcileCoinPurchases,
  ReconciliationValidationError,
  // exported for tests only
  parseAndValidateOptions,
  resolveCoinTransactionAgainstStripe,
};
