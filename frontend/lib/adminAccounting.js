/**
 * Pure helpers for the admin "Contabilidad" (accounting) screen.
 *
 * These helpers only format/interpret the response of
 * GET /api/admin/reports/financial/monthly (PR #1085). They NEVER invent
 * figures: a `null`/`undefined` amount is always rendered as "not
 * available", never coerced to 0. They also never sum Payout and
 * WithdrawalRequest totals, and never mix currencies.
 */

const MONTH_KEYS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Translation keys for the 12 calendar months (1-indexed by position). */
export function getMonthKeys() {
  return MONTH_KEYS;
}

/**
 * Builds the list of selectable years for the period picker: the current
 * year plus `pastYears` previous years, newest first.
 */
export function getYearOptions(currentYear, pastYears = 5) {
  const base = Number.isFinite(currentYear) ? currentYear : new Date().getFullYear();
  const years = [];
  for (let i = 0; i <= pastYears; i += 1) years.push(base - i);
  return years;
}

/**
 * Formats a Stripe minor-units amount (e.g. cents) as a localized currency
 * string. Returns `null` (never "0" / "$0.00") when the amount is not a
 * finite number or the currency code is missing — callers must render an
 * explicit "not available" state instead of a fabricated zero.
 */
export function formatMinorUnits(minorUnits, currencyCode, locale = "en-US") {
  if (typeof minorUnits !== "number" || !Number.isFinite(minorUnits)) return null;
  if (typeof currencyCode !== "string" || !currencyCode.trim()) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode.toUpperCase(),
    }).format(minorUnits / 100);
  } catch {
    return null;
  }
}

/** Formats a plain USD major-unit amount, or `null` if not a finite number. */
export function formatUsd(amount, locale = "en-US") {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(amount);
}

/** Formats a plain integer count (e.g. coins), or `null` if not finite. */
export function formatCount(value, locale = "en-US") {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Status of the Stripe charges/refunds summary section:
 * - "unavailable": the source could not be read at all.
 * - "partial": it was read but truncated or not definitive.
 * - "ok": fully read and definitive.
 */
export function getStripeChargesSummaryStatus(stripeChargesSummary) {
  if (!stripeChargesSummary || stripeChargesSummary.available === false) return "unavailable";
  if (stripeChargesSummary.truncated || stripeChargesSummary.isDefinitive === false) return "partial";
  return "ok";
}

/** Status of the Coins reconciliation section (PR #1084). */
export function getCoinsReconciliationStatus(coinsReconciliation) {
  if (!coinsReconciliation || coinsReconciliation.available === false) return "unavailable";
  if (coinsReconciliation.complete === false) return "partial";
  return "ok";
}

/**
 * Status of the independent Google Play Coins summary section. It has no
 * `complete`/`reconciled` concept (it is not a reconciliation against a
 * second source) — it is simply "ok" when readable, "unavailable"
 * otherwise.
 */
export function getGooglePlaySummaryStatus(googlePlaySummary) {
  if (!googlePlaySummary || googlePlaySummary.available === false) return "unavailable";
  return "ok";
}

/** Status for any of the Payout/WithdrawalRequest sub-sections. */
export function getQuerySourceStatus(source) {
  if (!source || source.available === false) return "unavailable";
  if (source.historicalIncomplete) return "partial";
  return "ok";
}

/** Returns `true` only for a genuine, finite number — never for null/undefined/NaN/strings. */
function isFiniteAmount(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Decides what a single currency bucket can safely contribute to the
 * "Distribución de cobros y comisiones" chart (round 2 fix #1).
 *
 * `grossMinorUnits`/`feeMinorUnits` coming from the PR #1085 backend are
 * real running sums (never `null`) for a currency that is actually
 * present in `byCurrency`, but this helper is defensively written so the
 * UI NEVER coerces a missing/non-numeric amount into a fabricated 0: a
 * currency whose gross amount cannot be verified as a finite number is
 * reported with `hasData: false`, and callers must render an explicit
 * "not available" state for that currency instead of drawing a bar.
 */
export function getCurrencyChartRow(bucket) {
  const hasGross = isFiniteAmount(bucket?.grossMinorUnits);
  const hasFees = isFiniteAmount(bucket?.feeMinorUnits);
  return {
    hasData: hasGross,
    grossMinorUnits: hasGross ? bucket.grossMinorUnits : null,
    feeMinorUnits: hasFees ? bucket.feeMinorUnits : null,
    isPartial: Boolean(bucket?.isPartial),
  };
}

/**
 * The backend's own, untranslated explanation of why `byCurrency` figures
 * are not definitive (PR #1085's `stripeChargesSummary.partialNote`).
 * Returns `null` whenever the summary is unavailable or fully definitive,
 * so callers never show a stale/irrelevant partial note.
 */
export function getStripeChargesPartialNote(stripeChargesSummary) {
  if (getStripeChargesSummaryStatus(stripeChargesSummary) !== "partial") return null;
  return typeof stripeChargesSummary.partialNote === "string" ? stripeChargesSummary.partialNote : null;
}

/**
 * Decides what the "Cobros de Stripe" KPI card may show as its headline
 * value, from the SAME `byCurrency` entries used elsewhere (round 2 fix
 * #2). Different currencies are never summed into one monetary figure:
 *  - `{ kind: "none" }` — no currency has any data for this period.
 *  - `{ kind: "amount", currencyCode, minorUnits, purchaseCount } ` — exactly
 *    one currency is present; safe to show as a single currency-labeled
 *    amount. `minorUnits`/`purchaseCount` are `null` when not a verifiable
 *    finite number (never fabricated as 0).
 *  - `{ kind: "multi", currencyCount, purchaseCount }` — more than one
 *    currency is present; a single combined money figure would require
 *    summing different currencies, so no "amount" is ever produced here.
 *    `purchaseCount` (a plain operation count, NOT money) is the only
 *    cross-currency total allowed, and callers must label it explicitly
 *    as a count, never as a currency amount.
 */
export function getStripeChargesHeadline(byCurrencyEntries) {
  if (!Array.isArray(byCurrencyEntries) || byCurrencyEntries.length === 0) {
    return { kind: "none" };
  }
  if (byCurrencyEntries.length === 1) {
    const [currencyCode, bucket] = byCurrencyEntries[0];
    return {
      kind: "amount",
      currencyCode,
      minorUnits: isFiniteAmount(bucket?.grossMinorUnits) ? bucket.grossMinorUnits : null,
      purchaseCount: isFiniteAmount(bucket?.purchaseCount) ? bucket.purchaseCount : null,
    };
  }
  let purchaseCount = 0;
  let anyCount = false;
  for (const [, bucket] of byCurrencyEntries) {
    if (isFiniteAmount(bucket?.purchaseCount)) {
      purchaseCount += bucket.purchaseCount;
      anyCount = true;
    }
  }
  return {
    kind: "multi",
    currencyCount: byCurrencyEntries.length,
    purchaseCount: anyCount ? purchaseCount : null,
  };
}

/**
 * Builds the list of i18n-ready notice keys to display for the whole
 * report, derived strictly from its structured flags (never from
 * free-text backend messages, so every notice stays fully translatable).
 */
export function getReportNotices(report) {
  if (!report) return [];
  const notices = [];

  if (report.complete === false) notices.push("reportIncomplete");
  if (report.stripeConfigured === false) notices.push("stripeNotConfigured");

  const stripeStatus = getStripeChargesSummaryStatus(report.stripeChargesSummary);
  if (stripeStatus === "unavailable") notices.push("stripeChargesUnavailable");
  else if (stripeStatus === "partial") notices.push("stripeChargesPartial");

  const coinsStatus = getCoinsReconciliationStatus(report.coinsReconciliation);
  if (coinsStatus === "unavailable") notices.push("coinsReconciliationUnavailable");
  else if (coinsStatus === "partial") notices.push("coinsReconciliationPartial");

  const googlePlayStatus = getGooglePlaySummaryStatus(report.googlePlaySummary);
  if (googlePlayStatus === "unavailable") notices.push("googlePlaySummaryUnavailable");

  const payoutsPaid = report.creatorPayments?.payouts?.paidInPeriod;
  const payoutsPaidStatus = getQuerySourceStatus(payoutsPaid);
  if (payoutsPaidStatus === "unavailable") notices.push("payoutsPaidUnavailable");
  else if (payoutsPaidStatus === "partial") notices.push("payoutsPaidHistoricalIncomplete");

  if (report.creatorPayments?.payouts?.pendingAsOfNow?.available === false) {
    notices.push("payoutsPendingUnavailable");
  }
  if (report.creatorPayments?.withdrawalRequests?.paidLifetimeIncomplete?.available === false) {
    notices.push("withdrawalsPaidUnavailable");
  }
  if (report.creatorPayments?.withdrawalRequests?.pendingAsOfNow?.available === false) {
    notices.push("withdrawalsPendingUnavailable");
  }

  return notices;
}
