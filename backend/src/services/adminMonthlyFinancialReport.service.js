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
 * `complete` SEMANTICS
 * ─────────────────────────────────────────────────────────────────────────
 * `complete` is `true` only when: Stripe is configured, the Stripe charges
 * scan finished without truncation/errors, `coinsReconciliation.complete`
 * is `true` (full PR #1084 coverage for the requested page), and the
 * MongoDB Payout/WithdrawalRequest aggregates completed without error. It
 * is never inferred from totals being non-zero, and a report can be
 * `complete` while still containing real Stripe discrepancies (see
 * `coinsReconciliation.discrepancies`) or incomplete historical creator-
 * payment records (see `creatorPayments.*.historicalIncomplete`).
 */

const Stripe = require("stripe");
const Payout = require("../models/Payout.js");
const WithdrawalRequest = require("../models/WithdrawalRequest.js");
const {
  reconcileCoinPurchases,
  isStripeConfigured,
  addToCurrencyBucket,
} = require("./stripeReconciliation.service.js");

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;
const DEFAULT_MAX_BALANCE_TX_PAGES = 5;
const MAX_BALANCE_TX_PAGES_CAP = 20;
const BALANCE_TX_PAGE_LIMIT = 100;
const DEFAULT_COINS_PAGE_SIZE = 100;

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
 * Validates and normalizes the requested monthly period + pagination.
 * Throws FinancialReportValidationError (mapped to HTTP 400 by the
 * controller) on any invalid input.
 */
function parseAndValidateOptions(rawOptions = {}) {
  const { year, month, page, coinsPageSize, maxBalanceTransactionPages } = rawOptions;

  const parsedYear = parseInt(year, 10);
  const parsedMonth = parseInt(month, 10);

  if (!Number.isInteger(parsedYear) || parsedYear < MIN_YEAR || parsedYear > MAX_YEAR) {
    throw new FinancialReportValidationError(
      `year es obligatorio y debe ser un entero entre ${MIN_YEAR} y ${MAX_YEAR}`
    );
  }
  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    throw new FinancialReportValidationError("month es obligatorio y debe ser un entero entre 1 y 12");
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
 * Bounded, read-only scan of Stripe Balance Transactions for the WHOLE
 * Stripe account (any product) within [startDate, endDate). Sums gross/
 * fee/net (from `type: "charge"`) and refunded amounts (from
 * `type: "refund"`) per currency, using Stripe's own authoritative figures
 * — never estimated, never derived from a percentage.
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
      errors.push({ scope: `balance_transactions_${type}`, message: err?.message || "Error listando balance transactions" });
      truncated = true;
    }
  }

  await scanType("charge", (tx) => {
    chargeCount += 1;
    addToCurrencyBucket(byCurrency, tx.currency, "grossMinorUnits", tx.amount);
    addToCurrencyBucket(byCurrency, tx.currency, "feeMinorUnits", tx.fee);
    addToCurrencyBucket(byCurrency, tx.currency, "netMinorUnits", tx.net);
    addToCurrencyBucket(byCurrency, tx.currency, "purchaseCount", 1);
  });

  await scanType("refund", (tx) => {
    refundCount += 1;
    addToCurrencyBucket(byCurrency, tx.currency, "refundedMinorUnits", Math.abs(tx.amount));
  });

  return {
    ok: errors.length === 0 && !truncated,
    truncated,
    chargeCount,
    refundCount,
    byCurrency,
    errors,
    source: "stripe.balanceTransactions (type=charge, type=refund) — whole Stripe account, any product",
  };
}

/**
 * Payout (status="paid") actually paid to creators within the period, by
 * `paidAt` — the verifiable confirmation date set by `updatePayout` when
 * an admin marks a payout as paid (see admin.controller.js). Never counts
 * pending/approved/rejected payouts here.
 */
async function getPayoutsPaidInPeriod(startDate, endDate) {
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
}

/** Pending/approved Payout obligations — a live, "as of now" snapshot. */
async function getPayoutsPendingAsOfNow() {
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
    totalCoins: totals.totalCoins || 0,
    totalUsd: totals.totalUsd || 0,
    count: totals.count || 0,
    source: "Payout.status in [pending, approved]",
    note:
      "Saldo pendiente 'as of now' (momento de generación del reporte), no un corte histórico al final del período: " +
      "el sistema no registra el estado de cada Payout en una fecha de corte pasada.",
  };
}

/**
 * WithdrawalRequest "paid" records. The schema (see models/WithdrawalRequest.js)
 * has NO paidAt field and no stored external payment reference, so these
 * can never be verifiably attributed to a specific month — always
 * reported as an explicit, period-less, incomplete lifetime total.
 */
async function getWithdrawalRequestsPaidLifetimeIncomplete() {
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
    totalCoins: totals.totalCoins || 0,
    totalUsd: totals.totalUsd || 0,
    count: totals.count || 0,
    dataQuality: "incomplete",
    reason:
      "El esquema de WithdrawalRequest no tiene un campo paidAt ni una referencia externa verificable; " +
      "este total es de TODO el historial (no del período solicitado) y no debe presentarse como cifra mensual.",
  };
}

/** Pending/approved WithdrawalRequest obligations — a live, "as of now" snapshot. */
async function getWithdrawalRequestsPendingAsOfNow() {
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
    totalCoins: totals.totalCoins || 0,
    totalUsd: totals.totalUsd || 0,
    count: totals.count || 0,
    source: "WithdrawalRequest.status in [pending, approved]",
    note:
      "Saldo pendiente 'as of now' (momento de generación del reporte), no un corte histórico al final del período.",
  };
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
 * no side effects anywhere (Stripe or MongoDB).
 */
async function getMonthlyFinancialReport(rawOptions = {}) {
  const options = parseAndValidateOptions(rawOptions);
  const { startDate, endDate, page, coinsPageSize, maxBalanceTransactionPages } = options;

  const generatedAt = new Date();
  const stripeConfigured = isStripeConfigured();

  let stripeChargesSummary;
  let coinsReconciliation;

  if (!stripeConfigured) {
    stripeChargesSummary = {
      ok: false,
      available: false,
      reason: "stripe_not_configured",
      message: "STRIPE_SECRET_KEY ausente; no se puede obtener el resumen de cobros de Stripe",
    };
    coinsReconciliation = {
      ok: false,
      complete: false,
      reconciled: false,
      available: false,
      stripeConfigured: false,
      message: "Stripe no está configurado (STRIPE_SECRET_KEY ausente); no se puede conciliar",
    };
  } else {
    const stripe = getStripe();
    [stripeChargesSummary, coinsReconciliation] = await Promise.all([
      scanStripeChargesSummary(stripe, { startDate, endDate, maxPages: maxBalanceTransactionPages }),
      reconcileCoinPurchases({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        page,
        pageSize: coinsPageSize,
        maxBalanceTransactionPages,
      }),
    ]);
  }

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
    if (stripeChargesSummary.truncated) {
      warnings.push(
        "El escaneo de cobros/reembolsos de Stripe fue truncado por el límite de páginas; stripeChargesSummary no representa el total completo del mes."
      );
    }
    if (!coinsReconciliation.complete) {
      warnings.push(
        "coinsReconciliation no cubrió todos los registros del mes (ver pagination/warnings dentro de coinsReconciliation); no lo presentes como el subtotal global de Coins del mes."
      );
    }
  }
  if (payoutsPaidInPeriod.historicalIncomplete) {
    warnings.push(
      `Hay ${payoutsPaidInPeriod.historicalIncomplete.count} Payout(s) con status=paid sin paidAt verificable; se excluyen de payoutsPaidInPeriod y se reportan en historicalIncomplete.`
    );
  }
  warnings.push(
    "withdrawalRequestsPaidLifetimeIncomplete es un total de TODO el historial (no del mes solicitado): WithdrawalRequest no tiene un campo paidAt verificable."
  );

  const complete =
    stripeConfigured &&
    stripeChargesSummary.ok === true &&
    !stripeChargesSummary.truncated &&
    stripeChargesSummary.errors.length === 0 &&
    coinsReconciliation.complete === true;

  return {
    ok: true,
    complete,
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
  scanStripeChargesSummary,
};
