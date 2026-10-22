"use strict";

/**
 * Tests for adminMonthlyFinancialReport.service.js (read-only monthly
 * financial report). Stripe and MongoDB are fully mocked — no network/DB
 * access.
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

const Payout = require("../../models/Payout.js");
const WithdrawalRequest = require("../../models/WithdrawalRequest.js");
const { reconcileCoinPurchases } = require("../stripeReconciliation.service.js");
const {
  getMonthlyFinancialReport,
  parseAndValidateOptions,
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
}

describe("adminMonthlyFinancialReport.service", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: "sk_test_123" };
    defaultMocks();
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
    test("sums gross/fee/net per currency without mixing currencies", async () => {
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
        expect.objectContaining({ grossMinorUnits: 1000, feeMinorUnits: 59, netMinorUnits: 941 })
      );
      expect(result.stripeChargesSummary.byCurrency.eur).toEqual(
        expect.objectContaining({ grossMinorUnits: 500, feeMinorUnits: 30, netMinorUnits: 470 })
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

    test("surfaces Stripe errors without fabricating totals", async () => {
      mockBalanceTransactionsList.mockRejectedValue(new Error("Stripe timeout"));

      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.stripeChargesSummary.errors.length).toBeGreaterThan(0);
      expect(result.stripeChargesSummary.ok).toBe(false);
      expect(result.complete).toBe(false);
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

  describe("fiscal scope", () => {
    test("includes the operational, non-tax-filing disclaimer", async () => {
      const result = await getMonthlyFinancialReport({ year: 2024, month: 1 });

      expect(result.fiscalScope).toBe("operational_report_only_not_tax_filing");
      expect(result.fiscalDisclaimer.some((d) => d.includes("1099"))).toBe(true);
      expect(result.fiscalDisclaimer.some((d) => d.includes("1042-S"))).toBe(true);
    });
  });
});
