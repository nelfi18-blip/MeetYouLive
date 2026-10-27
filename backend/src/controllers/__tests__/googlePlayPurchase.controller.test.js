"use strict";

// Security + idempotency tests for the Google Play Billing Coins purchase
// verification endpoint (POST /api/payments/coins/google-play).

const mongoose = require("mongoose");

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../models/CoinTransaction.js", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../services/analytics.service.js", () => ({
  trackAnalyticsEvent: jest.fn(),
  trackSafeAnalyticsEvent: jest.fn(),
}));
jest.mock("../../services/googlePlayBilling.service.js", () => ({
  isConfigured: jest.fn(),
  getProductPurchase: jest.fn(),
  consumeProductPurchase: jest.fn(),
}));

const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const googlePlayBilling = require("../../services/googlePlayBilling.service.js");
const { verifyCoinsPurchase } = require("../googlePlayPurchase.controller.js");
const { MAX_USER_COINS_BALANCE } = require("../../services/coins.service.js");

const userId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439099";
const purchaseToken = "opaque-google-play-token-abc123";

function makeDbSession() {
  return {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(),
  };
}

function selectQuery(value) {
  // User.findById(...).select(...).session(dbSession)
  return { select: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(value) }) };
}

function findOneAndUpdateSelectQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

function withSessionQuery(value) {
  return { session: jest.fn().mockResolvedValue(value) };
}

function createMockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function validPurchase(overrides = {}) {
  return {
    purchaseState: 0, // purchased
    consumptionState: 0,
    obfuscatedExternalAccountId: userId,
    orderId: "GPA.1234-5678-9012-34567",
    ...overrides,
  };
}

describe("verifyCoinsPurchase (Google Play Billing)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(makeDbSession());
    googlePlayBilling.isConfigured.mockReturnValue(true);
    User.findById.mockReturnValue(selectQuery({ _id: userId, coins: 0 }));
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 0 }));
    CoinTransaction.findOne.mockReturnValue(withSessionQuery(null));
    CoinTransaction.create.mockResolvedValue([
      { _id: "tx-1", status: "pending", amount: 100, metadata: {}, save: jest.fn().mockResolvedValue(undefined) },
    ]);
  });

  test("rejects an unrecognized productId before calling Google Play", async () => {
    const req = { body: { productId: "not_a_real_product", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(googlePlayBilling.getProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("returns 503 when Google Play Billing server credentials are not configured", async () => {
    googlePlayBilling.isConfigured.mockReturnValue(false);
    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(googlePlayBilling.getProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test("credits coins only after Google Play confirms the purchase and consumes it", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 0 }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(googlePlayBilling.getProductPurchase).toHaveBeenCalledWith("coins_pack_100", purchaseToken);
    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("completed");
    expect(tx.amount).toBe(100);
    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledWith("coins_pack_100", purchaseToken);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: false })
    );
  });

  test("never credits coins for a purchase that is not in the purchased state", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ purchaseState: 2 })); // pending

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_NOT_COMPLETE" }));
  });

  test("rejects a purchase token whose obfuscatedExternalAccountId belongs to a different user", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ obfuscatedExternalAccountId: otherUserId }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("is idempotent: replaying an already-completed purchaseToken does not credit coins again", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    CoinTransaction.findOne.mockReturnValue(
      withSessionQuery({ _id: "tx-existing", status: "completed", amount: 100 })
    );

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
    // Still attempts to finalize consumption (safe/best-effort, no-op on Google's side if already consumed).
    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledWith("coins_pack_100", purchaseToken);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: true })
    );
  });

  test("caps the credited coins and never exceeds MAX_USER_COINS_BALANCE", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 39950 }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.amount).toBe(50);
    expect(tx.metadata.coinsWithheldByCap).toBe(50);
    expect(tx.metadata.maxCoinsBalance).toBe(MAX_USER_COINS_BALANCE);
  });

  test("does not fail the request when consuming the purchase on Google's side errors out (coins already credited)", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    googlePlayBilling.consumeProductPurchase.mockRejectedValue(new Error("network error"));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coinsCredited: 100 }));
  });

  test("returns 404 when the authenticated user does not exist", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    User.findById.mockReturnValue(selectQuery(null));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(CoinTransaction.create).not.toHaveBeenCalled();
  });
});
