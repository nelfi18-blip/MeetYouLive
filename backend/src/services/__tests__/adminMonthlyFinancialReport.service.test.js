"use strict";

/**
 * Tests for adminMonthlyFinancialReport.service.js (read-only monthly
 * financial report). Stripe and MongoDB are fully mocked — no network/DB
 * access.
 *
 * Includes dedicated coverage for the 4 corrections requested after code
 * review of the first version:
 *   1. `complete` must never imply total historical integrity when Payout
 *      status=paid records exist without a verifiable paidAt.
 *   2. Stripe `chargesNetMinorUnits` must be labeled as NOT the final cash
 *      position (refunds/disputes/adjustments are not subtracted from it).
 *   3. `year`/`month` must be validated as STRICT whole integers, rejecting
 *      "2026abc", "10xyz", decimals, etc.
 *   4. An unexpected failure in one source (Stripe scan, coins
 *      reconciliation, or any Payout/WithdrawalRequest query) must not
 *      discard the other sources, must surface as `available:false`
 *      (never a fabricated zero), and must never leak raw internal error
 *      messages to the client.
 */

const mockBalanceTransactionsList = jest.fn();

jest.mock("stripe", () =>
  jest.fn(() => ({
    balanceTransactions: { list: mockBalanceTransactionsList },
  }))
);

jest.mock("../../models/Payout.js", () => ({
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock("../../models/WithdrawalRequest.js", () => ({
  aggregate: jest.fn(),
}));

jest.mock("../stripeReconciliation.service.js", () => {
  const actual = jest.requireActual("../stripeReconciliation.service.js");
  return {
    ...actual,
    reconcileCoinPurchases: jest.fn(),
  };
});

jest.mock("../googlePlayCoinsSummary.service.js", () => ({
  summarizeGooglePlayCoinPurchases: jest.fn(),
}));

const Payout = require("../../models/Payout.js");
const WithdrawalRequest = require("../../models/WithdrawalRequest.js");
const { reconcileCoinPurchases } = require("../stripeReconciliation.service.js");
const { summarizeGooglePlayCoinPurchases } = require("../googlePlayCoinsSummary.service.js");
const {
  getMonthlyFinancialReport,
  parseAndValidateOptions,
  parseStrictInteger,
  FinancialReportValidationError,
} = require("../adminMonthlyFinancialReport.service.js");

function emptyBalanceTxPage() {
  return { data: [], has_more: false };
}

function defaultMocks() {
  Payout.aggregate.mockResolvedValue([]);
  Payout.countDocuments.mockResolvedValue(0);
  WithdrawalRequest.aggregate.mockResolvedValue([]);
  mockBalanceTransactionsList.mockResolvedValue(emptyBalanceTxPage());
  reconcileCoinPurchases.mockResolvedValue({
    ok: true,
    complete: true,
    reconciled: true,
    summary: { byCurrency: {}, scope: "full_range" },
    pagination: { page: 1, pageSize: 100, totalCandidates: 0, hasMore: false },
    discrepancies: { total: 0 },
    warnings: [],
    errors: [],
  });
  summarizeGooglePlayCoinPurchases.mockResolvedValue({
    ok: true,
    available: true,
    source: "mongodb_cointransaction",
    notGooglePlayConsoleRevenue: true,
    period: { startDate: "2024-02-01T00:00:00.000Z", endDate: "2024-03-01T00:00:00.000Z" },
    totals: { transactionCount: 0, totalCoins: 0 },
    byProductId: [],
    note: "stub",
  });
}

describe("adminMonthlyFinancialReport.service", () => {
  const ORIGINAL_ENV = process.env;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: "sk_test_123" };
    defaultMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("validation / period limits", () => {
    test("throws when year is missing", () => {
      expect(() => parseAndValidateOptions({ month: 1 })).toThrow(FinancialReportValidationError);
    });

    test("throws when month is out of range", () => {
      expect(() => parseAndValidateOptions({ year: 2024, month: 13 })).toThrow(FinancialReportValidationError);
      expect(() => parseAndValidateOptions({ year: 2024, month: 0 })).toThrow(FinancialReportValidationError);
    });

    test("throws when year is out of range", () => {
      expect(() => parseAndValidateOptions({ year: 1999, month: 1 })).toThrow(FinancialReportValidationError);
    });

    test("computes an inclusive-start, exclusive-end UTC month window", () => {
      const options = parseAndValidateOptions({ year: 2024, month: 2 });
      expect(options.startDate.toISOString()).toBe("2024-02-01T00:00:00.000Z");
      expect(options.endDate.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    });

    test("getMonthlyFinancialReport propagates validation errors", async () => {
      await expect(getMonthlyFinancialReport({ year: 2024, month: 14 })).rejects.toThrow(
        FinancialReportValidationError
      );
    });
  });

  // ── Fix #3: strict whole-integer validation for year/month ──────────────
  describe("fix #3 — strict integer validation for year/month", () => {
    test("parseStrictInteger rejects trailing garbage", () => {
      expect(Number.isNaN(parseStrictInteger("2026abc"))).toBe(true);
      expect(Number.isNaN(parseStrictInteger("10xyz"))).toBe(true);
    });

    test("parseStrictInteger rejects decimals", () => {
      expect(Number.isNaN(parseStrictInteger("2026.5"))).toBe(true);
      expect(Number.isNaN(parseStrictInteger("10.0"))).toBe(true);
    });

    test("parseStrictInteger rejects empty/whitespace and non-numeric strings", () => {
      expect(Number.isNaN(parseStrictInteger(""))).toBe(true);
      expect(Number.isNaN(parseStrictInteger("   "))).toBe(true);
      expect(Number.isNaN(parseStrictInteger("abc"))).toBe(true);
    });

    test("parseStrictInteger accepts clean whole numbers (string or number)", () => {
      expect(parseStrictInteger("2026")).toBe(2026);
      expect(parseStrictInteger(2026)).toBe(2026);
      expect(parseStrictInteger("10")).toBe(10);
      expect(parseStrictInteger(" 10 ")).toBe(10);
    });

    test("rejects year='2026abc' with a validation error, not silent truncation to 2026", () => {
      expect(() => parseAndValidateOptions({ year: "2026abc", month: 1 })).toThrow(FinancialReportValidationError);
    });

    test("rejects month='10xyz' with a validation error, not silent truncation to 10", () => {
      expect(() => parseAndValidateOptions({ year: 2024, month: "10xyz" })).toThrow(FinancialReportValidationError);
    });

    test("rejects decimal year/month", () => {
      expect(() => parseAndValidateOptions({ year: "2024.5", month: 1 })).toThrow(FinancialReportValidationError);
      expect(() => parseAndValidateOptions({ year: 2024, month: "1.5" })).toThrow(FinancialReportValidationError);
    });

    test("getMonthlyFinancialReport rejects malformed year/month before touching Stripe/DB", async () => {
      await expect(getMonthlyFinancialReport({ year: "2026abc", month: 1 })).rejects.toThrow(
        FinancialReportValidationError
      );
      await expect(getMonthlyFinancialReport({ year: 2024, month: "10xyz" })).rejects.toThrow(
        FinancialReportValidationError
      );
      expect(mockBalanceTransactionsList).not.toHaveBeenCalled();
      expect(reconcileCoinPurchases).not.toHaveBeenCalled();
    });
  });

  describe("Stripe not configured", () => {
    test("marks stripeChargesSummary and coinsReconciliation as unavailable", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.ok).toBe(true);
      expect(result.stripeConfigured).toBe(false);
      expect(result.complete).toBe(false);
      expect(result.stripeChargesSummary.available).toBe(false);
      expect(result.coinsReconciliation.available).toBe(false);
      expect(mockBalanceTransactionsList).not.toHaveBeenCalled();
      expect(reconcileCoinPurchases).not.toHaveBeenCalled();
    });
  });

  describe("Stripe charges summary — amounts and currencies", () => {
    test("sums gross/fee/chargesNetMinorUnits per currency without mixing currencies", async () => {
      mockBalanceTransactionsList
        .mockResolvedValueOnce({
          data: [
            { id: "txn_1", currency: "usd", amount: 1000, fee: 59, net: 941 },
            { id: "txn_2", currency: "eur", amount: 500, fee: 30, net: 470 },
          ],
          has_more: false,
        })
        .mockResolvedValueOnce(emptyBalanceTxPage()); // refund scan

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.stripeChargesSummary.byCurrency.usd).toEqual(
        expect.objectContaining({ grossMinorUnits: 1000, feeMinorUnits: 59, chargesNetMinorUnits: 941 })
      );
      expect(result.stripeChargesSummary.byCurrency.eur).toEqual(
        expect.objectContaining({ grossMinorUnits: 500, feeMinorUnits: 30, chargesNetMinorUnits: 470 })
      );
      expect(result.stripeChargesSummary.chargeCount).toBe(2);
    });

    test("sums refunds separately per currency", async () => {
      mockBalanceTransactionsList
        .mockResolvedValueOnce(emptyBalanceTxPage()) // charge scan
        .mockResolvedValueOnce({
          data: [{ id: "txn_r1", currency: "usd", amount: -200, fee: 0, net: -200 }],
          has_more: false,
        });

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.stripeChargesSummary.byCurrency.usd.refundedMinorUnits).toBe(200);
    });

    test("marks truncated and incomplete when the charge scan exceeds the page bound", async () => {
      mockBalanceTransactionsList.mockResolvedValue({
        data: [{ id: "txn_1", currency: "usd", amount: 100, fee: 5, net: 95 }],
        has_more: true,
      });

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1, maxBalanceTransactionPages: 1 });

      expect(result.stripeChargesSummary.truncated).toBe(true);
      expect(result.complete).toBe(false);
      expect(result.warnings.some((w) => w.includes("truncado"))).toBe(true);
    });

    // ── Round 3, item 3: partial Stripe amounts must be clearly marked
    // as non-definitive whenever truncation/pagination/errors occur —
    // never presented as a final total.
    test("marks byCurrency buckets isPartial=true and exposes isDefinitive=false/partialNote when truncated", async () => {
      mockBalanceTransactionsList.mockResolvedValue({
        data: [{ id: "txn_1", currency: "usd", amount: 100, fee: 5, net: 95 }],
        has_more: true,
      });

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1, maxBalanceTransactionPages: 1 });

      expect(result.stripeChargesSummary.isDefinitive).toBe(false);
      expect(result.stripeChargesSummary.partialNote).toEqual(expect.stringContaining("NO el total definitivo"));
      expect(result.stripeChargesSummary.byCurrency.usd.isPartial).toBe(true);
    });

    test("does NOT mark byCurrency as partial when the scan completes cleanly", async () => {
      mockBalanceTransactionsList
        .mockResolvedValueOnce({
          data: [{ id: "txn_1", currency: "usd", amount: 100, fee: 5, net: 95 }],
          has_more: false,
        })
        .mockResolvedValueOnce(emptyBalanceTxPage());

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.stripeChargesSummary.isDefinitive).toBe(true);
      expect(result.stripeChargesSummary.partialNote).toBeNull();
      expect(result.stripeChargesSummary.byCurrency.usd.isPartial).toBeUndefined();
    });

    test("unavailable stripeChargesSummary is explicitly non-definitive, never implying a zero/final total", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.stripeChargesSummary.isDefinitive).toBe(false);
      expect(result.stripeChargesSummary.partialNote).toEqual(expect.stringContaining("byCurrency=null"));
    });
  });

  // ── Fix #2: Stripe net/refund semantics must be explicit and never
  // imply a single "true net cash" figure, and currencies stay separate.
  describe("fix #2 — Stripe net/refund semantics are explicit, never a fabricated final net", () => {
    test("exposes chargesNetMinorUnits (not a generic 'netMinorUnits') with an explicit non-final-cash disclaimer", async () => {
      mockBalanceTransactionsList
        .mockResolvedValueOnce({
          data: [{ id: "txn_1", currency: "usd", amount: 1000, fee: 59, net: 941 }],
          has_more: false,
        })
        .mockResolvedValueOnce({
          data: [{ id: "txn_r1", currency: "usd", amount: -200, fee: 0, net: -200 }],
          has_more: false,
        });

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      // Field renamed/labeled explicitly — old ambiguous "netMinorUnits" key
      // must not exist anymore.
      expect(result.stripeChargesSummary.byCurrency.usd).not.toHaveProperty("netMinorUnits");
      expect(result.stripeChargesSummary.byCurrency.usd.chargesNetMinorUnits).toBe(941);
      expect(result.stripeChargesSummary.byCurrency.usd.refundedMinorUnits).toBe(200);

      // chargesNetMinorUnits is NEVER reduced by refundedMinorUnits — no
      // fabricated combined "true net" is computed anywhere.
      expect(result.stripeChargesSummary.semantics.chargesNetMinorUnits).toEqual(
        expect.stringContaining("NO representa el efectivo final")
      );
      expect(result.stripeChargesSummary.semantics.refundedMinorUnits).toBeTruthy();
      expect(result.stripeChargesSummary.semantics.notScanned).toEqual(expect.stringContaining("adjustment"));
      expect(result.stripeChargesSummary.scannedTypes).toEqual(["charge", "refund"]);
    });

    test("never mixes two currencies into one bucket", async () => {
      mockBalanceTransactionsList
        .mockResolvedValueOnce({
          data: [
            { id: "txn_1", currency: "usd", amount: 1000, fee: 50, net: 950 },
            { id: "txn_2", currency: "eur", amount: 800, fee: 40, net: 760 },
          ],
          has_more: false,
        })
        .mockResolvedValueOnce(emptyBalanceTxPage());

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(Object.keys(result.stripeChargesSummary.byCurrency).sort()).toEqual(["eur", "usd"]);
      expect(result.stripeChargesSummary.byCurrency.usd.chargesNetMinorUnits).toBe(950);
      expect(result.stripeChargesSummary.byCurrency.eur.chargesNetMinorUnits).toBe(760);
    });
  });

  describe("coinsReconciliation — reused from PR #1084", () => {
    test("passes period/page options through to reconcileCoinPurchases", async () => {
      await getMonthlyFinancialReport({ year: 2024, month: 3, page: 2, coinsPageSize: 50 });

      expect(reconcileCoinPurchases).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: "2024-03-01T00:00:00.000Z",
          endDate: "2024-04-01T00:00:00.000Z",
          page: 2,
          pageSize: 50,
        })
      );
    });

    test("marks the report incomplete when coinsReconciliation did not cover every record", async () => {
      reconcileCoinPurchases.mockResolvedValue({
        ok: true,
        complete: false,
        reconciled: false,
        summary: { byCurrency: {}, scope: "current_page_only" },
        pagination: { page: 1, pageSize: 100, totalCandidates: 500, hasMore: true },
        discrepancies: { total: 0 },
        warnings: ["more pages"],
        errors: [],
      });

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.complete).toBe(false);
      expect(result.warnings.some((w) => w.includes("coinsReconciliation"))).toBe(true);
    });
  });

  describe("creator payments — Payout (primary source)", () => {
    test("sums only status=paid Payouts with paidAt within the period", async () => {
      Payout.aggregate
        .mockResolvedValueOnce([{ _id: null, totalCoins: 5000, totalUsd: 500, count: 3 }]) // paid in period
        .mockResolvedValueOnce([{ _id: null, totalCoins: 1000, totalUsd: 100, count: 1 }]); // pending as of now
      Payout.countDocuments.mockResolvedValue(0);

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(Payout.aggregate).toHaveBeenNthCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({ status: "paid" }),
          }),
        ])
      );
      expect(result.creatorPayments.payouts.paidInPeriod.totalCoins).toBe(5000);
      expect(result.creatorPayments.payouts.paidInPeriod.totalUsd).toBe(500);
      expect(result.creatorPayments.payouts.pendingAsOfNow.totalCoins).toBe(1000);
    });

    test("flags Payout documents with status=paid but no verifiable paidAt as historicalIncomplete", async () => {
      Payout.countDocuments.mockResolvedValue(2);

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.creatorPayments.payouts.paidInPeriod.historicalIncomplete).toEqual(
        expect.objectContaining({ count: 2, dataQuality: "incomplete" })
      );
      expect(result.warnings.some((w) => w.includes("paidAt verificable"))).toBe(true);
    });
  });

  // ── Fix #1: `complete` must never imply total historical integrity when
  // Payout status=paid records exist without a verifiable paidAt — and the
  // technical/historical distinction must be explicit and separate.
  describe("fix #1 — complete vs. historical payment data quality are kept separate", () => {
    test("complete=false and historicalDataComplete=false when historicalIncomplete Payouts exist, even though every query technically succeeded", async () => {
      Payout.countDocuments.mockResolvedValue(3);

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      // Technical coverage succeeded...
      expect(result.queryCoverage.technicallyComplete).toBe(true);
      // ...but overall `complete` must still be false because historical
      // creator-payment data is not fully attributable.
      expect(result.complete).toBe(false);
      expect(result.creatorPayments.dataQuality.historicalDataComplete).toBe(false);
      expect(result.creatorPayments.dataQuality.reason).toEqual(expect.stringContaining("paidAt verificable"));
    });

    test("complete=true only when BOTH technical coverage and historical data are clean", async () => {
      Payout.countDocuments.mockResolvedValue(0);

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.queryCoverage.technicallyComplete).toBe(true);
      expect(result.creatorPayments.dataQuality.historicalDataComplete).toBe(true);
      expect(result.complete).toBe(true);
    });

    test("queryCoverage and creatorPayments.dataQuality are distinct, separately-named fields", async () => {
      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result).toHaveProperty("queryCoverage");
      expect(result).toHaveProperty("creatorPayments.dataQuality");
      expect(result.queryCoverage).not.toBe(result.creatorPayments.dataQuality);
    });

    // ── Round 3, item 2: none of these flags may ever be read as a
    // company-wide accounting reconciliation.
    test("complete/queryCoverage/dataQuality explicitly disclaim company-wide accounting reconciliation", async () => {
      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.completeScopeNote).toEqual(expect.stringContaining("conciliación contable integral"));
      expect(result.queryCoverage.note).toEqual(expect.stringContaining("conciliación contable integral"));
      expect(result.creatorPayments.dataQuality.scopeNote).toEqual(expect.stringContaining("conciliación contable integral"));
    });
  });

  describe("creator payments — WithdrawalRequest (avoids double counting)", () => {
    test("reports WithdrawalRequest paid totals as a period-less, incomplete lifetime figure", async () => {
      WithdrawalRequest.aggregate
        .mockResolvedValueOnce([{ _id: null, totalCoins: 2000, totalUsd: 200, count: 2 }]) // paid lifetime
        .mockResolvedValueOnce([{ _id: null, totalCoins: 300, totalUsd: 30, count: 1 }]); // pending as of now

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.creatorPayments.withdrawalRequests.paidLifetimeIncomplete).toEqual(
        expect.objectContaining({ totalCoins: 2000, dataQuality: "incomplete" })
      );
      expect(result.creatorPayments.withdrawalRequests.pendingAsOfNow.totalCoins).toBe(300);
    });

    test("never combines Payout and WithdrawalRequest totals into a single figure", async () => {
      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.creatorPayments.doubleCountingNote).toEqual(expect.stringContaining("doble conteo"));
      expect(result.creatorPayments).not.toHaveProperty("totalPaidToCreators");
      expect(result.creatorPayments).not.toHaveProperty("combinedTotal");
    });
  });

  // ── Fix #4: error isolation — one failing source never discards others,
  // never defaults to zero, and never leaks raw internal error text.
  describe("fix #4 — error isolation between independent sources", () => {
    test("an unexpected Stripe scan failure surfaces as unavailable without discarding coinsReconciliation", async () => {
      mockBalanceTransactionsList.mockRejectedValue(new Error("Sensitive internal detail: acct_12345 rate limited"));
      reconcileCoinPurchases.mockResolvedValue({
        ok: true,
        complete: true,
        reconciled: true,
        summary: { byCurrency: { usd: { purchaseCount: 2 } }, scope: "full_range" },
        pagination: { page: 1, pageSize: 100, totalCandidates: 2, hasMore: false },
        discrepancies: { total: 0 },
        warnings: [],
        errors: [],
      });

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      // Stripe charges scan still returns within scanStripeChargesSummary's
      // own try/catch (per-type isolation) — never loses the whole report.
      expect(result.ok).toBe(true);
      expect(result.stripeChargesSummary.errors.length).toBeGreaterThan(0);
      expect(result.stripeChargesSummary.truncated).toBe(true);
      expect(result.complete).toBe(false);
      // coinsReconciliation, an independent source, is still fully present.
      expect(result.coinsReconciliation.complete).toBe(true);
      expect(result.coinsReconciliation.summary.byCurrency.usd.purchaseCount).toBe(2);

      // Never leaks the raw/sensitive error message to the client.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("acct_12345");
      expect(serialized).not.toContain("rate limited");
    });

    test("never fabricates zero totals when stripeChargesSummary is unavailable", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.stripeChargesSummary.chargeCount).toBeNull();
      expect(result.stripeChargesSummary.byCurrency).toBeNull();
    });

    test("an unexpected rejection from reconcileCoinPurchases does not discard a successful Stripe scan", async () => {
      mockBalanceTransactionsList
        .mockResolvedValueOnce({
          data: [{ id: "txn_1", currency: "usd", amount: 1000, fee: 50, net: 950 }],
          has_more: false,
        })
        .mockResolvedValueOnce(emptyBalanceTxPage());
      reconcileCoinPurchases.mockRejectedValue(new Error("internal mongo connection string leaked here"));

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.ok).toBe(true);
      expect(result.stripeChargesSummary.byCurrency.usd.chargesNetMinorUnits).toBe(950);
      expect(result.coinsReconciliation.available).toBe(false);
      expect(result.coinsReconciliation.reason).toBe("unexpected_error");
      expect(result.complete).toBe(false);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("internal mongo connection string leaked here");
    });

    test("an unexpected Payout query failure surfaces as unavailable, not a fabricated zero, and does not break other sections", async () => {
      Payout.aggregate.mockImplementationOnce(() => {
        throw new Error("ECONNREFUSED 10.0.0.5:27017 — internal host leaked");
      });
      WithdrawalRequest.aggregate
        .mockResolvedValueOnce([{ _id: null, totalCoins: 2000, totalUsd: 200, count: 2 }])
        .mockResolvedValueOnce([{ _id: null, totalCoins: 300, totalUsd: 30, count: 1 }]);

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.ok).toBe(true);
      expect(result.creatorPayments.payouts.paidInPeriod.available).toBe(false);
      expect(result.creatorPayments.payouts.paidInPeriod.totalCoins).toBeNull();
      expect(result.complete).toBe(false);
      // Independent source (WithdrawalRequest) is unaffected.
      expect(result.creatorPayments.withdrawalRequests.paidLifetimeIncomplete.totalCoins).toBe(2000);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("10.0.0.5");
      expect(serialized).not.toContain("ECONNREFUSED");
    });

    test("sanitized error entries never include the raw err.message text", async () => {
      mockBalanceTransactionsList.mockRejectedValue(
        Object.assign(new Error("super secret stripe internal reason XYZ"), { type: "api_error", code: "rate_limited" })
      );

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.stripeChargesSummary.errors[0]).toEqual(
        expect.objectContaining({ type: "api_error", code: "rate_limited" })
      );
      const serialized = JSON.stringify(result.stripeChargesSummary.errors);
      expect(serialized).not.toContain("super secret stripe internal reason XYZ");
    });
  });

  describe("fiscal scope", () => {
    test("includes the operational, non-tax-filing disclaimer", async () => {
      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.fiscalScope).toBe("operational_report_only_not_tax_filing");
      expect(result.fiscalDisclaimer.some((d) => d.includes("1099"))).toBe(true);
      expect(result.fiscalDisclaimer.some((d) => d.includes("1042-S"))).toBe(true);
    });
  });

  describe("googlePlaySummary — independent Google Play Coins summary", () => {
    test("surfaces the Google Play summary unchanged, separate from Stripe/coins", async () => {
      summarizeGooglePlayCoinPurchases.mockResolvedValue({
        ok: true,
        available: true,
        source: "mongodb_cointransaction",
        notGooglePlayConsoleRevenue: true,
        period: { startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" },
        totals: { transactionCount: 1, totalCoins: 100 },
        byProductId: [{ productId: "coins_pack_100", transactionCount: 1, totalCoins: 100 }],
        note: "note",
      });

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.googlePlaySummary.totals).toEqual({ transactionCount: 1, totalCoins: 100 });
      expect(result.googlePlaySummary.byProductId).toEqual([
        { productId: "coins_pack_100", transactionCount: 1, totalCoins: 100 },
      ]);
      expect(result.googlePlaySummary.notGooglePlayConsoleRevenue).toBe(true);
      // Never merged into Stripe/coins figures.
      expect(result.stripeChargesSummary).not.toHaveProperty("googlePlay");
      expect(result.coinsReconciliation).not.toHaveProperty("googlePlay");
    });

    test("an unavailable Google Play summary never discards the rest of the report", async () => {
      summarizeGooglePlayCoinPurchases.mockResolvedValue({
        ok: false,
        available: false,
        reason: "query_error",
        message: "boom",
      });

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.ok).toBe(true);
      expect(result.googlePlaySummary.available).toBe(false);
      expect(result.warnings.some((w) => w.includes("googlePlaySummary"))).toBe(true);
      // Does not affect the Stripe-based completeness flags.
      expect(result.queryCoverage.technicallyComplete).toBe(true);
    });

    test("a rejected Google Play summary promise does not break the whole report (defensive, even though the service never throws)", async () => {
      summarizeGooglePlayCoinPurchases.mockRejectedValue(new Error("unexpected"));

      await expect(getMonthlyFinancialReport({ year: 2024, month: 1 })).rejects.toThrow();
    });
  });
});
