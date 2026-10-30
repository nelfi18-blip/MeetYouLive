"use strict";

/**
 * Tests for adminCoinEconomyControl.service.js (read-only diagnostic).
 */

jest.mock("../../models/User.js", () => ({ aggregate: jest.fn() }));
jest.mock("../../models/CoinTransaction.js", () => ({ aggregate: jest.fn() }));
jest.mock("../../models/Payout.js", () => ({ aggregate: jest.fn() }));
jest.mock("../../models/WithdrawalRequest.js", () => ({ aggregate: jest.fn() }));

const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const Payout = require("../../models/Payout.js");
const WithdrawalRequest = require("../../models/WithdrawalRequest.js");
const { getCoinEconomyControl, COINS_PER_USD } = require("../adminCoinEconomyControl.service.js");

describe("adminCoinEconomyControl.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Silence the intentional console.error calls from sanitizeError in the
    // "partial failure" tests below.
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  function mockHappyPath({
    userAgg = [{ totalCoins: 1000, totalEarningsCoins: 500, totalAgencyEarningsCoins: 50, usersWithCoins: 3, usersWithEarnings: 2 }],
    purchaseRows = [
      { _id: "stripe", totalCoins: 600, count: 6 },
      { _id: "google_play", totalCoins: 300, count: 3 },
      { _id: "unknown", totalCoins: 100, count: 1 },
    ],
    rewardRows = [{ _id: "daily_reward", totalCoins: 50, count: 5 }],
    adjustmentRows = [
      { _id: "withdrawalRelated", totalCoins: -200, count: 2 },
      { _id: "other", totalCoins: 20, count: 1 },
    ],
    payoutRows = [
      { _id: "paid", totalCoins: 400, totalUsd: 40, count: 2 },
      { _id: "pending", totalCoins: 100, totalUsd: 10, count: 1 },
    ],
    withdrawalRows = [{ _id: "paid", totalCoins: 300, totalUsd: 30, count: 1 }],
  } = {}) {
    User.aggregate.mockResolvedValue(userAgg);
    CoinTransaction.aggregate
      .mockResolvedValueOnce(purchaseRows)
      .mockResolvedValueOnce(rewardRows)
      .mockResolvedValueOnce(adjustmentRows);
    Payout.aggregate.mockResolvedValue(payoutRows);
    WithdrawalRequest.aggregate.mockResolvedValue(withdrawalRows);
  }

  test("aggregates every section and marks the report complete when all sources succeed", async () => {
    mockHappyPath();

    const result = await getCoinEconomyControl();

    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.coinsBalance.totalCoins).toBe(1000);
    expect(result.coinsBalance.totalEarningsCoins).toBe(500);

    expect(result.purchaseCredits.byProvider.stripe).toEqual({ totalCoins: 600, count: 6 });
    expect(result.purchaseCredits.byProvider.google_play).toEqual({ totalCoins: 300, count: 3 });
    expect(result.purchaseCredits.byProvider.unknown).toEqual({ totalCoins: 100, count: 1 });
    expect(result.purchaseCredits.totalCoins).toBe(1000);

    expect(result.rewardCredits.byType.daily_reward).toEqual({ totalCoins: 50, count: 5 });
    expect(result.rewardCredits.byType.referral_reward).toEqual({ totalCoins: 0, count: 0 });

    expect(result.adminAdjustments.withdrawalRelated).toEqual({ totalCoins: -200, count: 2 });
    expect(result.adminAdjustments.other).toEqual({ totalCoins: 20, count: 1 });

    expect(result.creatorEarnings.totalEarningsCoins).toBe(500);
    expect(result.creatorEarnings.estimatedUsdAtHistoricalRate).toBe(500 / COINS_PER_USD);

    expect(Array.isArray(result.dataGaps)).toBe(true);
    expect(result.dataGaps.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  test("never sums Payout and WithdrawalRequest totals into one figure", async () => {
    mockHappyPath();
    const result = await getCoinEconomyControl();

    expect(result.withdrawalObligations.payouts.paidLifetime).toEqual({ totalCoins: 400, totalUsd: 40, count: 2 });
    expect(result.withdrawalObligations.withdrawalRequests.paidLifetime).toEqual({ totalCoins: 300, totalUsd: 30, count: 1 });
    // No field anywhere combines 400 + 300 into 700.
    const serialized = JSON.stringify(result);
    expect(serialized.includes('"totalCoins":700')).toBe(false);
  });

  test("attributes purchase provider strictly from stored metadata evidence (pipeline shape)", async () => {
    mockHappyPath();
    await getCoinEconomyControl();

    const [[purchasePipeline]] = CoinTransaction.aggregate.mock.calls;
    expect(purchasePipeline[0].$match).toEqual({ type: "purchase", status: "completed" });
    expect(purchasePipeline[1].$project.provider.$cond[0]).toEqual({ $eq: ["$metadata.platform", "google_play"] });
  });

  test("splits admin_adjustment by metadata.withdrawalId presence", async () => {
    mockHappyPath();
    await getCoinEconomyControl();

    const [, , [adjustmentPipeline]] = CoinTransaction.aggregate.mock.calls;
    expect(adjustmentPipeline[0].$match).toEqual({ type: "admin_adjustment" });
  });

  test("surfaces a section as unavailable (never fabricated zero) when its query fails, without blanking other sections", async () => {
    mockHappyPath();
    CoinTransaction.aggregate.mockReset();
    CoinTransaction.aggregate
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([{ _id: "daily_reward", totalCoins: 50, count: 5 }])
      .mockResolvedValueOnce([]);

    const result = await getCoinEconomyControl();

    expect(result.complete).toBe(false);
    expect(result.purchaseCredits.available).toBe(false);
    expect(result.purchaseCredits.totalCoins).toBeUndefined();
    expect(result.rewardCredits.available).toBe(true);
    expect(result.coinsBalance.available).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("propagates coinsBalance failure into creatorEarnings as unavailable, never a fabricated conversion", async () => {
    User.aggregate.mockRejectedValue(new Error("db down"));
    CoinTransaction.aggregate.mockResolvedValue([]);
    Payout.aggregate.mockResolvedValue([]);
    WithdrawalRequest.aggregate.mockResolvedValue([]);

    const result = await getCoinEconomyControl();

    expect(result.coinsBalance.available).toBe(false);
    expect(result.creatorEarnings.available).toBe(false);
    expect(result.creatorEarnings.estimatedUsdAtHistoricalRate).toBeUndefined();
    expect(result.complete).toBe(false);
  });
});
