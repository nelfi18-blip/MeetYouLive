import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getMonthKeys,
  getYearOptions,
  formatMinorUnits,
  formatUsd,
  formatCount,
  getStripeChargesSummaryStatus,
  getCoinsReconciliationStatus,
  getQuerySourceStatus,
  getReportNotices,
  getCurrencyChartRow,
  getStripeChargesPartialNote,
  getStripeChargesHeadline,
} from "../lib/adminAccounting.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminShellPath = join(__dirname, "../app/admin/AdminShell.jsx");
const accountingPagePath = join(__dirname, "../app/admin/accounting/page.jsx");

// ---------------------------------------------------------------------------
// Navigation & permissions
// ---------------------------------------------------------------------------

test("AdminShell exposes a Contabilidad nav item linking to /admin/accounting", async () => {
  const source = await readFile(adminShellPath, "utf8");
  assert.match(source, /href:\s*"\/admin\/accounting"/);
  assert.match(source, /adminShell\.nav\.accounting/);
});

test("the Contabilidad nav item is restricted to role=admin only", async () => {
  const source = await readFile(adminShellPath, "utf8");
  const match = source.match(/\{ href: "\/admin\/accounting",[^}]*\}/);
  assert.ok(match, "accounting nav item not found");
  assert.match(match[0], /roles:\s*\["admin"\]/);
});

test("accounting nav item lives inside the FINANZAS (finance) section", async () => {
  const source = await readFile(adminShellPath, "utf8");
  const financeSectionStart = source.indexOf('title: t("adminShell.sections.finance")');
  const accountingIndex = source.indexOf('href: "/admin/accounting"');
  const nextSectionStart = source.indexOf('title: t("adminShell.sections.analytics")');
  assert.ok(financeSectionStart !== -1 && accountingIndex !== -1 && nextSectionStart !== -1);
  assert.ok(accountingIndex > financeSectionStart && accountingIndex < nextSectionStart);
});

test("accounting page handles 401 by clearing the admin token and redirecting to /admin/login", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /res\.status === 401/);
  assert.match(source, /clearAdminToken\(\)/);
  assert.match(source, /router\.replace\("\/admin\/login"\)/);
});

test("accounting page handles 403 with a dedicated forbidden state (no raw data leaked)", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /res\.status === 403/);
  assert.match(source, /setForbidden\(true\)/);
  assert.match(source, /adminAccounting\.noAdminPermissions/);
});

test("accounting page queries the real PR #1085 endpoint with year/month params", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /\/api\/admin\/reports\/financial\/monthly\?year=\$\{year\}&month=\$\{month\}/);
  assert.match(source, /NEXT_PUBLIC_API_URL/);
});

test("coins discrepancies total never falls back to a fabricated 0 (uses Amount/—, not ?? 0)", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.doesNotMatch(source, /discrepancies\.total,\s*locale\)\s*\?\?\s*0/);
  assert.match(
    source,
    /<Amount value=\{formatCount\(coinsReconciliation\.discrepancies\.total, locale\)\} \/>/
  );
});

test("report.completeScopeNote is rendered next to the overall report status", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /report\.completeScopeNote/);
  assert.match(source, /adminAccounting\.notes\.completeScopeNoteLabel/);
  // Must be in the same block as the overall status badge (period-echo/overall-badge section).
  const overallBadgeIndex = source.indexOf("overall-badge--ok");
  const completeScopeNoteIndex = source.indexOf("report.completeScopeNote");
  assert.ok(overallBadgeIndex !== -1 && completeScopeNoteIndex !== -1);
  assert.ok(completeScopeNoteIndex > overallBadgeIndex);
  assert.ok(completeScopeNoteIndex - overallBadgeIndex < 400, "completeScopeNote should render right after the status badge");
});

test("completeScopeNote block uses a word-wrapping, mobile-legible CSS class", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /\.complete-scope-note-text\s*\{[^}]*word-break:\s*break-word/);
});

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

test("getMonthKeys returns the 12 calendar months in order", () => {
  const months = getMonthKeys();
  assert.equal(months.length, 12);
  assert.equal(months[0], "january");
  assert.equal(months[11], "december");
});

test("getYearOptions returns the current year plus N previous years, newest first", () => {
  assert.deepEqual(getYearOptions(2026, 3), [2026, 2025, 2024, 2023]);
  assert.deepEqual(getYearOptions(2026, 0), [2026]);
});

// ---------------------------------------------------------------------------
// Currency formatting — never fabricate figures from null/undefined
// ---------------------------------------------------------------------------

test("formatMinorUnits formats a minor-units amount as localized currency", () => {
  assert.equal(formatMinorUnits(150000, "usd", "en-US"), "$1,500.00");
  const eur = formatMinorUnits(150000, "eur", "es-ES");
  assert.match(eur, /1500,00/);
  assert.match(eur, /€/);
});

test("formatMinorUnits returns null (never 0) for null/undefined amounts", () => {
  assert.equal(formatMinorUnits(null, "usd"), null);
  assert.equal(formatMinorUnits(undefined, "usd"), null);
});

test("formatMinorUnits returns null when the currency code is missing", () => {
  assert.equal(formatMinorUnits(1000, null), null);
  assert.equal(formatMinorUnits(1000, ""), null);
});

test("formatUsd and formatCount never coerce null to zero", () => {
  assert.equal(formatUsd(null), null);
  assert.equal(formatUsd(undefined), null);
  assert.equal(formatCount(null), null);
  assert.equal(formatCount(undefined), null);
  assert.equal(formatUsd(42.5, "en-US"), "$42.50");
  assert.equal(formatCount(1234, "en-US"), "1,234");
});

// ---------------------------------------------------------------------------
// Partial / unavailable source statuses
// ---------------------------------------------------------------------------

test("getStripeChargesSummaryStatus reports unavailable when the source could not be read", () => {
  assert.equal(getStripeChargesSummaryStatus({ available: false }), "unavailable");
  assert.equal(getStripeChargesSummaryStatus(null), "unavailable");
});

test("getStripeChargesSummaryStatus reports partial when truncated or not definitive", () => {
  assert.equal(
    getStripeChargesSummaryStatus({ available: true, truncated: true, isDefinitive: false }),
    "partial"
  );
  assert.equal(
    getStripeChargesSummaryStatus({ available: true, truncated: false, isDefinitive: false }),
    "partial"
  );
});

test("getStripeChargesSummaryStatus reports ok only when fully read and definitive", () => {
  assert.equal(
    getStripeChargesSummaryStatus({ available: true, truncated: false, isDefinitive: true }),
    "ok"
  );
});

test("getCoinsReconciliationStatus distinguishes unavailable, partial and ok", () => {
  assert.equal(getCoinsReconciliationStatus({ available: false }), "unavailable");
  assert.equal(getCoinsReconciliationStatus({ available: true, complete: false }), "partial");
  assert.equal(getCoinsReconciliationStatus({ available: true, complete: true }), "ok");
});

test("getQuerySourceStatus flags historicalIncomplete Payout records as partial", () => {
  assert.equal(getQuerySourceStatus({ available: false }), "unavailable");
  assert.equal(
    getQuerySourceStatus({ available: true, historicalIncomplete: { count: 2 } }),
    "partial"
  );
  assert.equal(getQuerySourceStatus({ available: true, historicalIncomplete: null }), "ok");
});

// ---------------------------------------------------------------------------
// Report-level notices — complete=false / isDefinitive=false / truncated=true / unavailable
// ---------------------------------------------------------------------------

test("getReportNotices flags an incomplete report and an unconfigured Stripe account", () => {
  const notices = getReportNotices({
    complete: false,
    stripeConfigured: false,
    stripeChargesSummary: { available: false },
    coinsReconciliation: { available: false },
    creatorPayments: {
      payouts: { paidInPeriod: { available: true }, pendingAsOfNow: { available: true } },
      withdrawalRequests: {
        paidLifetimeIncomplete: { available: true },
        pendingAsOfNow: { available: true },
      },
    },
  });
  assert.ok(notices.includes("reportIncomplete"));
  assert.ok(notices.includes("stripeNotConfigured"));
  assert.ok(notices.includes("stripeChargesUnavailable"));
  assert.ok(notices.includes("coinsReconciliationUnavailable"));
});

test("getReportNotices flags a truncated (non-definitive) Stripe scan as partial", () => {
  const notices = getReportNotices({
    complete: false,
    stripeConfigured: true,
    stripeChargesSummary: { available: true, truncated: true, isDefinitive: false },
    coinsReconciliation: { available: true, complete: true },
    creatorPayments: {
      payouts: { paidInPeriod: { available: true }, pendingAsOfNow: { available: true } },
      withdrawalRequests: {
        paidLifetimeIncomplete: { available: true },
        pendingAsOfNow: { available: true },
      },
    },
  });
  assert.ok(notices.includes("stripeChargesPartial"));
  assert.ok(!notices.includes("stripeChargesUnavailable"));
});

test("getReportNotices flags historically-incomplete Payout paid records separately from unavailable", () => {
  const notices = getReportNotices({
    complete: false,
    stripeConfigured: true,
    stripeChargesSummary: { available: true, truncated: false, isDefinitive: true },
    coinsReconciliation: { available: true, complete: true },
    creatorPayments: {
      payouts: {
        paidInPeriod: { available: true, historicalIncomplete: { count: 3 } },
        pendingAsOfNow: { available: true },
      },
      withdrawalRequests: {
        paidLifetimeIncomplete: { available: true },
        pendingAsOfNow: { available: true },
      },
    },
  });
  assert.ok(notices.includes("payoutsPaidHistoricalIncomplete"));
  assert.ok(!notices.includes("payoutsPaidUnavailable"));
});

test("getReportNotices flags each unavailable source independently (no silent zero)", () => {
  const notices = getReportNotices({
    complete: false,
    stripeConfigured: true,
    stripeChargesSummary: { available: true, truncated: false, isDefinitive: true },
    coinsReconciliation: { available: true, complete: true },
    creatorPayments: {
      payouts: { paidInPeriod: { available: true }, pendingAsOfNow: { available: false } },
      withdrawalRequests: {
        paidLifetimeIncomplete: { available: false },
        pendingAsOfNow: { available: false },
      },
    },
  });
  assert.deepEqual(
    notices.sort(),
    ["reportIncomplete", "payoutsPendingUnavailable", "withdrawalsPaidUnavailable", "withdrawalsPendingUnavailable"].sort()
  );
});

test("getReportNotices returns no notices for a fully complete, definitive report", () => {
  const notices = getReportNotices({
    complete: true,
    stripeConfigured: true,
    stripeChargesSummary: { available: true, truncated: false, isDefinitive: true },
    coinsReconciliation: { available: true, complete: true },
    creatorPayments: {
      payouts: { paidInPeriod: { available: true }, pendingAsOfNow: { available: true } },
      withdrawalRequests: {
        paidLifetimeIncomplete: { available: true },
        pendingAsOfNow: { available: true },
      },
    },
  });
  assert.deepEqual(notices, []);
});

test("getReportNotices handles a missing report gracefully", () => {
  assert.deepEqual(getReportNotices(null), []);
  assert.deepEqual(getReportNotices(undefined), []);
});

// --- Round 2 correction: chart zero-fabrication, KPI money/count mixing, partial visibility ---

test("getCurrencyChartRow never fabricates a 0 for a missing/invalid gross amount", () => {
  assert.deepEqual(getCurrencyChartRow({ grossMinorUnits: 12345, feeMinorUnits: 500, isPartial: false }), {
    hasData: true,
    grossMinorUnits: 12345,
    feeMinorUnits: 500,
    isPartial: false,
  });
  for (const invalid of [null, undefined, NaN, "12345", {}]) {
    const row = getCurrencyChartRow({ grossMinorUnits: invalid, feeMinorUnits: 500 });
    assert.equal(row.hasData, false);
    assert.equal(row.grossMinorUnits, null);
  }
  assert.equal(getCurrencyChartRow(null).hasData, false);
  assert.equal(getCurrencyChartRow(undefined).hasData, false);
});

test("getCurrencyChartRow omits feeMinorUnits (never 0) when fees are not a finite number", () => {
  const row = getCurrencyChartRow({ grossMinorUnits: 1000, feeMinorUnits: undefined });
  assert.equal(row.hasData, true);
  assert.equal(row.feeMinorUnits, null);
});

test("getCurrencyChartRow surfaces per-currency isPartial", () => {
  assert.equal(getCurrencyChartRow({ grossMinorUnits: 10, isPartial: true }).isPartial, true);
  assert.equal(getCurrencyChartRow({ grossMinorUnits: 10, isPartial: false }).isPartial, false);
  assert.equal(getCurrencyChartRow({ grossMinorUnits: 10 }).isPartial, false);
});

test("getStripeChargesPartialNote only surfaces the backend note when the summary is partial", () => {
  assert.equal(
    getStripeChargesPartialNote({ available: true, truncated: true, isDefinitive: false, partialNote: "Stripe scan truncated." }),
    "Stripe scan truncated."
  );
  assert.equal(
    getStripeChargesPartialNote({ available: true, truncated: false, isDefinitive: true, partialNote: "ignored" }),
    null
  );
  assert.equal(getStripeChargesPartialNote({ available: false }), null);
  assert.equal(getStripeChargesPartialNote(null), null);
});

test("getStripeChargesHeadline returns kind:none when there is no currency data", () => {
  assert.deepEqual(getStripeChargesHeadline([]), { kind: "none" });
  assert.deepEqual(getStripeChargesHeadline(null), { kind: "none" });
});

test("getStripeChargesHeadline returns a single currency-identified amount, never a bare count", () => {
  const headline = getStripeChargesHeadline([["usd", { grossMinorUnits: 5000, purchaseCount: 12 }]]);
  assert.deepEqual(headline, { kind: "amount", currencyCode: "usd", minorUnits: 5000, purchaseCount: 12 });
});

test("getStripeChargesHeadline never sums different currencies into one money figure", () => {
  const headline = getStripeChargesHeadline([
    ["usd", { grossMinorUnits: 5000, purchaseCount: 10 }],
    ["eur", { grossMinorUnits: 3000, purchaseCount: 5 }],
  ]);
  assert.equal(headline.kind, "multi");
  assert.equal("minorUnits" in headline, false);
  assert.equal("currencyCode" in headline, false);
  assert.equal(headline.currencyCount, 2);
  assert.equal(headline.purchaseCount, 15);
});

test("getStripeChargesHeadline reports purchaseCount:null (not 0) when no bucket has a verifiable count", () => {
  const single = getStripeChargesHeadline([["usd", { grossMinorUnits: 5000, purchaseCount: undefined }]]);
  assert.equal(single.purchaseCount, null);

  const multi = getStripeChargesHeadline([
    ["usd", { grossMinorUnits: 5000, purchaseCount: null }],
    ["eur", { grossMinorUnits: 3000, purchaseCount: undefined }],
  ]);
  assert.equal(multi.purchaseCount, null);
});

test("accounting page's distribution chart never falls back to a fabricated ': 0' for gross/fee amounts", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.doesNotMatch(source, /typeof\s+bucket\.grossMinorUnits\s*===\s*"number"\s*\?\s*bucket\.grossMinorUnits\s*:\s*0/);
  assert.doesNotMatch(source, /Amount value=\{formatMinorUnits\(gross/);
  assert.match(source, /getCurrencyChartRow/);
});

test("accounting page's Stripe charges KPI card never shows a bare operation count as its money value", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /getStripeChargesHeadline/);
  assert.doesNotMatch(source, /formatCount\(totalPurchaseCount, locale\)/);
});

test("accounting page surfaces the backend partialNote next to the Summary chart", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /stripeChargesPartialNote/);
  assert.match(source, /partialNote=\{stripeChargesPartialNote\}/);
});

test("accounting page tags partial refund rows with the same isPartial flag as other Stripe indicators", async () => {
  const source = await readFile(accountingPagePath, "utf8");
  assert.match(source, /bucket\.isPartial && <span className="partial-tag">/);
});
