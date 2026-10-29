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

// Shape returned by googlePlayBilling.getProductPurchase() after it has
// normalized a raw ProductPurchaseV2 response (purchaseStateContext.purchaseState,
// productLineItem) into the flat object the controller consumes.
function validPurchase(overrides = {}) {
  return {
    purchaseState: "PURCHASED",
    productId: "coins_pack_100",
    quantity: 1,
    refundableQuantity: 1,
    consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED",
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
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ purchaseState: "PENDING" }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_NOT_COMPLETE" }));
  });

  test("never credits coins for a CANCELLED purchase (V2 purchaseStateContext.purchaseState)", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ purchaseState: "CANCELLED" }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_NOT_COMPLETE" }));
  });

  test("never credits coins when the normalized purchaseState is absent/unknown (fails closed as UNSPECIFIED)", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ purchaseState: "UNSPECIFIED" }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_NOT_COMPLETE" }));
  });

  test("never credits a PURCHASED purchase whose refundableQuantity has dropped to 0 (refunded/revoked)", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ refundableQuantity: 0 }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_REFUNDED" }));
  });

  // --- Already-consumed purchase with no persisted credit record ---------

  test("never credits a purchase Google reports as already consumed when there is no persisted completed transaction for it", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(
      validPurchase({ consumptionState: "CONSUMPTION_STATE_CONSUMED" })
    );
    // No existing CoinTransaction for this purchaseToken (default mock: findOne -> null).

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(User.findById).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_CONSUMED_WITHOUT_RECORD" }));
  });

  test("never credits a purchase reported as already consumed when the only persisted record is still pending (not completed)", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(
      validPurchase({ consumptionState: "CONSUMPTION_STATE_CONSUMED" })
    );
    CoinTransaction.findOne.mockReturnValue(
      withSessionQuery({ _id: "tx-pending", status: "pending", amount: 50, metadata: { coinsCreditedTotal: 50, coinsRequested: 100 } })
    );

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(User.findById).not.toHaveBeenCalled();
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_CONSUMED_WITHOUT_RECORD" }));
  });

  test("still returns the idempotent cached result (never re-credits) for an already-consumed purchase that DOES have a completed record", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(
      validPurchase({ consumptionState: "CONSUMPTION_STATE_CONSUMED" })
    );
    CoinTransaction.findOne.mockReturnValue(
      withSessionQuery({ _id: "tx-existing", status: "completed", amount: 100 })
    );

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(User.findById).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledWith("coins_pack_100", purchaseToken);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: true, fullyCredited: true })
    );
  });

  test("credits normally when the purchase is still unconsumed (CONSUMPTION_STATE_YET_TO_BE_CONSUMED)", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(
      validPurchase({ consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED" })
    );

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coinsCredited: 100, fullyCredited: true }));
  });

  test("never credits a new purchase when consumptionState is UNSPECIFIED (absent/unrecognized) and there is no persisted record", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ consumptionState: "UNSPECIFIED" }));
    // No existing CoinTransaction for this purchaseToken (default mock: findOne -> null).

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(User.findById).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_CONSUMPTION_STATE_UNKNOWN" }));
  });

  test("still returns the idempotent cached result (never re-credits) when consumptionState is UNSPECIFIED but a completed record already exists", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ consumptionState: "UNSPECIFIED" }));
    CoinTransaction.findOne.mockReturnValue(
      withSessionQuery({ _id: "tx-existing", status: "completed", amount: 100 })
    );

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(User.findById).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledWith("coins_pack_100", purchaseToken);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: true, fullyCredited: true })
    );
  });

  // --- Service-level (V2) validation errors surfaced through the controller ---

  test("rejects without crediting when the service reports an ambiguous/mismatched productLineItem (422)", async () => {
    const err = new Error("productLineItem.productId does not match the requested productId");
    err.status = 422;
    err.code = "PURCHASE_PRODUCT_MISMATCH";
    googlePlayBilling.getProductPurchase.mockRejectedValue(err);

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_PRODUCT_MISMATCH" }));
  });

  test("maps a 404 from the Google Play lookup to a safe 404 response without crediting", async () => {
    const err = new Error("No application was found for the given package name.");
    err.status = 404;
    googlePlayBilling.getProductPurchase.mockRejectedValue(err);

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("maps a 403 from the Google Play lookup to a safe 403 response without crediting", async () => {
    const err = new Error("The current user has insufficient permissions.");
    err.status = 403;
    googlePlayBilling.getProductPurchase.mockRejectedValue(err);

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("maps a 5xx from the Google Play lookup to a safe 502 response without crediting", async () => {
    const err = new Error("Internal error encountered.");
    err.status = 500;
    googlePlayBilling.getProductPurchase.mockRejectedValue(err);

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
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

  // --- Account binding (mandatory, fail-closed) -----------------------------

  test("rejects a purchase with no obfuscatedExternalAccountId at all (never treated as proof of ownership)", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(
      validPurchase({ obfuscatedExternalAccountId: undefined })
    );

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_ACCOUNT_UNLINKED" }));
  });

  test("rejects a purchase whose obfuscatedExternalAccountId is an empty string", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ obfuscatedExternalAccountId: "" }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_ACCOUNT_UNLINKED" }));
  });

  test("rejects a purchase whose obfuscatedExternalAccountId belongs to a different user with PURCHASE_ACCOUNT_MISMATCH", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ obfuscatedExternalAccountId: otherUserId }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_ACCOUNT_MISMATCH" }));
  });

  test("credits coins when obfuscatedExternalAccountId exactly matches the authenticated user", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ obfuscatedExternalAccountId: userId }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coinsCredited: 100, fullyCredited: true }));
  });

  test("a different authenticated user can never claim/replay a token already bound (and completed) under another account", async () => {
    // userA's purchase already completed.
    CoinTransaction.findOne.mockReturnValue(
      withSessionQuery({ _id: "tx-existing", status: "completed", amount: 100, metadata: { coinsCreditedTotal: 100 } })
    );
    // Google still reports the token as bound to userId (userA), not otherUserId (userB).
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase({ obfuscatedExternalAccountId: userId }));

    const reqFromOtherUser = { body: { productId: "coins_pack_100", purchaseToken }, userId: otherUserId };
    const res = createMockResponse();

    await verifyCoinsPurchase(reqFromOtherUser, res);

    // Rejected before ever looking at the (already-completed) transaction record.
    expect(CoinTransaction.findOne).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_ACCOUNT_MISMATCH" }));
  });

  // --- Recoverable partial credit at the balance cap ------------------------

  test("never marks a purchase completed/consumed when the coin cap only allows a partial credit", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 39950 })); // only 50 coins of room

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("pending"); // never "completed" while coins are still owed
    expect(tx.amount).toBe(50);
    expect(tx.metadata.coinsCreditedTotal).toBe(50);
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 50, fullyCredited: false, code: "PURCHASE_PARTIALLY_CREDITED" })
    );
  });

  test("credits nothing (but never errors or loses the purchase) when the balance is already at the max", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: MAX_USER_COINS_BALANCE }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("pending");
    expect(tx.amount).toBe(0);
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 0, fullyCredited: false, code: "PURCHASE_PARTIALLY_CREDITED" })
    );
  });

  test("a later retry tops up the remaining coins once balance room frees up, then completes and consumes exactly once", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    // The purchase was previously partially credited (50 of 100) and is still pending/unconsumed.
    const existingTx = {
      _id: "tx-existing",
      status: "pending",
      amount: 50,
      metadata: { coinsRequested: 100, coinsCreditedTotal: 50 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    CoinTransaction.findOne.mockReturnValue(withSessionQuery(existingTx));
    // The user now has room for the remaining 50 coins.
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 39950 }));

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled(); // reuses the existing pending transaction
    expect(existingTx.status).toBe("completed");
    expect(existingTx.amount).toBe(100);
    expect(existingTx.metadata.coinsCreditedTotal).toBe(100);
    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledTimes(1);
    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledWith("coins_pack_100", purchaseToken);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coinsCredited: 100, fullyCredited: true }));
  });

  test("retries a transient write-conflict instead of double-crediting or losing the purchase (concurrency safety)", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 0 }));

    let attempts = 0;
    const conflictThenSucceed = {
      withTransaction: jest.fn(async (fn) => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error("Write conflict");
          err.code = 112;
          throw err;
        }
        return fn();
      }),
      endSession: jest.fn(),
    };
    mongoose.startSession.mockResolvedValueOnce(conflictThenSucceed).mockResolvedValueOnce(conflictThenSucceed);

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(attempts).toBe(2);
    expect(CoinTransaction.create).toHaveBeenCalledTimes(1);
    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coinsCredited: 100, fullyCredited: true }));
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

  // --- Unknown transaction commit result (ambiguous commit outcome) --------

  function makeUnknownCommitResultSession() {
    const err = new Error("Transaction commit result unknown");
    err.hasErrorLabel = (label) => label === "UnknownTransactionCommitResult";
    return {
      withTransaction: jest.fn(async () => {
        throw err;
      }),
      endSession: jest.fn(),
    };
  }

  test("commit exitoso: no se activa la reconciliación y se acredita normalmente (camino feliz ya cubierto arriba)", async () => {
    // Guards the baseline assumption the rest of this block relies on: a
    // normal successful commit never goes through reconcileUnknownCommitResult.
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    // Only the in-transaction lookup (via .session()) happens; the plain,
    // non-transactional reconciliation lookup is never reached.
    expect(CoinTransaction.findOne).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fullyCredited: true }));
  });

  test("conflicto transitorio (TransientTransactionError/112): se reintenta automáticamente sin pasar por la reconciliación", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 0 }));

    let attempts = 0;
    const conflictThenSucceed = {
      withTransaction: jest.fn(async (fn) => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error("Write conflict");
          err.code = 112;
          throw err;
        }
        return fn();
      }),
      endSession: jest.fn(),
    };
    mongoose.startSession.mockResolvedValueOnce(conflictThenSucceed).mockResolvedValueOnce(conflictThenSucceed);

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(attempts).toBe(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fullyCredited: true }));
  });

  test("commit desconocido CONFIRMADO (completado): reconcilia desde el registro persistido, acredita idempotente y consume la compra", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    mongoose.startSession.mockResolvedValueOnce(makeUnknownCommitResultSession());
    // The ambiguous commit actually DID go through: the persisted record
    // shows it fully delivered.
    CoinTransaction.findOne.mockResolvedValueOnce({
      status: "completed",
      amount: 100,
      metadata: { coinsRequested: 100, coinsCreditedTotal: 100 },
    });

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    // Reconciliation must preserve the account-binding guarantee: it is
    // scoped by purchaseToken AND the authenticated user.
    expect(CoinTransaction.findOne).toHaveBeenCalledWith({ "metadata.purchaseToken": purchaseToken, userId });
    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledWith("coins_pack_100", purchaseToken);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: true, fullyCredited: true })
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test("commit desconocido NO RESUELTO (sin registro persistido): no acredita, no consume, devuelve estado recuperable", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    mongoose.startSession.mockResolvedValueOnce(makeUnknownCommitResultSession());
    // The ambiguous commit cannot be confirmed: no durable record exists yet.
    CoinTransaction.findOne.mockResolvedValueOnce(null);

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_RECONCILIATION_PENDING" }));
  });

  test("commit desconocido con entrega PARCIAL persistida: reporta parcial sin consumir ni acreditar de nuevo", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());
    mongoose.startSession.mockResolvedValueOnce(makeUnknownCommitResultSession());
    CoinTransaction.findOne.mockResolvedValueOnce({
      status: "pending",
      amount: 50,
      metadata: { coinsRequested: 100, coinsCreditedTotal: 50 },
    });

    const req = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const res = createMockResponse();

    await verifyCoinsPurchase(req, res);

    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 50, fullyCredited: false, code: "PURCHASE_PARTIALLY_CREDITED" })
    );
  });

  test("recuperación posterior: tras un commit desconocido no resuelto, un reintento posterior ve el commit ya completado y responde idempotente", async () => {
    googlePlayBilling.getProductPurchase.mockResolvedValue(validPurchase());

    // First attempt: ambiguous commit, nothing persisted yet (unresolved).
    mongoose.startSession.mockResolvedValueOnce(makeUnknownCommitResultSession());
    CoinTransaction.findOne.mockResolvedValueOnce(null);

    const firstReq = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const firstRes = createMockResponse();
    await verifyCoinsPurchase(firstReq, firstRes);

    expect(firstRes.status).toHaveBeenCalledWith(202);
    expect(googlePlayBilling.consumeProductPurchase).not.toHaveBeenCalled();

    // Second attempt (later retry/reconciliation): the original transaction
    // had in fact committed and is now visible, fully delivered.
    mongoose.startSession.mockResolvedValueOnce(
      makeDbSession() /* a normal transaction this time */
    );
    CoinTransaction.findOne.mockReturnValueOnce(
      withSessionQuery({ _id: "tx-existing", status: "completed", amount: 100, metadata: { coinsCreditedTotal: 100, coinsRequested: 100 } })
    );

    const secondReq = { body: { productId: "coins_pack_100", purchaseToken }, userId };
    const secondRes = createMockResponse();
    await verifyCoinsPurchase(secondReq, secondRes);

    expect(googlePlayBilling.consumeProductPurchase).toHaveBeenCalledWith("coins_pack_100", purchaseToken);
    expect(secondRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: true, fullyCredited: true })
    );
  });
});
