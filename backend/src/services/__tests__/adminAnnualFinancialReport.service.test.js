"use strict";

/**
 * Tests for adminAnnualFinancialReport.service.js (read-only annual
 * financial report, phase 1). `getMonthlyFinancialReport` is fully mocked
 * — this suite verifies ONLY the annual orchestration/aggregation layer,
 * never re-tests the monthly service's own internals (covered by
 * adminMonthlyFinancialReport.service.test.js).
 *
 * Covers: year validation/bounds, all 12 UTC months requested, currency
 * aggregation (never mixed, never double counted), partial/incomplete
 * months, isolated per-month failures, historical records without
 * paidAt, "as of now" snapshots never multiplied by 12, and annual
 * consolidation (`isDefinitive`) only when every source is exhaustive.
 */

jest.mock("../adminMonthlyFinancialReport.service.js", () => {
  const actual = jest.requireActual("../adminMonthlyFinancialReport.service.js");
  return {
    ...actual,
    getMonthlyFinancialReport: jest.fn(),
  };
});

const { getMonthlyFinancialReport } = require("../adminMonthlyFinancialReport.service.js");
const {
  getAnnualFinancialReport,
  FinancialReportValidationError,
} = require("../adminAnnualFinancialReport.service.js");

function makeCompleteMonth(year, month, { grossUsd = 1000, paidUsd = 500 } = {}) {
  const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const endDate = new Date(Date.UTC(year, month, 1)).toISOString();
  return {
    ok: true,
    complete: true,
    stripeConfigured: true,
    period: { year, month, startDate, endDate },
    stripeChargesSummary: {
      ok: true,
      available: true,
      truncated: false,
      isDefinitive: true,
      byCurrency: {
        usd: {
          grossMinorUnits: grossUsd,
          feeMinorUnits: 30,
          chargesNetMinorUnits: grossUsd - 30,
          refundedMinorUnits: 0,
          purchaseCount: 1,
        },
      },
      errors: [],
    },
    coinsReconciliation: {
      ok: true,
      complete: true,
      reconciled: true,
      available: true,
      summary: {
        byCurrency: { usd: { grossMinorUnits: 400, feeMinorUnits: 10, netMinorUnits: 390, purchaseCount: 1 } },
        scope: "full_range",
      },
      pagination: { page: 1, pageSize: 100, totalCandidates: 1, hasMore: false },
    },
    creatorPayments: {
      payouts: {
        paidInPeriod: {
          available: true,
          totalCoins: paidUsd * 10,
          totalUsd: paidUsd,
          count: 1,
          historicalIncomplete: null,
        },
        pendingAsOfNow: { available: true, totalCoins: 5000, totalUsd: 500, count: 2 },
      },
      withdrawalRequests: {
        paidLifetimeIncomplete: { available: true, totalCoins: 2000, totalUsd: 200, count: 1, dataQuality: "incomplete" },
        pendingAsOfNow: { available: true, totalCoins: 1000, totalUsd: 100, count: 1 },
      },
      dataQuality: { historicalDataComplete: true },
    },
    warnings: [],
  };
}

describe("adminAnnualFinancialReport.service", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("rejects a missing/invalid year", async () => {
    await expect(getAnnualFinancialReport({})).rejects.toThrow(FinancialReportValidationError);
    await expect(getAnnualFinancialReport({ year: "2026abc" })).rejects.toThrow(FinancialReportValidationError);
    await expect(getAnnualFinancialReport({ year: "2026.5" })).rejects.toThrow(FinancialReportValidationError);
  });

  test("rejects a year outside the supported bounds", async () => {
    await expect(getAnnualFinancialReport({ year: "2019" })).rejects.toThrow(FinancialReportValidationError);
    await expect(getAnnualFinancialReport({ year: "2101" })).rejects.toThrow(FinancialReportValidationError);
  });

  test("requests exactly the 12 UTC calendar months of the given year", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) => Promise.resolve(makeCompleteMonth(year, month)));

    await getAnnualFinancialReport({ year: "2024" });

    expect(getMonthlyFinancialReport).toHaveBeenCalledTimes(12);
    const requestedMonths = getMonthlyFinancialReport.mock.calls.map((call) => call[0].month).sort((a, b) => a - b);
    expect(requestedMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(getMonthlyFinancialReport.mock.calls.every((call) => call[0].year === 2024)).toBe(true);
  });

  test("marks the report complete and definitive when all 12 months are fully covered", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) => Promise.resolve(makeCompleteMonth(year, month)));

    const result = await getAnnualFinancialReport({ year: "2024" });

    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.annualTotals.stripeCharges.isDefinitive).toBe(true);
    expect(result.annualTotals.coinsReconciliation.isDefinitive).toBe(true);
    expect(result.annualTotals.creatorPayoutsPaidInPeriod.isDefinitive).toBe(true);
    expect(result.months).toHaveLength(12);
    expect(result.months.every((m) => m.status === "complete")).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test("sums Stripe gross across months, by currency, without mixing currencies", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) =>
      Promise.resolve(makeCompleteMonth(year, month, { grossUsd: 1000 }))
    );

    const result = await getAnnualFinancialReport({ year: "2024" });

    expect(result.annualTotals.stripeCharges.byCurrency.usd.grossMinorUnits).toBe(12000);
    expect(result.annualTotals.stripeCharges.byCurrency.usd.monthsIncluded).toBe(12);
    expect(result.annualTotals.stripeCharges.byCurrency.eur).toBeUndefined();
  });

  test("sums Payout.paidInPeriod across months without double counting", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) =>
      Promise.resolve(makeCompleteMonth(year, month, { paidUsd: 100 }))
    );

    const result = await getAnnualFinancialReport({ year: "2024" });

    expect(result.annualTotals.creatorPayoutsPaidInPeriod.totalUsd).toBe(1200);
    expect(result.annualTotals.creatorPayoutsPaidInPeriod.count).toBe(12);
  });

  test("never multiplies the 'as of now' pending/lifetime snapshot by 12", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) => Promise.resolve(makeCompleteMonth(year, month)));

    const result = await getAnnualFinancialReport({ year: "2024" });

    // Each mocked month reports the SAME identical snapshot (pendingAsOfNow=500,
    // withdrawalRequestsPaidLifetimeIncomplete=200) because that's how the real
    // underlying query behaves (unscoped by period). The annual report must take
    // it ONCE, never sum/multiply it across the 12 calls.
    expect(result.creatorPaymentsSnapshot.available).toBe(true);
    expect(result.creatorPaymentsSnapshot.payoutsPendingAsOfNow.totalUsd).toBe(500);
    expect(result.creatorPaymentsSnapshot.withdrawalRequestsPaidLifetimeIncomplete.totalUsd).toBe(200);
  });

  test("marks a month with incomplete coverage as partial, not silently complete", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) => {
      const report = makeCompleteMonth(year, month);
      if (month === 3) {
        report.complete = false;
        report.stripeChargesSummary.truncated = true;
        report.stripeChargesSummary.isDefinitive = false;
        report.warnings = ["stripeChargesSummary truncado para marzo"];
      }
      return Promise.resolve(report);
    });

    const result = await getAnnualFinancialReport({ year: "2024" });

    const march = result.months.find((m) => m.month === 3);
    expect(march.status).toBe("partial");
    expect(result.complete).toBe(false);
    expect(result.annualTotals.stripeCharges.isDefinitive).toBe(false);
    expect(result.annualTotals.stripeCharges.partialMonths).toContain(3);
    expect(result.warnings.some((w) => w.includes("3"))).toBe(true);
  });

  test("isolates a single month's unexpected failure, keeping the other 11 months' valid results", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) => {
      if (month === 7) return Promise.reject(new Error("stripe timeout"));
      return Promise.resolve(makeCompleteMonth(year, month));
    });

    const result = await getAnnualFinancialReport({ year: "2024" });

    expect(result.ok).toBe(true);
    expect(result.complete).toBe(false);
    const july = result.months.find((m) => m.month === 7);
    expect(july.status).toBe("unavailable");
    expect(july.report).toBeNull();
    expect(result.annualTotals.stripeCharges.missingMonths).toContain(7);
    // The other 11 months are still summed, not discarded.
    expect(result.annualTotals.stripeCharges.byCurrency.usd.monthsIncluded).toBe(11);
    // No internal error message (e.g. "stripe timeout") leaks to the response.
    expect(JSON.stringify(result)).not.toContain("stripe timeout");
  });

  test("never presents an observed subtotal as the definitive annual total when all months fail", async () => {
    getMonthlyFinancialReport.mockImplementation(() => Promise.reject(new Error("db down")));

    const result = await getAnnualFinancialReport({ year: "2024" });

    expect(result.complete).toBe(false);
    expect(result.annualTotals.stripeCharges.status).toBe("unavailable");
    expect(result.annualTotals.stripeCharges.byCurrency).toEqual({});
    expect(result.creatorPaymentsSnapshot.available).toBe(false);
  });

  test("treats Payout.status=paid records without verifiable paidAt as unattributed, never summed as complete", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) => {
      const report = makeCompleteMonth(year, month);
      if (month === 5) {
        report.complete = false;
        report.creatorPayments.payouts.paidInPeriod.historicalIncomplete = {
          count: 2,
          dataQuality: "incomplete",
          reason: "status=paid pero paidAt es null",
        };
        report.creatorPayments.dataQuality.historicalDataComplete = false;
      }
      return Promise.resolve(report);
    });

    const result = await getAnnualFinancialReport({ year: "2024" });

    expect(result.annualTotals.creatorPayoutsPaidInPeriod.isDefinitive).toBe(false);
    expect(result.annualTotals.creatorPayoutsPaidInPeriod.monthsWithUnattributedHistory).toContain(5);
    // The amount for May is still summed (it is a real, verifiable number),
    // never dropped to zero.
    expect(result.annualTotals.creatorPayoutsPaidInPeriod.totalUsd).toBeGreaterThan(0);
  });

  test("forwards coinsPageSize/maxBalanceTransactionPages/concurrency overrides to every month", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) => Promise.resolve(makeCompleteMonth(year, month)));

    await getAnnualFinancialReport({ year: "2024", coinsPageSize: "50", maxBalanceTransactionPages: "2", concurrency: "2" });

    expect(
      getMonthlyFinancialReport.mock.calls.every((call) => call[0].coinsPageSize === 50 && call[0].maxBalanceTransactionPages === 2)
    ).toBe(true);
  });

  test("marks coinsReconciliation partial when a month's reconciliation did not reach scope=full_range", async () => {
    getMonthlyFinancialReport.mockImplementation(({ year, month }) => {
      const report = makeCompleteMonth(year, month);
      if (month === 9) {
        report.coinsReconciliation.complete = false;
        report.coinsReconciliation.summary.scope = "current_page_only";
      }
      return Promise.resolve(report);
    });

    const result = await getAnnualFinancialReport({ year: "2024" });

    expect(result.annualTotals.coinsReconciliation.isDefinitive).toBe(false);
    expect(result.annualTotals.coinsReconciliation.partialMonths).toContain(9);
    // September's observed subtotal is still included, not replaced with zero.
    expect(result.annualTotals.coinsReconciliation.byCurrency.usd.monthsIncluded).toBe(12);
  });
});
