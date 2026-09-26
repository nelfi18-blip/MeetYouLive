"use strict";

// Focused tests for the platform-wide coins cap enforcement inside the
// Stripe coin-purchase webhook handler (`handlePaymentCompleted`).
//
// Covers Stripe's requirement that a user can never hold more than the
// USD-equivalent of $2,000 in coins (MAX_USER_COINS_BALANCE = 40000 coins).

const mockCreateCheckoutSession = jest.fn();
jest.mock("stripe", () =>
  jest.fn(() => ({
    checkout: { sessions: { create: mockCreateCheckoutSession } },
  }))
);

const mongoose = require("mongoose");

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../models/CoinTransaction.js", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../models/Purchase.js", () => ({
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../models/SparkTransaction.js", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../services/analytics.service.js", () => ({
  trackAnalyticsEvent: jest.fn(),
  trackSafeAnalyticsEvent: jest.fn(),
}));
jest.mock("../../services/essentialNotification.service.js", () => ({
  notifyCoinsPurchaseConfirmed: jest.fn(() => Promise.resolve()),
}));

const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const { notifyCoinsPurchaseConfirmed } = require("../../services/essentialNotification.service.js");
const { handlePaymentCompleted } = require("../payment.controller.js");
const { MAX_USER_COINS_BALANCE } = require("../../services/coins.service.js");

const userId = "507f1f77bcf86cd799439011";

function makeDbSession() {
  return {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(),
  };
}

function selectQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

function withSessionQuery(value) {
  return { session: jest.fn().mockResolvedValue(value) };
}

function coinsCheckoutSession({ id = "cs_test_coins", packageId = 100, coins = 100 } = {}) {
  return {
    id,
    mode: "payment",
    amount_total: 499,
    metadata: { userId, packageId: String(packageId), coins: String(coins), type: "coins" },
  };
}

describe("coins purchase webhook — platform-wide coins cap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(makeDbSession());
    User.findById.mockResolvedValue({ _id: userId, coins: 0 });
    CoinTransaction.findOne.mockReturnValue(withSessionQuery(null));
    CoinTransaction.create.mockResolvedValue([
      { _id: "tx-1", status: "pending", metadata: {}, save: jest.fn().mockResolvedValue(undefined) },
    ]);
  });

  test("credits the full package amount when comfortably under the cap", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: 0 }));

    await handlePaymentCompleted(coinsCheckoutSession({ packageId: 100, coins: 100 }));

    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("completed");
    expect(tx.amount).toBe(100);
    expect(notifyCoinsPurchaseConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ coins: 100, balance: 100 })
    );
  });

  test("caps the credited coins and never exceeds MAX_USER_COINS_BALANCE, while preserving the paid transaction record", async () => {
    // User already holds 39950 coins; buying the 100-coin Starter Pack would
    // push the balance to 40050, which must be clamped to 40000.
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: 39950 }));

    await handlePaymentCompleted(coinsCheckoutSession({ packageId: 100, coins: 100 }));

    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("completed");
    expect(tx.amount).toBe(50); // only 50 coins fit under the cap
    expect(tx.metadata.coinsWithheldByCap).toBe(50);
    expect(tx.metadata.coinsRequested).toBe(100);
    expect(notifyCoinsPurchaseConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ coins: 50, balance: 40000 })
    );
  });

  test("credits 0 coins (never negative, never silently lost — recorded on the ledger) when the wallet is already at the max", async () => {
    User.findOneAndUpdate.mockReturnValue(selectQuery({ coins: MAX_USER_COINS_BALANCE }));

    await handlePaymentCompleted(coinsCheckoutSession({ packageId: 100, coins: 100 }));

    const [tx] = await CoinTransaction.create.mock.results[0].value;
    expect(tx.status).toBe("completed");
    expect(tx.amount).toBe(0);
    expect(tx.metadata.coinsWithheldByCap).toBe(100);
    expect(tx.metadata.coinsCredited).toBe(false);
  });

  test("duplicate webhook delivery for an already-completed session does not credit coins again", async () => {
    CoinTransaction.findOne.mockReturnValue(
      withSessionQuery({ _id: "tx-existing", status: "completed" })
    );

    await handlePaymentCompleted(coinsCheckoutSession());

    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
  });
});
