"use strict";

/**
 * Admin-only, read-only MONTHLY FINANCIAL REPORT for MeetYouLive
 * Technologies LLC.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SCOPE
 * ─────────────────────────────────────────────────────────────────────────
 * This is an OPERATIONAL report, not a tax filing. It never computes taxes,
 * never issues 1099/1042-S forms, never applies automatic withholding, and
 * never assumes Coins purchases are "recognized" taxable income at the
 * moment they are charged, or that creator payouts are automatically
 * deductible expenses. The company (a Single-Member LLC) must keep this
 * separate from any future creator-facing international tax system.
 *
 * This service NEVER writes to Stripe or MongoDB, never credits/debits
 * coins, never creates/updates Payout or WithdrawalRequest documents, and
 * never touches Checkout, webhooks, Stripe transfers, earnings, payouts,
 * withdrawals, OAuth, Discover, Matches, Live, or Agora code paths.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FINANCIAL SOURCES USED (all read-only)
 * ─────────────────────────────────────────────────────────────────────────
 * A. Stripe charges summary (`stripeChargesSummary`): a bounded scan of
 *    Stripe Balance Transactions (`type: "charge"` and `type: "refund"`)
 *    for the requested month — Stripe's own authoritative gross/fee/net
 *    figures, grouped by currency. This is the WHOLE-ACCOUNT total (any
 *    Stripe product), never estimated or derived from percentages.
 * B. Coins reconciliation (`coinsReconciliation`): reuses
 *    `reconcileCoinPurchases` from stripeReconciliation.service.js (PR
 *    #1084) UNCHANGED — its `summary.byCurrency` is the verified Coins-only
 *    subtotal (other Stripe products such as Sparks/video/subscriptions are
 *    never included there, since it is built exclusively from
 *    `CoinTransaction` purchase records). This value is NOT subtracted from
 *    `stripeChargesSummary` because the two scans use independent
 *    pagination/coverage and such a subtraction could misrepresent "other
 *    products" if either side is incomplete — they are always presented
 *    side by side instead.
 * C. Creator payments (`creatorPayments`): `Payout` (status="paid",
 *    `paidAt` inside the period) is the PRIMARY source for money actually
 *    paid to creators. `WithdrawalRequest` has no verifiable `paidAt` field
 *    at all (see model), so its "paid" records can never be attributed to
 *    a specific period — they are surfaced separately as an explicitly
 *    incomplete, period-less lifetime total, never silently folded into
 *    the period total and never defaulted to zero. `Payout` and
 *    `WithdrawalRequest` are independent models with no shared reference;
 *    their totals are NEVER summed together here, to avoid any risk of
 *    double counting the same physical payment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `complete` / `queryCoverage` / data-quality SEMANTICS (fix #1)
 * ─────────────────────────────────────────────────────────────────────────
 * Two DISTINCT concepts are never conflated:
 *   - `queryCoverage.technicallyComplete` describes ONLY whether every
 *     technical SOURCE this request touched (Stripe charges scan, Coins
 *     reconciliation, and the Payout/WithdrawalRequest aggregates) could be
 *     read in full, without truncation or an unexpected failure. It says
 *     NOTHING about whether the underlying historical records themselves
 *     are trustworthy/attributable to this period.
 *   - `creatorPayments.dataQuality.historicalDataComplete` describes
 *     whether the creator-payment HISTORY ITSELF is free of unattributable
 *     records (e.g. `Payout.status=paid` documents with no verifiable
 *     `paidAt`). This can be `false` even when every query technically
 *     succeeded — a fully-read query can still surface incomplete history.
 *   - Top-level `complete` is `true` ONLY when BOTH are `true`. This
 *     service NEVER declares total financial integrity (`complete: true`)
 *     while any creator-payment record exists that cannot be verifiably
 *     attributed to the requested period — see fix #1.
 */

const Stripe = require("stripe");
const Payout = require("../models/Payout.js");
const WithdrawalRequest = require("../models/WithdrawalRequest.js");
const {
  reconcileCoinPurchases,
  isStripeConfigured,
} = require("./stripeReconciliation.service.js");

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;
const DEFAULT_MAX_BALANCE_TX_PAGES = 5;
const MAX_BALANCE_TX_PAGES_CAP = 20;
const BALANCE_TX_PAGE_LIMIT = 100;
const DEFAULT_COINS_PAGE_SIZE = 100;

// Balance transaction types actually scanned by scanStripeChargesSummary.
// Stripe also records other types (adjustment, payment_failure_refund,
// transfer, payout, etc.) that this report does NOT read — see fix #2.
const SCANNED_BALANCE_TX_TYPES = ["charge", "refund"];

let stripeClient;

/**
 * Lazily builds (and caches) a Stripe client using the SAME env var as the
 * rest of the backend. No new credentials are introduced or stored.
 */
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
};

class FinancialReportValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FinancialReportValidationError";
  }
}

const toEpochSeconds = (date) => Math.floor(date.getTime() / 1000);

/**
 * Own currency-bucket helper (fix #2) — intentionally NOT the shared
 * `addToCurrencyBucket`/`emptyCurrencyBucket` from stripeReconciliation
 * service.js, since that one hardcodes a field literally named
 * `netMinorUnits`. Reusing it here would silently leave the renamed
 * `chargesNetMinorUnits` field uninitialized (`undefined + number = NaN`).
 * This local helper defines ONLY the fields this report actually produces,
 * every bucket keyed by its own lowercase ISO currency code (never mixed).
 */
function emptyChargesBucket() {
  return {
    grossMinorUnits: 0,
    feeMinorUnits: 0,
    chargesNetMinorUnits: 0,
    refundedMinorUnits: 0,
    purchaseCount: 0,
  };
}

function addToChargesBucket(buckets, currency, field, amount) {
  if (!currency || typeof amount !== "number" || Number.isNaN(amount)) return;
  const code = currency.toLowerCase();
  if (!buckets[code]) buckets[code] = emptyChargesBucket();
  buckets[code][field] += amount;
}

/**
 * Strictly parses a value as a whole integer (fix #3). Unlike
 * `parseInt`/`Number()` used loosely, this REJECTS:
 *   - trailing garbage ("2026abc", "10xyz" — `parseInt` would silently
 *     accept these as 2026 / 10),
 *   - decimals ("2026.5"),
 *   - empty/whitespace-only strings, booleans, arrays, objects, etc.
 * Returns `NaN` for anything that is not a clean, complete integer; valid
 * integers (including a leading `+`/`-` sign) are returned as a Number.
 */
function parseStrictInteger(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : NaN;
  }
  if (typeof value !== "string") return NaN;
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return NaN;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : NaN;
}

/**
 * Validates and normalizes the requested monthly period + pagination.
 * Throws FinancialReportValidationError (mapped to HTTP 400 by the
 * controller) on any invalid input.
 */
function parseAndValidateOptions(rawOptions = {}) {
  const { year, month, page, coinsPageSize, maxBalanceTransactionPages } = rawOptions;

  const parsedYear = parseStrictInteger(year);
  const parsedMonth = parseStrictInteger(month);

  if (!Number.isInteger(parsedYear) || parsedYear < MIN_YEAR || parsedYear > MAX_YEAR) {
    throw new FinancialReportValidationError(
      `year es obligatorio y debe ser un entero completo (sin decimales ni texto adicional) entre ${MIN_YEAR} y ${MAX_YEAR}`
    );
  }
  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    throw new FinancialReportValidationError(
      "month es obligatorio y debe ser un entero completo (sin decimales ni texto adicional) entre 1 y 12"
    );
  }

  // Inclusive-start, exclusive-end UTC calendar-month window — never
  // dependent on server-local timezone.
  const startDate = new Date(Date.UTC(parsedYear, parsedMonth - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(parsedYear, parsedMonth, 1, 0, 0, 0, 0));

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedCoinsPageSize = Math.min(100, Math.max(1, parseInt(coinsPageSize, 10) || DEFAULT_COINS_PAGE_SIZE));
  const parsedMaxBtPages = Math.min(
    MAX_BALANCE_TX_PAGES_CAP,
    Math.max(1, parseInt(maxBalanceTransactionPages, 10) || DEFAULT_MAX_BALANCE_TX_PAGES)
  );

  return {
    year: parsedYear,
    month: parsedMonth,
    startDate,
    endDate,
    page: parsedPage,
    coinsPageSize: parsedCoinsPageSize,
    maxBalanceTransactionPages: parsedMaxBtPages,
  };
}

/**
 * Logs the FULL error server-side (for operator debugging) but returns
 * only a sanitized, non-sensitive shape to the client (fix #4). Stripe/
 * MongoDB error `.message` text can include account/request identifiers or
 * other internal details that must never reach the HTTP response.
 */
function sanitizeError(scope, err) {
  // eslint-disable-next-line no-console
  console.error(`adminMonthlyFinancialReport.${scope} error:`, err);
  return {
    scope,
    type: typeof err?.type === "string" ? err.type : null,
    code: typeof err?.code === "string" || typeof err?.code === "number" ? err.code : null,
  };
}

function unavailableStripeChargesSummary(reason, message) {
  return {
    ok: false,
    available: false,
    reason,
    message,
    truncated: null,
    chargeCount: null,
    refundCount: null,
    byCurrency: null,
    scannedTypes: SCANNED_BALANCE_TX_TYPES,
    errors: [],
  };
}

function unavailableCoinsReconciliation(reason, message) {
  return {
    ok: false,
    complete: false,
    reconciled: false,
    available: false,
    reason,
    message,
  };
}

/**
 * Bounded, read-only scan of Stripe Balance Transactions for the WHOLE
 * Stripe account (any product) within [startDate, endDate).
 *
 * SEMANTICS (fix #2) — read carefully before consuming `byCurrency`:
 *   - `grossMinorUnits` / `feeMinorUnits` / `chargesNetMinorUnits` are
 *     summed ONLY from `type: "charge"` balance transactions. Stripe's own
 *     `net` figure for a charge reflects just that charge at the moment it
 *     settled — it is NOT adjusted here for refunds, disputes, or other
 *     adjustments that may be recorded as SEPARATE, later balance
 *     transactions (possibly outside this same [startDate, endDate)
 *     window). `chargesNetMinorUnits` must NEVER be read as "final cash
 *     position for the period".
 *   - `refundedMinorUnits` is a SEPARATE, independently verifiable sum of
 *     `type: "refund"` balance transactions in the SAME window. It is
 *     reported alongside, not subtracted from, `chargesNetMinorUnits` —
 *     this service never fabricates a single "true net" figure by
 *     combining two independently-scanned, possibly-partial sources.
 *   - Only `SCANNED_BALANCE_TX_TYPES` (`charge`, `refund`) are read. Other
 *     Stripe balance-transaction types (`adjustment`,
 *     `payment_failure_refund`, `transfer`, `payout`, etc.) are NOT
 *     included in `byCurrency` at all — see `scannedTypes` in the
 *     response and the `semantics` block for the exact wording presented
 *     to the admin.
 *   - Currencies are NEVER mixed: every bucket is keyed by its own
 *     lowercase ISO currency code.
 */
async function scanStripeChargesSummary(stripe, { startDate, endDate, maxPages }) {
  const byCurrency = {};
  const errors = [];
  let truncated = false;
  let chargeCount = 0;
  let refundCount = 0;

  async function scanType(type, applyFn) {
    let pagesFetched = 0;
    let startingAfter;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (pagesFetched >= maxPages) {
          truncated = true;
          break;
        }
        const page = await stripe.balanceTransactions.list({
          type,
          created: { gte: toEpochSeconds(startDate), lt: toEpochSeconds(endDate) },
          limit: BALANCE_TX_PAGE_LIMIT,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        pagesFetched += 1;
        for (const tx of page.data) applyFn(tx);
        if (!page.has_more) break;
        startingAfter = page.data[page.data.length - 1]?.id;
        if (!startingAfter) break;
      }
    } catch (err) {
      // Sanitized (fix #4): only a safe scope/type/code reach the
      // response; the full error is logged server-side only.
      errors.push({
        ...sanitizeError(`scanStripeChargesSummary.${type}`, err),
        message: `Error consultando Stripe balance transactions (type=${type}); detalle registrado en el servidor`,
      });
      truncated = true;
    }
  }

  await scanType("charge", (tx) => {
    chargeCount += 1;
    addToChargesBucket(byCurrency, tx.currency, "grossMinorUnits", tx.amount);
    addToChargesBucket(byCurrency, tx.currency, "feeMinorUnits", tx.fee);
    addToChargesBucket(byCurrency, tx.currency, "chargesNetMinorUnits", tx.net);
    addToChargesBucket(byCurrency, tx.currency, "purchaseCount", 1);
  });

  await scanType("refund", (tx) => {
    refundCount += 1;
    addToChargesBucket(byCurrency, tx.currency, "refundedMinorUnits", Math.abs(tx.amount));
  });

  return {
    ok: errors.length === 0 && !truncated,
    available: true,
    truncated,
    chargeCount,
    refundCount,
    byCurrency,
    scannedTypes: SCANNED_BALANCE_TX_TYPES,
    semantics: {
      chargesNetMinorUnits:
        "Suma del campo 'net' que Stripe reporta por cada balance transaction type=charge dentro del período. " +
        "NO representa el efectivo final del período: no resta reembolsos, disputas ni otros ajustes posteriores " +
        "(que pueden registrarse como balance transactions separadas, incluso fuera de esta ventana).",
      refundedMinorUnits:
        "Suma independiente y verificable de balance transactions type=refund dentro del mismo período. Se " +
        "presenta junto a chargesNetMinorUnits, nunca restada automáticamente de él.",
      notScanned:
        `Solo se leen los tipos ${SCANNED_BALANCE_TX_TYPES.join(", ")}. Otros tipos de balance transaction de ` +
        "Stripe (adjustment, payment_failure_refund, transfer, payout, etc.) NO están incluidos en byCurrency.",
    },
    errors,
    source: "stripe.balanceTransactions (type=charge, type=refund) — whole Stripe account, any product",
  };
}

/**
 * Payout (status="paid") actually paid to creators within the period, by
 * `paidAt` — the verifiable confirmation date set by `updatePayout` when
 * an admin marks a payout as paid (see admin.controller.js). Never counts
 * pending/approved/rejected payouts here. Never throws (fix #4): any
 * unexpected MongoDB error is caught and surfaced as `available: false`
 * with sanitized details, never silently turned into zero totals.
 */
async function getPayoutsPaidInPeriod(startDate, endDate) {
  try {
    const [agg, missingPaidAtCount] = await Promise.all([
      Payout.aggregate([
        { $match: { status: "paid", paidAt: { $gte: startDate, $lt: endDate } } },
        {
          $group: {
            _id: null,
            totalCoins: { $sum: "$amountCoins" },
            totalUsd: { $sum: "$amountUsd" },
            count: { $sum: 1 },
          },
        },
      ]),
      // Historical "paid" Payout documents with no verifiable paidAt — never
      // guessed into any period, always surfaced as incomplete data instead.
      Payout.countDocuments({ status: "paid", paidAt: null }),
    ]);
    const totals = agg[0] || { totalCoins: 0, totalUsd: 0, count: 0 };
    return {
      available: true,
      totalCoins: totals.totalCoins || 0,
      totalUsd: totals.totalUsd || 0,
      count: totals.count || 0,
      source: "Payout.status=paid && Payout.paidAt within period",
      historicalIncomplete:
        missingPaidAtCount > 0
          ? {
              count: missingPaidAtCount,
              dataQuality: "incomplete",
              reason: "status=paid pero paidAt es null; no se puede atribuir a ningún período de forma verificable",
            }
          : null,
    };
  } catch (err) {
    return {
      available: false,
      reason: "query_failed",
      message: "No se pudo obtener Payout.status=paid del período; detalle registrado en el servidor",
      totalCoins: null,
      totalUsd: null,
      count: null,
      historicalIncomplete: null,
      ...sanitizeError("getPayoutsPaidInPeriod", err),
    };
  }
}

/**
 * Pending/approved Payout obligations — a live, "as of now" snapshot.
 * Never throws (fix #4): failures surface as `available: false`, never a
 * fabricated zero.
 */
async function getPayoutsPendingAsOfNow() {
  try {
    const agg = await Payout.aggregate([
      { $match: { status: { $in: ["pending", "approved"] } } },
      {
        $group: {
          _id: null,
          totalCoins: { $sum: "$amountCoins" },
          totalUsd: { $sum: "$amountUsd" },
          count: { $sum: 1 },
        },
      },
    ]);
    const totals = agg[0] || { totalCoins: 0, totalUsd: 0, count: 0 };
    return {
      available: true,
      totalCoins: totals.totalCoins || 0,
      totalUsd: totals.totalUsd || 0,
      count: totals.count || 0,
      source: "Payout.status in [pending, approved]",
      note:
        "Saldo pendiente 'as of now' (momento de generación del reporte), no un corte histórico al final del período: " +
        "el sistema no registra el estado de cada Payout en una fecha de corte pasada.",
    };
  } catch (err) {
    return {
      available: false,
      reason: "query_failed",
      message: "No se pudo obtener las obligaciones pendientes de Payout; detalle registrado en el servidor",
      totalCoins: null,
      totalUsd: null,
      count: null,
      ...sanitizeError("getPayoutsPendingAsOfNow", err),
    };
  }
}

/**
 * WithdrawalRequest "paid" records. The schema (see models/WithdrawalRequest.js)
 * has NO paidAt field and no stored external payment reference, so these
 * can never be verifiably attributed to a specific month — always
 * reported as an explicit, period-less, incomplete lifetime total. Never
 * throws (fix #4): failures surface as `available: false`.
 */
async function getWithdrawalRequestsPaidLifetimeIncomplete() {
  try {
    const agg = await WithdrawalRequest.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          totalCoins: { $sum: "$amountCoins" },
          totalUsd: { $sum: "$amountUSD" },
          count: { $sum: 1 },
        },
      },
    ]);
    const totals = agg[0] || { totalCoins: 0, totalUsd: 0, count: 0 };
    return {
      available: true,
      totalCoins: totals.totalCoins || 0,
      totalUsd: totals.totalUsd || 0,
      count: totals.count || 0,
      dataQuality: "incomplete",
      reason:
        "El esquema de WithdrawalRequest no tiene un campo paidAt ni una referencia externa verificable; " +
        "este total es de TODO el historial (no del período solicitado) y no debe presentarse como cifra mensual.",
    };
  } catch (err) {
    return {
      available: false,
      reason: "query_failed",
      message: "No se pudo obtener WithdrawalRequest.status=paid; detalle registrado en el servidor",
      totalCoins: null,
      totalUsd: null,
      count: null,
      ...sanitizeError("getWithdrawalRequestsPaidLifetimeIncomplete", err),
    };
  }
}

/**
 * Pending/approved WithdrawalRequest obligations — a live, "as of now"
 * snapshot. Never throws (fix #4): failures surface as `available: false`.
 */
async function getWithdrawalRequestsPendingAsOfNow() {
  try {
    const agg = await WithdrawalRequest.aggregate([
      { $match: { status: { $in: ["pending", "approved"] } } },
      {
        $group: {
          _id: null,
          totalCoins: { $sum: "$amountCoins" },
          totalUsd: { $sum: "$amountUSD" },
          count: { $sum: 1 },
        },
      },
    ]);
    const totals = agg[0] || { totalCoins: 0, totalUsd: 0, count: 0 };
    return {
      available: true,
      totalCoins: totals.totalCoins || 0,
      totalUsd: totals.totalUsd || 0,
      count: totals.count || 0,
      source: "WithdrawalRequest.status in [pending, approved]",
      note:
        "Saldo pendiente 'as of now' (momento de generación del reporte), no un corte histórico al final del período.",
    };
  } catch (err) {
    return {
      available: false,
      reason: "query_failed",
      message: "No se pudo obtener las obligaciones pendientes de WithdrawalRequest; detalle registrado en el servidor",
      totalCoins: null,
      totalUsd: null,
      count: null,
      ...sanitizeError("getWithdrawalRequestsPendingAsOfNow", err),
    };
  }
}

const FISCAL_DISCLAIMER = [
  "Este es un reporte OPERATIVO de solo lectura, no una declaración de impuestos.",
  "No se calculan impuestos automáticamente, no se emiten formularios 1099 ni 1042-S, y no se aplican retenciones automáticas.",
  "Las compras de Coins no se asumen como ingresos fiscales reconocidos en el momento del cobro.",
  "Los pagos a creadores no se clasifican automáticamente como gastos deducibles.",
  "La contabilidad futura de la compañía (Single-Member LLC) debe mantenerse separada del sistema fiscal de creadores internacionales.",
];

/**
 * Main entry point: builds the monthly financial report. Purely read-only;
 * no side effects anywhere (Stripe or MongoDB). Each independent source is
 * isolated (fix #4): an unexpected failure in one (Stripe scan, Coins
 * reconciliation, or any Payout/WithdrawalRequest query) never discards
 * the other sources that succeeded — it is surfaced as `available: false`
 * with a sanitized reason on that source alone.
 */
async function getMonthlyFinancialReport(rawOptions = {}) {
  const options = parseAndValidateOptions(rawOptions);
  const { startDate, endDate, page, coinsPageSize, maxBalanceTransactionPages } = options;

  const generatedAt = new Date();
  const stripeConfigured = isStripeConfigured();

  let stripeChargesSummary;
  let coinsReconciliation;

  if (!stripeConfigured) {
    stripeChargesSummary = unavailableStripeChargesSummary(
      "stripe_not_configured",
      "STRIPE_SECRET_KEY ausente; no se puede obtener el resumen de cobros de Stripe"
    );
    coinsReconciliation = unavailableCoinsReconciliation(
      "stripe_not_configured",
      "Stripe no está configurado (STRIPE_SECRET_KEY ausente); no se puede conciliar"
    );
  } else {
    const stripe = getStripe();
    // Promise.allSettled (fix #4): an unexpected rejection from EITHER call
    // must never discard the other's successfully-fetched data.
    const [stripeResult, coinsResult] = await Promise.allSettled([
      scanStripeChargesSummary(stripe, { startDate, endDate, maxPages: maxBalanceTransactionPages }),
      reconcileCoinPurchases({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        page,
        pageSize: coinsPageSize,
        maxBalanceTransactionPages,
      }),
    ]);

    if (stripeResult.status === "fulfilled") {
      stripeChargesSummary = stripeResult.value;
    } else {
      sanitizeError("stripeChargesSummary", stripeResult.reason);
      stripeChargesSummary = unavailableStripeChargesSummary(
        "unexpected_error",
        "Error inesperado obteniendo el resumen de cobros de Stripe; detalle registrado en el servidor"
      );
    }

    if (coinsResult.status === "fulfilled") {
      coinsReconciliation = coinsResult.value;
    } else {
      sanitizeError("coinsReconciliation", coinsResult.reason);
      coinsReconciliation = unavailableCoinsReconciliation(
        "unexpected_error",
        "Error inesperado ejecutando la conciliación de Coins; detalle registrado en el servidor"
      );
    }
  }

  // Each getter below catches its own errors and never throws — plain
  // Promise.all is safe here (fix #4 is satisfied at the per-getter level).
  const [payoutsPaidInPeriod, payoutsPendingAsOfNow, withdrawalRequestsPaidLifetimeIncomplete, withdrawalRequestsPendingAsOfNow] =
    await Promise.all([
      getPayoutsPaidInPeriod(startDate, endDate),
      getPayoutsPendingAsOfNow(),
      getWithdrawalRequestsPaidLifetimeIncomplete(),
      getWithdrawalRequestsPendingAsOfNow(),
    ]);

  const warnings = [];
  if (!stripeConfigured) {
    warnings.push("Stripe no está configurado: stripeChargesSummary y coinsReconciliation no están disponibles (unavailable).");
  } else {
    if (stripeChargesSummary.available === false) {
      warnings.push(`stripeChargesSummary no está disponible (${stripeChargesSummary.reason}); ver stripeChargesSummary.message.`);
    } else if (stripeChargesSummary.truncated) {
      warnings.push(
        "El escaneo de cobros/reembolsos de Stripe fue truncado o encontró errores parciales; stripeChargesSummary no representa el total completo del mes (ver stripeChargesSummary.errors)."
      );
    }
    if (coinsReconciliation.available === false) {
      warnings.push(`coinsReconciliation no está disponible (${coinsReconciliation.reason}); ver coinsReconciliation.message.`);
    } else if (!coinsReconciliation.complete) {
      warnings.push(
        "coinsReconciliation no cubrió todos los registros del mes (ver pagination/warnings dentro de coinsReconciliation); no lo presentes como el subtotal global de Coins del mes."
      );
    }
  }
  if (payoutsPaidInPeriod.available === false) {
    warnings.push("payoutsPaidInPeriod no está disponible; no se pudo confirmar lo pagado a creadores en el período (ver payouts.paidInPeriod.message).");
  } else if (payoutsPaidInPeriod.historicalIncomplete) {
    warnings.push(
      `Hay ${payoutsPaidInPeriod.historicalIncomplete.count} Payout(s) con status=paid sin paidAt verificable; se excluyen de payoutsPaidInPeriod y se reportan en historicalIncomplete. Por esto, complete=false hasta que estos registros históricos se corrijan.`
    );
  }
  if (payoutsPendingAsOfNow.available === false) {
    warnings.push("payoutsPendingAsOfNow no está disponible (ver payouts.pendingAsOfNow.message).");
  }
  if (withdrawalRequestsPaidLifetimeIncomplete.available === false) {
    warnings.push("withdrawalRequestsPaidLifetimeIncomplete no está disponible (ver withdrawalRequests.paidLifetimeIncomplete.message).");
  } else {
    warnings.push(
      "withdrawalRequestsPaidLifetimeIncomplete es un total de TODO el historial (no del mes solicitado): WithdrawalRequest no tiene un campo paidAt verificable."
    );
  }
  if (withdrawalRequestsPendingAsOfNow.available === false) {
    warnings.push("withdrawalRequestsPendingAsOfNow no está disponible (ver withdrawalRequests.pendingAsOfNow.message).");
  }

  // ── Fix #1: technical query coverage vs. historical payment data quality,
  // kept strictly separate — `complete` is the AND of both, never either
  // one alone, so "total financial integrity" is never implied while
  // unattributable creator-payment records exist.
  const stripeChargesOk =
    stripeChargesSummary.available !== false &&
    stripeChargesSummary.ok === true &&
    !stripeChargesSummary.truncated &&
    stripeChargesSummary.errors.length === 0;
  const coinsOk = coinsReconciliation.available !== false && coinsReconciliation.complete === true;
  const creatorPaymentsQueriesOk =
    payoutsPaidInPeriod.available !== false &&
    payoutsPendingAsOfNow.available !== false &&
    withdrawalRequestsPaidLifetimeIncomplete.available !== false &&
    withdrawalRequestsPendingAsOfNow.available !== false;

  const technicallyComplete = stripeConfigured && stripeChargesOk && coinsOk && creatorPaymentsQueriesOk;

  const historicalDataComplete = payoutsPaidInPeriod.available !== false && !payoutsPaidInPeriod.historicalIncomplete;

  const complete = technicallyComplete && historicalDataComplete;

  return {
    ok: true,
    complete,
    queryCoverage: {
      technicallyComplete,
      stripeChargesScanComplete: stripeChargesOk,
      coinsReconciliationComplete: coinsOk,
      creatorPaymentsQueriesComplete: creatorPaymentsQueriesOk,
      note:
        "Cobertura TÉCNICA de las fuentes de este reporte (si pudieron leerse sin truncar ni fallar). Esto NO certifica " +
        "que los datos históricos de pagos a creadores sean completos/atribuibles — ver creatorPayments.dataQuality.",
    },
    company: "MeetYouLive Technologies LLC",
    reportType: "monthly_financial_report",
    fiscalScope: "operational_report_only_not_tax_filing",
    stripeConfigured,
    period: {
      year: options.year,
      month: options.month,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    generatedAt: generatedAt.toISOString(),
    stripeChargesSummary,
    coinsReconciliation,
    creatorPayments: {
      payouts: {
        paidInPeriod: payoutsPaidInPeriod,
        pendingAsOfNow: payoutsPendingAsOfNow,
      },
      withdrawalRequests: {
        paidLifetimeIncomplete: withdrawalRequestsPaidLifetimeIncomplete,
        pendingAsOfNow: withdrawalRequestsPendingAsOfNow,
      },
      doubleCountingNote:
        "Payout y WithdrawalRequest son modelos independientes sin referencia cruzada entre sí; sus totales NUNCA se " +
        "suman en una sola cifra combinada en este reporte, para evitar cualquier riesgo de doble conteo del mismo pago físico.",
      dataQuality: {
        historicalDataComplete,
        reason: historicalDataComplete
          ? null
          : payoutsPaidInPeriod.available === false
          ? "No se pudo consultar Payout.status=paid del período (ver payouts.paidInPeriod)."
          : "Existen Payout.status=paid sin paidAt verificable, no atribuibles a ningún período (ver payouts.paidInPeriod.historicalIncomplete). " +
            "Este reporte NUNCA declara integridad financiera total (complete=true) mientras esto siga abierto.",
      },
    },
    fiscalDisclaimer: FISCAL_DISCLAIMER,
    warnings,
  };
}

module.exports = {
  getMonthlyFinancialReport,
  FinancialReportValidationError,
  // exported for tests only
  parseAndValidateOptions,
  parseStrictInteger,
  scanStripeChargesSummary,
};
