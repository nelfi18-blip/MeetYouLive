"use strict";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../models/CoinTransaction.js", () => ({
  create: jest.fn(),
}));
jest.mock("../../services/analytics.service.js", () => ({
  trackAnalyticsEvent: jest.fn(),
}));

const mongoose = require("mongoose");
const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const { claimReferral } = require("../referral.controller.js");
const { MAX_USER_COINS_BALANCE } = require("../../services/coins.service.js");

function makeSession() {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn(),
  };
}

function selectQuery(value) {
  return { select: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(value) }) };
}

function creditQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

describe("referral.controller — platform-wide coins cap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(makeSession());
    CoinTransaction.create.mockResolvedValue([{}]);
  });

  test("credits full inviter/invited rewards when both are comfortably under the cap", async () => {
    const invited = {
      _id: "invited-1",
      referredBy: "inviter-1",
      referralRewardClaimed: false,
      onboardingComplete: true,
      coins: 100,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const inviter = {
      _id: "inviter-1",
      coins: 500,
      referralCount: 0,
      referralRewardsEarned: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    User.findById
      .mockReturnValueOnce(selectQuery(invited)) // invited lookup
      .mockReturnValueOnce(selectQuery(inviter)); // inviter lookup

    User.findOneAndUpdate
      .mockReturnValueOnce(creditQuery({ coins: 100 })) // invited credit (+20)
      .mockReturnValueOnce(creditQuery({ coins: 500 })); // inviter credit (+50)

    const res = makeRes();
    await claimReferral({ userId: "invited-1" }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsAwarded: 20, newBalance: 120 })
    );
    expect(inviter.referralRewardsEarned).toBe(50);
  });

  test("caps the invited reward so the balance never exceeds MAX_USER_COINS_BALANCE, without crediting the inviter beyond its own cap", async () => {
    const invited = {
      _id: "invited-1",
      referredBy: "inviter-1",
      referralRewardClaimed: false,
      onboardingComplete: true,
      coins: 39990,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const inviter = {
      _id: "inviter-1",
      coins: MAX_USER_COINS_BALANCE,
      referralCount: 0,
      referralRewardsEarned: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    User.findById
      .mockReturnValueOnce(selectQuery(invited))
      .mockReturnValueOnce(selectQuery(inviter));

    User.findOneAndUpdate
      .mockReturnValueOnce(creditQuery({ coins: 39990 })) // invited: only 10 fit
      .mockReturnValueOnce(creditQuery({ coins: MAX_USER_COINS_BALANCE })); // inviter: already at max, 0 fit

    const res = makeRes();
    await claimReferral({ userId: "invited-1" }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsAwarded: 10, newBalance: MAX_USER_COINS_BALANCE })
    );
    // Inviter's ledger reflects the actual (capped) amount credited, not the nominal 50.
    expect(inviter.referralRewardsEarned).toBe(0);

    const invitedTx = CoinTransaction.create.mock.calls[0][0][0];
    expect(invitedTx.amount).toBe(10);
    expect(invitedTx.metadata.withheldByCoinsCap).toBe(10);

    const inviterTx = CoinTransaction.create.mock.calls[1][0][0];
    expect(inviterTx.amount).toBe(0);
    expect(inviterTx.metadata.withheldByCoinsCap).toBe(50);
  });
});
