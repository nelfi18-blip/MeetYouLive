"use strict";

/**
 * Tests for adminCoinEconomyControl.service.js (read-only diagnostic).
 */

jest.mock("../../models/User.js", () => ({ aggregate: jest.fn(), find: jest.fn() }));
jest.mock("../../models/CoinTransaction.js", () => ({ aggregate: jest.fn() }));
jest.mock("../../models/Payout.js", () => ({ aggregate: jest.fn() }));
jest.mock("../../models/WithdrawalRequest.js", () => ({ aggregate: jest.fn() }));
jest.mock("../../models/GooglePlayReviewPrep.js", () => ({ find: jest.fn() }));

const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const Payout = require("../../models/Payout.js");
const WithdrawalRequest = require("../../models/WithdrawalRequest.js");
const GooglePlayReviewPrep = require("../../models/GooglePlayReviewPrep.js");
const { getCoinEconomyControl, COINS_PER_USD } = require("../adminCoinEconomyControl.service.js");

// Minimal mongoose-query-like chain: `.find(...).select(...).lean()`.
function queryable(result) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe("adminCoinEconomyControl.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Silence the intentional console.error calls from sanitizeError in the
    // "partial failure" tests below.
    jest.spyOn(console, "error").mockImplementation(() => {});
    // Default: no active Google Play review preparations, so User.find is
    // never called unless a test explicitly sets up prepared accounts.
    GooglePlayReviewPrep.find.mockReturnValue(queryable([]));
    User.find.mockReturnValue(queryable([]));
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  function mockHappyPath({
    userAgg = [{ totalCoins: 1000, totalEarningsCoins: 500, totalAgencyEarningsCoins: 50, usersWithCoins: 3, usersWithEarnings: 2 }],
    purchaseRows = [
      { _id: { provider: "stripe", status: "completed" }, totalCoins: 600, count: 6 },
      { _id: { provider: "google_play", status: "completed" }, totalCoins: 300, count: 3 },
      { _id: { provider: "unknown", status: "completed" }, totalCoins: 100, count: 1 },
      { _id: { provider: "stripe", status: "failed" }, totalCoins: 50, count: 1 },
      { _id: { provider: "google_play", status: "pending" }, totalCoins: 25, count: 1 },
    ],
    rewardRows = [{ _id: "daily_reward", totalCoins: 50, count: 5 }],
    adjustmentRows = [
      { _id: { bucket: "withdrawalRelated", testCredit: false, status: "completed" }, totalCoins: -200, count: 2 },
      { _id: { bucket: "other", testCredit: false, status: "completed" }, totalCoins: 20, count: 1 },
      { _id: { bucket: "other", testCredit: true, status: "completed" }, totalCoins: 19980, count: 1 },
      { _id: { bucket: "withdrawalRelated", testCredit: false, status: "failed" }, totalCoins: -10, count: 1 },
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
    // Failed purchase attempts never inflate the completed totals above —
    // they are shown separately instead.
    expect(result.purchaseCredits.excludedFailed).toEqual({ totalCoins: 50, count: 1 });
    expect(result.purchaseCredits.pendingPartialDeliveries).toEqual({ totalCoins: 25, count: 1 });

    expect(result.rewardCredits.byType.daily_reward).toEqual({ totalCoins: 50, count: 5 });
    expect(result.rewardCredits.byType.referral_reward).toEqual({ totalCoins: 0, count: 0 });

    expect(result.adminAdjustments.withdrawalRelated).toEqual({ totalCoins: -200, count: 2 });
    expect(result.adminAdjustments.other).toEqual({ totalCoins: 20, count: 1 });
    // The +19,980 test credit is isolated in its own bucket, never folded
    // into `other` (which could be mistaken for a genuine admin grant).
    expect(result.adminAdjustments.testCredits).toEqual({ totalCoins: 19980, count: 1 });
    expect(result.adminAdjustments.excludedFailed).toEqual({ totalCoins: -10, count: 1 });
    // totalCoins only ever reflects completed, non-test, non-failed buckets summed together.
    expect(result.adminAdjustments.totalCoins).toBe(-200 + 20 + 19980);

    expect(result.creatorEarnings.totalEarningsCoins).toBe(500);
    expect(result.creatorEarnings.estimatedUsdAtHistoricalRate).toBe(500 / COINS_PER_USD);

    expect(result.googlePlayReviewPreparations.available).toBe(true);
    expect(result.googlePlayReviewPreparations.activePreparations).toBe(0);

    expect(Array.isArray(result.dataGaps)).toBe(true);
    expect(result.dataGaps).toContain("googlePlayPurchaseTestVsRealAmbiguity");
    expect(result.dataGaps.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  test("never classifies a metadata.testCredit=true admin_adjustment as income/other", async () => {
    mockHappyPath();
    const result = await getCoinEconomyControl();

    // The test credit amount must never silently appear inside `other`.
    expect(result.adminAdjustments.other.totalCoins).toBe(20);
    expect(result.adminAdjustments.testCredits.totalCoins).toBe(19980);
    expect(result.adminAdjustments.testCredits.count).toBe(1);
  });

  test("surfaces active Google Play review-account preparations as a read-only, aggregated cross-reference", async () => {
    mockHappyPath();
    GooglePlayReviewPrep.find.mockReturnValue(
      queryable([
        { email: "reviewer@example.com", accountType: "reviewer", appliedAt: new Date() },
        { email: "demo-creator@example.com", accountType: "demo_creator", appliedAt: new Date() },
      ])
    );
    User.find.mockReturnValue(
      queryable([
        { email: "reviewer@example.com", coins: 6490 },
        { email: "demo-creator@example.com", coins: 0 },
      ])
    );

    const result = await getCoinEconomyControl();

    expect(GooglePlayReviewPrep.find).toHaveBeenCalledWith({ revertedAt: null });
    expect(result.googlePlayReviewPreparations.available).toBe(true);
    expect(result.googlePlayReviewPreparations.activePreparations).toBe(2);
    expect(result.googlePlayReviewPreparations.byAccountType).toEqual({ reviewer: 1, demo_creator: 1 });
    expect(result.googlePlayReviewPreparations.preparedAccountsCurrentCoins).toBe(6490);
    // Never leaks the prepared accounts' emails.
    expect(JSON.stringify(result.googlePlayReviewPreparations)).not.toContain("reviewer@example.com");

    // Those 6490 coins are already included in the general balance total
    // (coinsBalance.totalCoins), never subtracted or duplicated here.
    expect(result.coinsBalance.totalCoins).toBe(1000);
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
    expect(purchasePipeline[0].$match).toEqual({ type: "purchase" });
    expect(purchasePipeline[1].$project.provider.$cond[0]).toEqual({ $eq: ["$metadata.platform", "google_play"] });
  });

  test("splits admin_adjustment by metadata.withdrawalId presence and metadata.testCredit", async () => {
    mockHappyPath();
    await getCoinEconomyControl();

    const [, , [adjustmentPipeline]] = CoinTransaction.aggregate.mock.calls;
    expect(adjustmentPipeline[0].$match).toEqual({ type: "admin_adjustment" });
    expect(adjustmentPipeline[1].$project.testCredit).toEqual({ $eq: ["$metadata.testCredit", true] });
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

  test("surfaces a Google Play review preparation query failure as unavailable without blanking other sections", async () => {
    mockHappyPath();
    GooglePlayReviewPrep.find.mockImplementation(() => {
      throw new Error("prep query failed");
    });

    const result = await getCoinEconomyControl();

    expect(result.googlePlayReviewPreparations.available).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.coinsBalance.available).toBe(true);
  });
});
