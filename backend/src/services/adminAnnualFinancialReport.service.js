"use strict";

/**
 * Admin-only, read-only ANNUAL FINANCIAL REPORT for MeetYouLive
 * Technologies LLC (Single-Member LLC).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SCOPE
 * ─────────────────────────────────────────────────────────────────────────
 * This is the first phase of the annual report. It is an OPERATIONAL
 * report, not a tax filing: it never computes taxes, never issues
 * 1099/1042-S forms, never applies automatic withholding, never builds a
 * general ledger or expense module, and never integrates with banking
 * systems. External company expenses and bank account movements are
 * entirely OUTSIDE this report's scope and are never inferred from Stripe
 * activity.
 *
 * This service NEVER writes to Stripe or MongoDB and never touches
 * Checkout, webhooks, Coins balances/transfers, Payout/WithdrawalRequest
 * mutations, auth, Discover, Matches, Live, or Agora code paths.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW IT IS BUILT (fix: reuse, never duplicate)
 * ─────────────────────────────────────────────────────────────────────────
 * This service is a thin orchestration layer over
 * `getMonthlyFinancialReport` (adminMonthlyFinancialReport.service.js,
 * unchanged, called in-process — never via 12 internal HTTP calls). For
 * each of the requested year's 12 UTC calendar months it calls that
 * function exactly once, with a bounded concurrency (to respect Stripe
 * rate limits) and isolates failures per month (`Promise.allSettled`): one
 * month's unexpected failure NEVER discards the other 11 months' valid
 * results.
 *
 * Each monthly call reuses that service's OWN pagination defaults for
 * Stripe balance transactions and Coins reconciliation (first page only,
 * unless the caller overrides `coinsPageSize`/`maxBalanceTransactionPages`).
 * A monthly result whose `coinsReconciliation` or `stripeChargesSummary`
 * did not cover the full month (truncated / `hasMore`) is NEVER treated as
 * if it were that month's total — it is surfaced with `monthStatus:
 * "partial"` and the underlying monthly report's own warnings are kept
 * intact for drill-down (`months[].report`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ANNUAL AGGREGATION RULES (never fabricate, never double-count)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Stripe charges/refunds and Payout.paidInPeriod totals ARE legitimately
 *    additive across months (each month's window is disjoint), so the
 *    annual byCurrency/byMonth sums are plain sums of the months that were
 *    actually readable. Months that failed or whose source was
 *    `available: false` are EXCLUDED from the sum (never substituted with
 *    zero) and listed explicitly in `missingMonths`/`partialMonths`.
 * 2. `pendingAsOfNow` (Payout and WithdrawalRequest) and
 *    `withdrawalRequestsPaidLifetimeIncomplete` and the Payout
 *    `historicalIncomplete` count are NOT scoped to a calendar month at
 *    all — the underlying monthly service queries them the SAME way
 *    regardless of which month was requested (a live "as of now" / lifetime
 *    snapshot). This annual report therefore takes ONE such snapshot (from
 *    the first successfully-fetched month), NEVER sums it across all 12
 *    months (that would multiply a point-in-time balance by up to 12),
 *    and exposes it under `creatorPaymentsSnapshot`, separate from the
 *    additive per-period totals.
 * 3. The annual totals are marked DEFINITIVE (`annualTotals.*.isDefinitive
 *    = true`) ONLY when every one of the 12 months achieved full,
 *    non-truncated coverage for that specific source. Otherwise the
 *    summed figure is still returned (it is a real, verifiable partial
 *    subtotal) but explicitly labeled `status: "partial"` (or
 *    `"unavailable"` if zero months could be read) with the exact list of
 *    missing/partial months and the reason — it is NEVER presented as the
 *    final annual total.
 * 4. Stripe's `chargesNetMinorUnits` is never relabeled as final cash
 *    position, company profit, or bank balance — see
 *    `adminMonthlyFinancialReport.service.js` semantics, unchanged here.
 */

const {
  getMonthlyFinancialReport,
  FinancialReportValidationError,
  parseStrictInteger,
} = require("./adminMonthlyFinancialReport.service.js");

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;
const DEFAULT_MAX_BALANCE_TX_PAGES = 3; // lower than the monthly default (5): bounds total Stripe calls across 12 months
const MAX_BALANCE_TX_PAGES_CAP = 10;
const DEFAULT_COINS_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 4;

const ALL_MONTHS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

function sanitizeError(scope, err) {
  // eslint-disable-next-line no-console
  console.error(`adminAnnualFinancialReport.${scope} error:`, err);
  return {
    scope,
    type: typeof err?.type === "string" ? err.type : null,
    code: typeof err?.code === "string" || typeof err?.code === "number" ? err.code : null,
  };
}

function parseAndValidateAnnualOptions(rawOptions = {}) {
  const { year, coinsPageSize, maxBalanceTransactionPages, concurrency } = rawOptions;

  const parsedYear = parseStrictInteger(year);
  if (!Number.isInteger(parsedYear) || parsedYear < MIN_YEAR || parsedYear > MAX_YEAR) {
    throw new FinancialReportValidationError(
      `year es obligatorio y debe ser un entero completo (sin decimales ni texto adicional) entre ${MIN_YEAR} y ${MAX_YEAR}`
    );
  }

  const parsedCoinsPageSize = Math.min(100, Math.max(1, parseInt(coinsPageSize, 10) || DEFAULT_COINS_PAGE_SIZE));
  const parsedMaxBtPages = Math.min(
    MAX_BALANCE_TX_PAGES_CAP,
    Math.max(1, parseInt(maxBalanceTransactionPages, 10) || DEFAULT_MAX_BALANCE_TX_PAGES)
  );
  const parsedConcurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(1, parseInt(concurrency, 10) || DEFAULT_CONCURRENCY)
  );

  return {
    year: parsedYear,
    coinsPageSize: parsedCoinsPageSize,
    maxBalanceTransactionPages: parsedMaxBtPages,
    concurrency: parsedConcurrency,
  };
}

/**
 * Runs the 12 monthly report calls in bounded-concurrency batches so no
 * more than `concurrency` months hit Stripe at the same time. Each month
 * is isolated via `Promise.allSettled`: an unexpected throw from one month
 * never discards the others.
 */
async function fetchAllMonths({ year, coinsPageSize, maxBalanceTransactionPages, concurrency }) {
  const results = [];
  for (let i = 0; i < ALL_MONTHS.length; i += concurrency) {
    const batch = ALL_MONTHS.slice(i, i + concurrency);
    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(
      batch.map((month) =>
        getMonthlyFinancialReport({
          year,
          month,
          page: 1,
          coinsPageSize,
          maxBalanceTransactionPages,
        })
      )
    );

    settled.forEach((outcome, idx) => {
      const month = batch[idx];
      if (outcome.status === "fulfilled") {
        const report = outcome.value;
        results.push({
          month,
          monthStatus: report.complete ? "complete" : "partial",
          report,
          error: null,
        });
      } else {
        sanitizeError(`month_${month}`, outcome.reason);
        results.push({
          month,
          monthStatus: "unavailable",
          report: null,
          error: {
            message: `No se pudo generar el reporte del mes ${month}; detalle registrado en el servidor`,
          },
        });
      }
    });
  }
  results.sort((a, b) => a.month - b.month);
  return results;
}

/**
 * Shared coverage-metadata builder (fix round 2, correction 1): every
 * aggregator below reports which months contributed a DEFINITIVE figure
 * (`completeMonths`), which contributed only a non-definitive/truncated
 * subtotal (`partialMonths`), and which contributed nothing at all
 * (`missingMonths`, NEVER treated as zero). `isDefinitive`/`status` are
 * derived purely from these three disjoint lists, so any future consumer
 * of this API can tell a verified annual total from an observed subtotal
 * without re-deriving the logic itself.
 */
function buildCoverage({ missingMonths, partialMonths }) {
  const completeMonths = ALL_MONTHS.filter(
    (month) => !missingMonths.includes(month) && !partialMonths.includes(month)
  );
  const isDefinitive = missingMonths.length === 0 && partialMonths.length === 0;
  const status = isDefinitive ? "complete" : missingMonths.length === ALL_MONTHS.length ? "unavailable" : "partial";
  return { completeMonths, partialMonths, missingMonths, isDefinitive, status };
}

function emptyAnnualBucket() {
  return {
    grossMinorUnits: 0,
    feeMinorUnits: 0,
    chargesNetMinorUnits: 0,
    refundedMinorUnits: 0,
    purchaseCount: 0,
    monthsIncluded: 0,
  };
}

/**
 * Sums `stripeChargesSummary.byCurrency` across every readable month.
 * Months whose summary is unavailable or not `isDefinitive` are never
 * silently treated as zero — they are excluded from the sum and listed.
 */
function aggregateStripeCharges(monthlyResults) {
  const byCurrency = {};
  const missingMonths = [];
  const partialMonths = [];

  for (const entry of monthlyResults) {
    const summary = entry.report?.stripeChargesSummary;
    if (!summary || summary.available === false) {
      missingMonths.push(entry.month);
      continue;
    }
    if (!summary.isDefinitive) partialMonths.push(entry.month);
    for (const [code, bucket] of Object.entries(summary.byCurrency || {})) {
      if (!byCurrency[code]) byCurrency[code] = emptyAnnualBucket();
      byCurrency[code].grossMinorUnits += bucket.grossMinorUnits || 0;
      byCurrency[code].feeMinorUnits += bucket.feeMinorUnits || 0;
      byCurrency[code].chargesNetMinorUnits += bucket.chargesNetMinorUnits || 0;
      byCurrency[code].refundedMinorUnits += bucket.refundedMinorUnits || 0;
      byCurrency[code].purchaseCount += bucket.purchaseCount || 0;
      byCurrency[code].monthsIncluded += 1;
    }
  }

  const coverage = buildCoverage({ missingMonths, partialMonths });
  const { isDefinitive, status, completeMonths } = coverage;

  return {
    status,
    isDefinitive,
    byCurrency,
    completeMonths,
    missingMonths,
    partialMonths,
    coverage,
    note:
      status === "complete"
        ? "Los 12 meses del año tuvieron cobertura completa y no truncada del escaneo de cobros/reembolsos de Stripe."
        : "Esta suma es un SUBTOTAL OBSERVADO, no el total anual definitivo: excluye los meses listados en " +
          "missingMonths (sin datos) y marca partialMonths (datos truncados/parciales) — ningún mes faltante se " +
          "sustituyó por cero. Ver coverage.completeMonths para los únicos meses cuya cifra es definitiva.",
  };
}

/**
 * Sums `coinsReconciliation.summary.byCurrency` across every month whose
 * reconciliation was readable (`available !== false`). A month whose
 * reconciliation did not cover the full range (`complete !== true`,
 * i.e. `scope !== "full_range"`) is still summed (it is a real, verifiable
 * number for the page actually read) but flagged in `partialMonths` and
 * the annual coverage status is downgraded — it is never presented as if
 * it were that month's total.
 *
 * ── Correction 2 (round 2 review): `complete` (query coverage) and
 * `reconciled` (financial reconciliation outcome — zero discrepancies
 * verified) are DELIBERATELY SEPARATE, mirroring
 * stripeReconciliation.service.js's own documented distinction (see its
 * header, point 7). A year can have `coverage.isDefinitive: true` (every
 * month's Coins query was read in full) while `reconciled: false`
 * (one or more months still have open discrepancies). This aggregator
 * NEVER derives `reconciled` from coverage alone: it is `true` only when
 * (a) every month's reconciliation was available, (b) every month reached
 * `scope: "full_range"`, AND (c) every month's own `discrepancies.total`
 * is a verified `0` — a month whose discrepancy count itself could not be
 * read is treated as "reconciliation unknown", never silently assumed to
 * be `0` discrepancies.
 */
function aggregateCoinsReconciliation(monthlyResults) {
  const byCurrency = {};
  const missingMonths = [];
  const partialMonths = [];
  const monthsWithDiscrepancies = [];
  const monthsWithUnknownDiscrepancyCount = [];
  let totalDiscrepancies = 0;

  for (const entry of monthlyResults) {
    const coins = entry.report?.coinsReconciliation;
    if (!coins || coins.available === false) {
      missingMonths.push(entry.month);
      continue;
    }
    if (!coins.complete) partialMonths.push(entry.month);

    const discrepancyCount = coins.discrepancies?.total;
    if (typeof discrepancyCount === "number" && !Number.isNaN(discrepancyCount)) {
      totalDiscrepancies += discrepancyCount;
      if (discrepancyCount > 0) monthsWithDiscrepancies.push(entry.month);
    } else {
      monthsWithUnknownDiscrepancyCount.push(entry.month);
    }

    const sourceByCurrency = coins.summary?.byCurrency || coins.byCurrency || null;
    if (sourceByCurrency && typeof sourceByCurrency === "object") {
      for (const [code, bucket] of Object.entries(sourceByCurrency)) {
        if (!byCurrency[code]) byCurrency[code] = { monthsIncluded: 0, fields: {} };
        byCurrency[code].monthsIncluded += 1;
        for (const [field, value] of Object.entries(bucket || {})) {
          if (typeof value !== "number" || Number.isNaN(value)) continue;
          byCurrency[code].fields[field] = (byCurrency[code].fields[field] || 0) + value;
        }
      }
    }
  }

  const coverage = buildCoverage({ missingMonths, partialMonths });
  const { isDefinitive, status, completeMonths } = coverage;

  // `reconciled` is NEVER true unless coverage is definitive AND every
  // month's discrepancy count was verifiably zero. Any unavailable month,
  // any partial-coverage month, any month with discrepancies > 0, or any
  // month whose discrepancy count itself is unknown forces `reconciled:
  // false` — this report never "declares Coins reconciled" while any of
  // those remain open.
  const reconciled =
    isDefinitive && monthsWithDiscrepancies.length === 0 && monthsWithUnknownDiscrepancyCount.length === 0;

  return {
    status,
    isDefinitive,
    reconciled,
    totalDiscrepancies,
    monthsWithDiscrepancies,
    monthsWithUnknownDiscrepancyCount,
    byCurrency,
    completeMonths,
    missingMonths,
    partialMonths,
    coverage,
    note:
      status === "complete"
        ? "Los 12 meses cubrieron el rango completo (scope=full_range) de la conciliación de Coins (PR #1084)."
        : "Esta suma es un SUBTOTAL OBSERVADO de Coins, no el total anual definitivo: algunos meses no alcanzaron " +
          "scope=full_range (ver partialMonths) o no estuvieron disponibles (ver missingMonths). Ningún mes " +
          "faltante se sustituyó por cero. Ver coverage.completeMonths para los únicos meses cuya cifra es definitiva.",
    reconciledNote: reconciled
      ? "`reconciled: true` — cobertura completa en los 12 meses y 0 discrepancias verificadas en cada uno (ver " +
        "stripeReconciliation.service.js, PR #1084)."
      : "`reconciled: false` — NO declarar Coins conciliados para este año. Puede deberse a cobertura incompleta " +
        "(ver coverage), a discrepancias abiertas en monthsWithDiscrepancies, y/o a meses cuyo propio conteo de " +
        "discrepancias no pudo verificarse (monthsWithUnknownDiscrepancyCount). `complete`/`isDefinitive` describen " +
        "ÚNICAMENTE cobertura de consulta — nunca ausencia de discrepancias.",
  };
}

/**
 * Sums `creatorPayments.payouts.paidInPeriod` across every month whose
 * query was readable. This IS legitimately additive (each month's
 * `paidAt` window is disjoint, sourced from `Payout.status=paid`).
 */
function aggregateCreatorPayoutsPaidInPeriod(monthlyResults) {
  let totalCoins = 0;
  let totalUsd = 0;
  let count = 0;
  const missingMonths = [];
  const monthsWithUnattributedHistory = [];

  for (const entry of monthlyResults) {
    const paid = entry.report?.creatorPayments?.payouts?.paidInPeriod;
    if (!paid || paid.available === false) {
      missingMonths.push(entry.month);
      continue;
    }
    totalCoins += paid.totalCoins || 0;
    totalUsd += paid.totalUsd || 0;
    count += paid.count || 0;
    if (paid.historicalIncomplete) monthsWithUnattributedHistory.push(entry.month);
  }

  const coverage = buildCoverage({ missingMonths, partialMonths: monthsWithUnattributedHistory });
  const { isDefinitive, status, completeMonths } = coverage;

  return {
    status,
    isDefinitive,
    totalCoins,
    totalUsd,
    count,
    completeMonths,
    missingMonths,
    monthsWithUnattributedHistory,
    coverage,
    source: "Payout.status=paid && Payout.paidAt within each of the 12 UTC calendar months (summed, never double counted)",
    note:
      status === "complete"
        ? "Los 12 meses pudieron leerse en su totalidad y no existen Payout.status=paid sin paidAt verificable."
        : "Suma de los meses efectivamente leídos (nunca se sustituyó un mes faltante por cero). Si " +
          "monthsWithUnattributedHistory no está vacío, existen Payout.status=paid sin paidAt verificable " +
          "reportados por esos meses — ver months[].report.creatorPayments.payouts.paidInPeriod.historicalIncomplete. " +
          "Ver coverage.completeMonths para los únicos meses cuya cifra es definitiva.",
  };
}

/**
 * Point-in-time snapshots (Payout/WithdrawalRequest pending, lifetime
 * WithdrawalRequest paid, Payout paid-without-paidAt count) are NOT
 * month-scoped: the monthly service queries them identically regardless
 * of which month/year was requested. Summing them across 12 calls would
 * multiply a single current balance by up to 12x — this picks exactly ONE
 * snapshot from the first month that was actually readable.
 */
function pickCreatorPaymentsSnapshot(monthlyResults) {
  const source = monthlyResults.find((entry) => entry.report?.creatorPayments)?.report?.creatorPayments;
  if (!source) {
    return {
      available: false,
      reason: "no_month_available",
      message: "Ningún mes del año pudo leerse; no hay snapshot de obligaciones pendientes disponible.",
    };
  }
  return {
    available: true,
    payoutsPendingAsOfNow: source.payouts.pendingAsOfNow,
    withdrawalRequestsPendingAsOfNow: source.withdrawalRequests.pendingAsOfNow,
    withdrawalRequestsPaidLifetimeIncomplete: source.withdrawalRequests.paidLifetimeIncomplete,
    payoutsPaidWithoutPaidAt: source.payouts.paidInPeriod?.historicalIncomplete || null,
    scopeNote:
      "Estas cifras son una FOTOGRAFÍA actual (momento de generación del reporte), tomada UNA sola vez de entre " +
      "los 12 meses consultados — nunca sumada ni multiplicada por mes, porque la consulta subyacente no está " +
      "acotada a ningún período. No representan un corte histórico de fin de año.",
  };
}

const ANNUAL_FISCAL_DISCLAIMER = [
  "Este es un reporte OPERATIVO anual de solo lectura, primera fase — no una declaración de impuestos.",
  "No se calculan impuestos automáticamente, no se emiten formularios 1099 ni 1042-S, y no se aplican retenciones automáticas.",
  "No se incluye un libro mayor (general ledger), módulo de gastos ni integraciones bancarias en esta fase.",
  "Los gastos externos de la empresa y los movimientos de su(s) cuenta(s) bancaria(s) NO están incluidos en este reporte.",
  "Las compras de Coins no se asumen como ingresos fiscales reconocidos en el momento del cobro.",
  "Los pagos a creadores no se clasifican automáticamente como gastos deducibles.",
  "La contabilidad futura de la compañía (Single-Member LLC) debe mantenerse separada del sistema fiscal de creadores internacionales.",
];

/**
 * Main entry point: builds the annual financial report for `year` by
 * orchestrating 12 in-process calls to `getMonthlyFinancialReport`
 * (bounded concurrency, isolated failures) and aggregating the results
 * without duplicating any of that service's query/aggregation logic.
 */
async function getAnnualFinancialReport(rawOptions = {}) {
  const options = parseAndValidateAnnualOptions(rawOptions);
  const generatedAt = new Date();

  const monthlyResults = await fetchAllMonths(options);

  const months = monthlyResults.map((entry) => ({
    month: entry.month,
    status: entry.monthStatus,
    period: entry.report
      ? { year: options.year, month: entry.month, startDate: entry.report.period.startDate, endDate: entry.report.period.endDate }
      : { year: options.year, month: entry.month, startDate: null, endDate: null },
    warnings: entry.report?.warnings || (entry.error ? [entry.error.message] : []),
    report: entry.report,
  }));

  const unavailableMonths = monthlyResults.filter((entry) => entry.monthStatus === "unavailable").map((entry) => entry.month);
  const partialMonths = monthlyResults.filter((entry) => entry.monthStatus === "partial").map((entry) => entry.month);

  const stripeCharges = aggregateStripeCharges(monthlyResults);
  const coinsReconciliation = aggregateCoinsReconciliation(monthlyResults);
  const creatorPayoutsPaidInPeriod = aggregateCreatorPayoutsPaidInPeriod(monthlyResults);
  const creatorPaymentsSnapshot = pickCreatorPaymentsSnapshot(monthlyResults);

  const allSourcesDefinitive =
    stripeCharges.isDefinitive && coinsReconciliation.isDefinitive && creatorPayoutsPaidInPeriod.isDefinitive;

  const warnings = [];
  if (unavailableMonths.length > 0) {
    warnings.push(
      `Los meses ${unavailableMonths.join(", ")} no pudieron generarse (ver months[].warnings); el consolidado anual los excluye y NUNCA los sustituye por cero.`
    );
  }
  if (partialMonths.length > 0) {
    warnings.push(
      `Los meses ${partialMonths.join(", ")} se generaron con cobertura parcial (complete=false en ese mes); ver months[].report.warnings para el detalle por fuente.`
    );
  }
  if (!stripeCharges.isDefinitive) {
    warnings.push("annualTotals.stripeCharges es un subtotal observado, no el total anual definitivo de cobros de Stripe.");
  }
  if (!coinsReconciliation.isDefinitive) {
    warnings.push("annualTotals.coinsReconciliation es un subtotal observado, no el total anual definitivo de Coins.");
  }
  if (!coinsReconciliation.reconciled) {
    warnings.push(
      `annualTotals.coinsReconciliation.reconciled=false: NO declarar Coins conciliados para ${options.year}. ` +
        (coinsReconciliation.monthsWithDiscrepancies.length > 0
          ? `Meses con discrepancias abiertas: ${coinsReconciliation.monthsWithDiscrepancies.join(", ")}. `
          : "") +
        (coinsReconciliation.monthsWithUnknownDiscrepancyCount.length > 0
          ? `Meses cuyo conteo de discrepancias no pudo verificarse: ${coinsReconciliation.monthsWithUnknownDiscrepancyCount.join(", ")}. `
          : "") +
        "Ver annualTotals.coinsReconciliation.reconciledNote."
    );
  }
  if (!creatorPayoutsPaidInPeriod.isDefinitive) {
    warnings.push(
      "annualTotals.creatorPayoutsPaidInPeriod es un subtotal observado de lo efectivamente leído/atribuible, no el total anual definitivo pagado a creadores."
    );
  }

  return {
    ok: true,
    complete: allSourcesDefinitive && unavailableMonths.length === 0,
    completeScopeNote:
      "`complete` es true únicamente cuando los 12 meses UTC del año pudieron leerse y cada fuente (Stripe charges, " +
      "coinsReconciliation, Payout.paidInPeriod) alcanzó cobertura completa y no truncada en TODOS los meses. No " +
      "certifica conciliación contable integral de la compañía, cierre de libros, bancos, ni ninguna fuente fuera " +
      "de las listadas en este reporte y en adminMonthlyFinancialReport.service.js.",
    company: "MeetYouLive Technologies LLC",
    reportType: "annual_financial_report",
    reportPhase: "phase_1",
    fiscalScope: "operational_report_only_not_tax_filing",
    period: {
      year: options.year,
      startDate: new Date(Date.UTC(options.year, 0, 1, 0, 0, 0, 0)).toISOString(),
      endDate: new Date(Date.UTC(options.year + 1, 0, 1, 0, 0, 0, 0)).toISOString(),
    },
    generatedAt: generatedAt.toISOString(),
    queryOptions: {
      coinsPageSize: options.coinsPageSize,
      maxBalanceTransactionPages: options.maxBalanceTransactionPages,
      concurrency: options.concurrency,
      note:
        "Cada mes reutiliza getMonthlyFinancialReport con estas mismas opciones de paginación (primera página de " +
        "Coins, hasta maxBalanceTransactionPages de Stripe balance transactions). Si un mes tiene más registros de " +
        "los que caben en esos límites, ese mes se reporta con status='partial', nunca como total silencioso.",
    },
    months,
    annualTotals: {
      stripeCharges,
      coinsReconciliation,
      creatorPayoutsPaidInPeriod,
    },
    creatorPaymentsSnapshot,
    fiscalDisclaimer: ANNUAL_FISCAL_DISCLAIMER,
    warnings,
  };
}

module.exports = {
  getAnnualFinancialReport,
  FinancialReportValidationError,
  // exported for tests only
  parseAndValidateAnnualOptions,
  aggregateStripeCharges,
  aggregateCoinsReconciliation,
  aggregateCreatorPayoutsPaidInPeriod,
  pickCreatorPaymentsSnapshot,
};
