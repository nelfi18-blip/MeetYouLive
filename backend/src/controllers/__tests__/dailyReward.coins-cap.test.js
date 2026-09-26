"use strict";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  exists: jest.fn(),
}));
jest.mock("../../models/CoinTransaction.js", () => ({
  create: jest.fn(),
}));
jest.mock("../../services/push.service.js", () => ({
  queueEvent: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../services/progression.service.js", () => ({
  addXP: jest.fn(() => Promise.resolve()),
  unlockAchievement: jest.fn(() => Promise.resolve()),
  getDailyRewardXP: jest.fn(() => 0),
}));

const mongoose = require("mongoose");
const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const { claimDailyReward } = require("../dailyReward.controller.js");
const { MAX_USER_COINS_BALANCE } = require("../../services/coins.service.js");

function makeSession() {
  return {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(),
  };
}

function selectQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

describe("dailyReward.controller — platform-wide coins cap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(makeSession());
    CoinTransaction.create.mockResolvedValue([{}]);
  });

  test("credits the full daily reward when comfortably under the cap", async () => {
    // claimRewardAtomically (day-1 streak, 20 coins nominal)
    User.findOneAndUpdate
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({ _id: "u1", coins: 100, dailyRewardStreak: 1 }),
      })
      // creditCoinsWithCap internal call
      .mockReturnValueOnce(selectQuery({ coins: 100 }));

    const res = makeRes();
    await claimDailyReward({ userId: "u1" }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsAwarded: 20, newBalance: 120, cappedByLimit: false })
    );
  });

  test("caps the daily reward so the balance never exceeds MAX_USER_COINS_BALANCE", async () => {
    User.findOneAndUpdate
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({ _id: "u1", coins: 39990, dailyRewardStreak: 1 }),
      })
      .mockReturnValueOnce(selectQuery({ coins: 39990 }));

    const res = makeRes();
    await claimDailyReward({ userId: "u1" }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ coinsAwarded: 10, newBalance: MAX_USER_COINS_BALANCE, cappedByLimit: true })
    );
    const [[txArg]] = CoinTransaction.create.mock.calls;
    expect(txArg[0].amount).toBe(10);
    expect(txArg[0].metadata.withheldByCoinsCap).toBe(10);
  });

  test("rejects a second claim on the same day (existing anti-double-claim guarantee preserved)", async () => {
    User.findOneAndUpdate.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) });
    User.exists.mockReturnValue({ session: jest.fn().mockResolvedValue(true) });

    const res = makeRes();
    await claimDailyReward({ userId: "u1" }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});
