"use strict";

/**
 * Tests for googlePlayCoinsSummary.service.js (read-only, MongoDB-only).
 */

jest.mock("../../models/CoinTransaction.js", () => ({
  aggregate: jest.fn(),
}));

const CoinTransaction = require("../../models/CoinTransaction.js");
const { summarizeGooglePlayCoinPurchases } = require("../googlePlayCoinsSummary.service.js");

const START = new Date("2026-10-01T00:00:00.000Z");
const END = new Date("2026-11-01T00:00:00.000Z");

describe("googlePlayCoinsSummary.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects an invalid date range without ever querying MongoDB", async () => {
    const result = await summarizeGooglePlayCoinPurchases({ startDate: null, endDate: END });
    expect(result.ok).toBe(false);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("invalid_date_range");
    expect(CoinTransaction.aggregate).not.toHaveBeenCalled();
  });

  test("filters strictly on type=purchase, status=completed, metadata.platform=google_play", async () => {
    CoinTransaction.aggregate.mockResolvedValue([]);
    await summarizeGooglePlayCoinPurchases({ startDate: START, endDate: END });

    const [[pipeline]] = CoinTransaction.aggregate.mock.calls;
    expect(pipeline[0].$match).toEqual({
      type: "purchase",
      status: "completed",
      "metadata.platform": "google_play",
      createdAt: { $gte: START, $lt: END },
    });
  });

  test("returns a single completed Google Play purchase with its product breakdown", async () => {
    CoinTransaction.aggregate.mockResolvedValue([
      { _id: "coins_pack_100", transactionCount: 1, totalCoins: 100 },
    ]);

    const result = await summarizeGooglePlayCoinPurchases({ startDate: START, endDate: END });

    expect(result.ok).toBe(true);
    expect(result.available).toBe(true);
    expect(result.source).toBe("mongodb_cointransaction");
    expect(result.notGooglePlayConsoleRevenue).toBe(true);
    expect(result.totals).toEqual({ transactionCount: 1, totalCoins: 100 });
    expect(result.byProductId).toEqual([{ productId: "coins_pack_100", transactionCount: 1, totalCoins: 100 }]);
  });

  test("aggregates multiple productIds without mixing their counts", async () => {
    CoinTransaction.aggregate.mockResolvedValue([
      { _id: "coins_pack_100", transactionCount: 2, totalCoins: 200 },
      { _id: "coins_pack_500", transactionCount: 1, totalCoins: 500 },
    ]);

    const result = await summarizeGooglePlayCoinPurchases({ startDate: START, endDate: END });

    expect(result.totals).toEqual({ transactionCount: 3, totalCoins: 700 });
    expect(result.byProductId).toEqual([
      { productId: "coins_pack_100", transactionCount: 2, totalCoins: 200 },
      { productId: "coins_pack_500", transactionCount: 1, totalCoins: 500 },
    ]);
  });

  test("never fabricates figures on a query error — returns an explicit unavailable state", async () => {
    CoinTransaction.aggregate.mockRejectedValue(new Error("connection lost"));

    const result = await summarizeGooglePlayCoinPurchases({ startDate: START, endDate: END });

    expect(result.ok).toBe(false);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("query_error");
  });

  test("includes an explicit non-revenue disclaimer and never claims monetary totals", async () => {
    CoinTransaction.aggregate.mockResolvedValue([]);
    const result = await summarizeGooglePlayCoinPurchases({ startDate: START, endDate: END });
    expect(result.note).toEqual(expect.stringContaining("NO representa ingresos"));
  });
});
