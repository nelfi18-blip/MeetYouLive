"use strict";

// Security + idempotency tests for the Apple In-App Purchase (StoreKit 2)
// Coins purchase verification endpoint (POST /api/payments/coins/apple).

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
jest.mock("../../services/appleStoreKit.service.js", () => ({
  isConfigured: jest.fn(),
  getVerifiedTransaction: jest.fn(),
}));
jest.mock("../../services/appleAccountToken.service.js", () => ({
  deriveAppAccountToken: jest.fn((userId) => `derived-${userId}`),
}));

const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const appleStoreKit = require("../../services/appleStoreKit.service.js");
const { deriveAppAccountToken } = require("../../services/appleAccountToken.service.js");
const { verifyApplePurchase } = require("../applePurchase.controller.js");
const { MAX_USER_COINS_BALANCE } = require("../../services/coins.service.js");

const userId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439099";
const transactionId = "2000000123456789";

function makeDbSession() {
  return {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(),
  };
}

function selectQuery(value) {
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

// Shape returned by appleStoreKit.getVerifiedTransaction() after it has
// verified the JWS signature and normalized the decoded transaction into
// the flat object the controller consumes.
function validTransaction(overrides = {}) {
  return {
    transactionId,
    originalTransactionId: transactionId,
    productId: "coins_pack_100",
    quantity: 1,
    appAccountToken: `derived-${userId}`,
    refunded: false,
    environment: "Sandbox",
    ...overrides,
  };
}

describe("verifyApplePurchase (Apple StoreKit 2 / App Store Server API)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(makeDbSession());
    appleStoreKit.isConfigured.mockReturnValue(true);
    deriveAppAccountToken.mockImplementation((uid) => `derived-${uid}`);
    User.findById.mockReturnValue(selectQuery({ _id: userId, coins: 0 }));
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 0 }));
    CoinTransaction.findOne.mockReturnValue(withSessionQuery(null));
    CoinTransaction.create.mockResolvedValue([
      { _id: "tx-1", status: "pending", amount: 100, metadata: {}, save: jest.fn().mockResolvedValue(undefined) },
    ]);
  });

  test("rejects an unrecognized productId before calling Apple", async () => {
    const req = { body: { productId: "not_a_real_product", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(appleStoreKit.getVerifiedTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("returns 503 when Apple IAP server credentials are not configured", async () => {
    appleStoreKit.isConfigured.mockReturnValue(false);
    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(appleStoreKit.getVerifiedTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test("credits coins only after Apple confirms the transaction", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 0 }));

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(appleStoreKit.getVerifiedTransaction).toHaveBeenCalledWith(transactionId, "coins_pack_100");
    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("completed");
    expect(tx.amount).toBe(100);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: false })
    );
  });

  test("never credits a refunded/revoked transaction", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction({ refunded: true }));

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_REFUNDED" }));
  });

  // --- Service-level (JWS/API) validation errors surfaced through the controller ---

  test("rejects without crediting when the service reports a product mismatch (422)", async () => {
    const err = new Error("The verified transaction's productId does not match the requested productId");
    err.status = 422;
    err.code = "PURCHASE_PRODUCT_MISMATCH";
    appleStoreKit.getVerifiedTransaction.mockRejectedValue(err);

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_PRODUCT_MISMATCH" }));
  });

  test("maps a 404 from Apple's transaction lookup to a safe 404 response without crediting", async () => {
    const err = new Error("Transaction id not found.");
    err.status = 404;
    appleStoreKit.getVerifiedTransaction.mockRejectedValue(err);

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("maps a 5xx/unexpected error from Apple's API to a safe 502 response without crediting", async () => {
    const err = new Error("Internal error encountered.");
    err.status = 500;
    appleStoreKit.getVerifiedTransaction.mockRejectedValue(err);

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
  });

  test("is idempotent: replaying an already-completed transactionId does not credit coins again", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    CoinTransaction.findOne.mockReturnValue(
      withSessionQuery({ _id: "tx-existing", status: "completed", amount: 100 })
    );

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: true })
    );
  });

  test("caps the credited coins and never exceeds MAX_USER_COINS_BALANCE", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 39950 }));

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.amount).toBe(50);
    expect(tx.metadata.coinsWithheldByCap).toBe(50);
    expect(tx.metadata.maxCoinsBalance).toBe(MAX_USER_COINS_BALANCE);
  });

  // --- Account binding (mandatory, fail-closed) -----------------------------

  test("rejects a transaction with no appAccountToken at all (rejected upstream by the service, never treated as proof of ownership)", async () => {
    const err = new Error("The verified transaction is missing appAccountToken (required for account binding)");
    err.status = 422;
    err.code = "PURCHASE_ACCOUNT_TOKEN_MISSING";
    appleStoreKit.getVerifiedTransaction.mockRejectedValue(err);

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_ACCOUNT_TOKEN_MISSING" }));
  });

  test("rejects a transaction whose appAccountToken belongs to a different user", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(
      validTransaction({ appAccountToken: `derived-${otherUserId}` })
    );

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_ACCOUNT_MISMATCH" }));
  });

  test("credits coins when appAccountToken exactly matches the authenticated user's derived token", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction({ appAccountToken: `derived-${userId}` }));

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coinsCredited: 100, fullyCredited: true }));
  });

  test("a different authenticated user can never claim/replay a transaction already bound (and completed) under another account", async () => {
    CoinTransaction.findOne.mockReturnValue(
      withSessionQuery({ _id: "tx-existing", status: "completed", amount: 100, metadata: { coinsCreditedTotal: 100 } })
    );
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction({ appAccountToken: `derived-${userId}` }));

    const reqFromOtherUser = { body: { productId: "coins_pack_100", transactionId }, userId: otherUserId };
    const res = createMockResponse();

    await verifyApplePurchase(reqFromOtherUser, res);

    expect(CoinTransaction.findOne).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_ACCOUNT_MISMATCH" }));
  });

  // --- Recoverable partial credit at the balance cap ------------------------

  test("never marks a purchase completed when the coin cap only allows a partial credit", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 39950 })); // only 50 coins of room

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("pending"); // never "completed" while coins are still owed
    expect(tx.amount).toBe(50);
    expect(tx.metadata.coinsCreditedTotal).toBe(50);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 50, fullyCredited: false, code: "PURCHASE_PARTIALLY_CREDITED" })
    );
  });

  test("credits nothing (but never errors or loses the purchase) when the balance is already at the max", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: MAX_USER_COINS_BALANCE }));

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("pending");
    expect(tx.amount).toBe(0);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 0, fullyCredited: false, code: "PURCHASE_PARTIALLY_CREDITED" })
    );
  });

  test("a later retry tops up the remaining coins once balance room frees up, then completes exactly once", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    const existingTx = {
      _id: "tx-existing",
      status: "pending",
      amount: 50,
      metadata: { coinsRequested: 100, coinsCreditedTotal: 50 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    CoinTransaction.findOne.mockReturnValue(withSessionQuery(existingTx));
    User.findOneAndUpdate.mockReturnValue(findOneAndUpdateSelectQuery({ coins: 39950 }));

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(CoinTransaction.create).not.toHaveBeenCalled(); // reuses the existing pending transaction
    expect(existingTx.status).toBe("completed");
    expect(existingTx.amount).toBe(100);
    expect(existingTx.metadata.coinsCreditedTotal).toBe(100);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coinsCredited: 100, fullyCredited: true }));
  });

  test("retries a transient write-conflict instead of double-crediting or losing the purchase (concurrency safety)", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
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

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(attempts).toBe(2);
    expect(CoinTransaction.create).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coinsCredited: 100, fullyCredited: true }));
  });

  test("returns 404 when the authenticated user does not exist", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    User.findById.mockReturnValue(selectQuery(null));

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

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

  test("commit desconocido CONFIRMADO: reconcilia desde el registro persistido y responde idempotente", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    mongoose.startSession.mockResolvedValueOnce(makeUnknownCommitResultSession());
    CoinTransaction.findOne.mockResolvedValueOnce({
      status: "completed",
      amount: 100,
      metadata: { coinsRequested: 100, coinsCreditedTotal: 100 },
    });

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(CoinTransaction.findOne).toHaveBeenCalledWith({ "metadata.appleTransactionId": transactionId, userId });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: true, fullyCredited: true })
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test("commit desconocido NO RESUELTO: no acredita y devuelve estado recuperable", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    mongoose.startSession.mockResolvedValueOnce(makeUnknownCommitResultSession());
    CoinTransaction.findOne.mockResolvedValueOnce(null);

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PURCHASE_RECONCILIATION_PENDING" }));
  });

  test("commit desconocido con entrega PARCIAL persistida: reporta parcial sin acreditar de nuevo", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());
    mongoose.startSession.mockResolvedValueOnce(makeUnknownCommitResultSession());
    CoinTransaction.findOne.mockResolvedValueOnce({
      status: "pending",
      amount: 50,
      metadata: { coinsRequested: 100, coinsCreditedTotal: 50 },
    });

    const req = { body: { productId: "coins_pack_100", transactionId }, userId };
    const res = createMockResponse();

    await verifyApplePurchase(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 50, fullyCredited: false, code: "PURCHASE_PARTIALLY_CREDITED" })
    );
  });

  test("recuperación posterior: tras un commit desconocido no resuelto, un reintento posterior ve el commit ya completado y responde idempotente", async () => {
    appleStoreKit.getVerifiedTransaction.mockResolvedValue(validTransaction());

    mongoose.startSession.mockResolvedValueOnce(makeUnknownCommitResultSession());
    CoinTransaction.findOne.mockResolvedValueOnce(null);

    const firstReq = { body: { productId: "coins_pack_100", transactionId }, userId };
    const firstRes = createMockResponse();
    await verifyApplePurchase(firstReq, firstRes);

    expect(firstRes.status).toHaveBeenCalledWith(202);

    mongoose.startSession.mockResolvedValueOnce(makeDbSession());
    CoinTransaction.findOne.mockReturnValueOnce(
      withSessionQuery({ _id: "tx-existing", status: "completed", amount: 100, metadata: { coinsCreditedTotal: 100, coinsRequested: 100 } })
    );

    const secondReq = { body: { productId: "coins_pack_100", transactionId }, userId };
    const secondRes = createMockResponse();
    await verifyApplePurchase(secondReq, secondRes);

    expect(secondRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsCredited: 100, alreadyProcessed: true, fullyCredited: true })
    );
  });
});
