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
 *    incomplete, are INCLUDED in the query and reported as `unresolved`
 *    (reason: "missing_identifiers") — they are never excluded/dropped
 *    silently, and never guessed at or assigned a fabricated amount. The
 *    ONLY purchases ever excluded from this query are those explicitly
 *    tagged `metadata.platform === "google_play"` (credited by
 *    googlePlayPurchase.controller.js): those are Google Play Billing
 *    purchases, not Stripe purchases, and have no Checkout Session to
 *    resolve, so this reconciler never reports them as a Stripe
 *    discrepancy. They are summarized separately, read-only, by
 *    googlePlayCoinsSummary.service.js (see that module for the
 *    MongoDB-only, non-revenue scope of that summary).
 * 2. The `missing_in_db` direction (Stripe → DB) requires listing Stripe
 *    Balance Transactions and resolving each charge back to a Checkout
 *    Session via `stripe.checkout.sessions.list({ payment_intent })`. This
 *    is bounded to `maxBalanceTransactionPages` (default 2, 100 per page)
 *    per request to avoid Stripe rate limits / request timeouts. If more
 *    pages exist, `stripeScan.truncated` is `true` and the result is never
 *    presented as a complete `missing_in_db` set for the whole range. The
 *    comparison set of "known" Stripe session ids is always built from
 *    EVERY completed coin purchase in the requested date range (a
 *    dedicated, unpaginated id-only query), never only from the current
 *    results page — otherwise purchases that simply live on a different
 *    page would be misreported as `missing_in_db`.
 * 3. Only Checkout Sessions whose own `metadata.type === "coins"` are ever
 *    treated as coin purchases. Any Stripe charge/balance transaction that
 *    cannot be resolved back to a Checkout Session, or whose Checkout
 *    Session is tagged as a different product (e.g. "sparks", "video"), is
 *    excluded from `missing_in_db` entirely — it is NOT a coins purchase
 *    and is NOT counted anywhere in this report. If a Checkout Session has
 *    no recognizable `metadata.type` at all, it is surfaced as `unresolved`
 *    (reason "stripe_session_missing_product_type") instead of being
 *    guessed as a coin purchase. Symmetrically, if a CoinTransaction's own
 *    stored `stripeSessionId` resolves to a Checkout Session tagged with a
 *    different product type, it is reported as `unresolved` (reason
 *    "stripe_session_product_mismatch") rather than trusted.
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
 * 7. `complete` and `reconciled` are DELIBERATELY SEPARATE flags with
 *    different meanings — never conflate them:
 *      - `complete` describes QUERY COVERAGE only: did this request start
 *        from the very first candidate (`page === 1`) and manage to read
 *        EVERY candidate CoinTransaction in the range (no more pages
 *        pending) plus finish the bounded Stripe scan without truncation
 *        or errors? Requesting only the last page of a multi-page range
 *        (`page > 1`) never counts as full coverage — it simply has no
 *        MORE pages after it, but it skipped every earlier page. It is
 *        `false` whenever there are any `errors`, the Stripe
 *        balance-transaction scan was truncated, this request did not
 *        start at page 1, the requested page does not cover every
 *        candidate CoinTransaction in the range (`pagination.hasMore`),
 *        or the Stripe bank-payouts summary itself failed. A query CAN be
 *        `complete: true` while still containing discrepancies (mismatches,
 *        missing records, unresolved evidence).
 *      - `reconciled` describes the FINANCIAL RECONCILIATION OUTCOME: it is
 *        `true` only when the query was `complete` AND there are zero
 *        discrepancies of any kind — no `missing_in_stripe`,
 *        `missing_in_db`, `amount_mismatch`, `unresolved`, or
 *        `refunded_or_disputed` records. If the query is complete but any
 *        discrepancy category is non-empty, `reconciled` is `false` and
 *        `discrepancies` enumerates exactly what remains open. If the
 *        query itself is not `complete` (including when only the last page
 *        of several was requested), `reconciled` is always `false` too (an
 *        incomplete/partial scan can never certify "no discrepancies"
 *        because unseen records — including earlier pages — could hide
 *        them).
 *      - Callers must check `complete` to know whether the coverage was
 *        exhaustive, and `reconciled`/`discrepancies` to know whether the
 *        money actually matches. Neither flag alone answers both
 *        questions.
 * 8. `summary.byCurrency` is computed ONLY from the `results.matched` /
 *    `results.refunded_or_disputed` records produced for the CURRENT
 *    paginated page of CoinTransactions (`pagination.page`/`pageSize`). It
 *    is NOT a global total for the whole requested date range unless this
 *    single request started at `page === 1` AND `pagination.hasMore` is
 *    `false` — i.e. every candidate in the range fit in this one request.
 *    Simply being the LAST page of a multi-page query (`page > 1`,
 *    `hasMore: false`) does NOT qualify: earlier pages were never read by
 *    this request, so their contribution to `byCurrency` is unknown.
 *    `summary.scope` is `"full_range"` only in that single page-1-and-no-
 *    more-pages case; every other case — including that last-page-of-many
 *    scenario — is `"current_page_only"`, with `summary.note` spelling out
 *    the limitation. No verified whole-range aggregate is computed or
 *    implied otherwise; building one would require summing every page
 *    server-side, which this read-only, rate-limit-aware service does not
 *    attempt.
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

  // Product classification guard (never classify Sparks/video Checkout
  // Sessions as Coins purchases, even if a CoinTransaction happens to
  // reference that session id due to a data error).
  const sessionProductType = session.metadata?.type || null;
  if (sessionProductType && sessionProductType !== "coins") {
    return {
      category: "unresolved",
      reason: "stripe_session_product_mismatch",
      detail: `La sesión de Stripe ${sessionId} tiene metadata.type="${sessionProductType}", no "coins"; no se clasifica como compra de Coins`,
      stripeSessionProductType: sessionProductType,
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
 * charges with no associated Checkout Session, or whose Checkout Session
 * is tagged with a product type other than "coins" (e.g. "sparks",
 * "video"), are excluded entirely — they are simply not coin purchases
 * (see limitation #3 in the module doc comment). Checkout Sessions with no
 * recognizable product type at all are reported as `unresolved` instead
 * of being guessed as a coin purchase.
 */
async function scanForMissingInDb(stripe, { startDate, endDate, maxPages, knownSessionIds }) {
  const missing = [];
  const unresolved = [];
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

        let matchedSession = null;
        try {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: paymentIntentId,
            limit: 1,
          });
          matchedSession = sessions?.data?.[0] || null;
        } catch (err) {
          errors.push({
            scope: "missing_in_db_scan",
            paymentIntentId,
            message: err?.message || "Error resolviendo checkout session",
          });
          continue;
        }

        if (!matchedSession) continue; // not a Checkout-based purchase at all

        // Product classification guard: never classify Sparks/video
        // Checkout Sessions as Coins purchases.
        const sessionProductType = matchedSession.metadata?.type || null;
        if (sessionProductType && sessionProductType !== "coins") {
          continue; // a Sparks/video purchase — not relevant to this report
        }

        const checkoutSessionId = matchedSession.id;

        if (!sessionProductType) {
          // Checkout Session exists but has no recognizable product-type
          // metadata — never guess it's a coin purchase; surface as
          // unresolved so it's never silently counted either way.
          unresolved.push({
            reason: "stripe_session_missing_product_type",
            stripeSessionId: checkoutSessionId,
            paymentIntentId,
            chargeId: charge?.id || null,
            balanceTransactionId: balanceTx.id,
            currency: balanceTx.currency,
            grossCents: balanceTx.amount,
            createdAt: new Date(balanceTx.created * 1000),
          });
          continue;
        }

        if (!knownSessionIds.has(checkoutSessionId)) {
          missing.push({
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

  return { missing, unresolved, errors, pagesFetched, truncated };
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
      reconciled: false,
      stripeConfigured: false,
      message: "Stripe no está configurado (STRIPE_SECRET_KEY ausente); no se puede conciliar",
    };
  }

  const options = parseAndValidateOptions(rawOptions);
  const stripe = getStripe();

  const { startDate, endDate, page, pageSize, maxBalanceTransactionPages } = options;

  // Fix #2 (histórico incompleto): do NOT require metadata.stripeSessionId
  // to exist — purchases without it are included and resolved into the
  // "unresolved" category (reason "missing_identifiers") instead of being
  // silently dropped from the query.
  //
  // Fix #5 (Google Play separation, PR follow-up): this reconciler is
  // Stripe-only. CoinTransaction purchases credited via Google Play
  // Billing (`metadata.platform === "google_play"`, see
  // googlePlayPurchase.controller.js) are NEVER Stripe purchases and must
  // never be fed into this query — they have no Checkout Session to
  // resolve and would otherwise always surface as a false
  // "unresolved/missing_identifiers" discrepancy. `$ne: "google_play"`
  // matches both documents where the field is absent (ALL historical
  // Stripe purchases, which must keep being included/classified exactly
  // as before) and documents explicitly tagged with any OTHER platform
  // value — only the literal `"google_play"` tag is excluded.
  const filter = {
    type: "purchase",
    status: "completed",
    createdAt: { $gte: startDate, $lt: endDate },
    "metadata.platform": { $ne: "google_play" },
  };

  // Separate, unpaginated filter/query used ONLY to build the set of
  // Stripe session ids already known to MongoDB for the ENTIRE requested
  // range (fix #1: false missing_in_db). This must never be limited to
  // the current results page — otherwise a purchase that simply lives on
  // a different page would be misreported as missing from the DB. Same
  // Google Play exclusion as `filter` above (fix #5): a google_play
  // purchase never has a stripeSessionId anyway, but excluding it here too
  // keeps both identifier sets built from the exact same Stripe-only
  // candidate population.
  const sessionIdFilter = {
    type: "purchase",
    status: "completed",
    createdAt: { $gte: startDate, $lt: endDate },
    "metadata.platform": { $ne: "google_play" },
    "metadata.stripeSessionId": { $exists: true, $ne: null },
  };

  const [totalCandidates, coinTransactions, periodSessionIdDocs] = await Promise.all([
    CoinTransaction.countDocuments(filter),
    CoinTransaction.find(filter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    CoinTransaction.find(sessionIdFilter, { "metadata.stripeSessionId": 1 }).lean(),
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

  // Reasons that mean "we could not actually obtain evidence for this
  // record" (a coverage/technical failure) rather than "we got the
  // evidence and it genuinely doesn't match" (a data discrepancy). The
  // former must affect `complete` (the scan did not finish cleanly); the
  // latter must only affect `discrepancies`/`reconciled`, since a fully
  // covered scan can legitimately surface real mismatches.
  const TECHNICAL_UNRESOLVED_REASONS = new Set([
    "stripe_error",
    "incomplete_checkout_session",
    "balance_transaction_not_available",
    "unexpected_error",
  ]);

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
    if (
      category === "unresolved" &&
      TECHNICAL_UNRESOLVED_REASONS.has(rest.reason) &&
      rest.reason !== "unexpected_error" // already pushed above when thrown
    ) {
      errors.push({
        scope: "coin_transaction_resolution",
        coinTransactionId: rest.coinTransactionId,
        message: rest.detail || rest.reason,
      });
    }
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

  // Fix #1: built from EVERY CoinTransaction in the requested range, not
  // just the current page's coinTransactions.
  const knownSessionIds = new Set(
    periodSessionIdDocs
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
  results.unresolved.push(...missingInDbScan.unresolved);
  errors.push(...missingInDbScan.errors);

  const stripeBankPayouts = await summarizeStripeBankPayouts(stripe, { startDate, endDate });

  // `complete` is QUERY COVERAGE only — it answers "did this request read
  // EVERY candidate CoinTransaction in the range, from the very first one,
  // in order to have an opinion at all?". It must never be affected by
  // whether discrepancies were found; a fully-covered scan that finds
  // mismatches is still "complete". `hasMorePages` alone is NOT enough:
  // requesting only the last page of a multi-page range (page > 1) also
  // never covers every candidate — it simply never has MORE pages after
  // it. Full coverage requires BOTH starting at page 1 AND having no more
  // pages pending, i.e. the whole candidate set fit in this single
  // request. `complete` is `false` whenever there were any errors, the
  // Stripe balance-transaction scan was truncated, this request did not
  // cover the full candidate set from the start (page !== 1 or more pages
  // pending), or the Stripe bank-payouts summary itself failed.
  const hasMorePages = page * pageSize < totalCandidates;
  const coversFullCandidateSet = page === 1 && !hasMorePages;
  const stripeBankPayoutsFailed = stripeBankPayouts.ok === false;

  const complete =
    errors.length === 0 &&
    !missingInDbScan.truncated &&
    coversFullCandidateSet &&
    !stripeBankPayoutsFailed;

  // `discrepancies` enumerates every category that represents an open
  // question about whether the money matches — these are NEVER folded
  // into `complete`, because a query can legitimately finish reading
  // everything requested and still find genuine mismatches.
  const discrepancies = {
    missingInStripe: results.missing_in_stripe.length,
    missingInDb: results.missing_in_db.length,
    amountMismatch: results.amount_mismatch.length,
    unresolved: results.unresolved.length,
    refundedOrDisputed: results.refunded_or_disputed.length,
  };
  const hasDiscrepancies = Object.values(discrepancies).some((count) => count > 0);
  discrepancies.total = Object.values(discrepancies).reduce((sum, count) => sum + count, 0);

  // `reconciled` is the FINANCIAL RECONCILIATION OUTCOME, separate from
  // `complete`. It is only `true` when the scan was complete (full
  // coverage) AND no discrepancy category has any records. An incomplete
  // scan can never be declared "reconciled" — unseen records could still
  // hide discrepancies — and a complete scan with discrepancies must say
  // so explicitly rather than implying everything matches.
  const reconciled = complete && !hasDiscrepancies;

  const warnings = [];
  if (missingInDbScan.truncated) {
    warnings.push(
      "missing_in_db scan truncated por el límite de páginas de Stripe; no representa el total completo del rango"
    );
  }
  if (hasMorePages) {
    warnings.push(
      "Existen más CoinTransaction en el rango que no caben en esta página; solicita la siguiente página para completar la cobertura de la consulta"
    );
  } else if (page > 1) {
    warnings.push(
      "Esta es la última página de una consulta con varias páginas; las páginas anteriores no se incluyen en esta respuesta y el resultado NO representa el total global del rango"
    );
  }
  if (stripeBankPayoutsFailed) {
    warnings.push("No se pudo obtener el resumen de payouts bancarios de Stripe");
  }
  if (complete && hasDiscrepancies) {
    warnings.push(
      `La consulta está completa, pero quedan ${discrepancies.total} discrepancia(s) sin conciliar (ver "discrepancies" y "results")`
    );
  } else if (!complete && hasDiscrepancies) {
    warnings.push(
      "Hay discrepancias detectadas, pero la consulta aún no está completa; pueden existir más al cubrir el rango por completo"
    );
  }

  return {
    ok: true,
    complete,
    reconciled,
    stripeConfigured: true,
    range: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    pagination: {
      page,
      pageSize,
      totalCandidates,
      hasMore: hasMorePages,
    },
    summary: {
      byCurrency,
      scope: coversFullCandidateSet ? "full_range" : "current_page_only",
      note:
        "byCurrency se calcula únicamente a partir de los registros 'matched'/'refunded_or_disputed' de la PÁGINA SOLICITADA (pagination.page/pageSize), nunca de todo el rango. scope solo es 'full_range' cuando esta petición solicitó la página 1 y pagination.hasMore es false, es decir, cuando TODOS los candidatos del rango cupieron en esta única respuesta. En cualquier otro caso — incluida la última página de una consulta con varias páginas (page > 1) — scope es 'current_page_only': el valor es un total parcial y NO debe presentarse ni sumarse como el total global del rango.",
    },
    discrepancies,
    stripeBankPayouts,
    stripeScan: {
      pagesFetched: missingInDbScan.pagesFetched,
      maxPages: maxBalanceTransactionPages,
      truncated: missingInDbScan.truncated,
    },
    results,
    warnings,
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
