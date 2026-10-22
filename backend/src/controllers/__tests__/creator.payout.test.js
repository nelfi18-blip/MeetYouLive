"use strict";

// requestPayout — atomic transaction tests.
//
// These tests verify that reserving the creator's earnings balance and
// creating the Payout document happen inside a single MongoDB transaction:
// any failure (including Payout.create failing) rolls back the balance
// reservation, and concurrent/duplicate requests can never reserve or spend
// the same balance twice.

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../models/Payout.js", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../../models/Gift", () => ({}));
jest.mock("../../models/Live", () => ({}));
jest.mock("../../models/VideoCall", () => ({}));
jest.mock("../../models/CoinTransaction", () => ({}));
jest.mock("../../models/AgencyRelationship", () => ({}));

const mongoose = require("mongoose");
const User = require("../../models/User.js");
const Payout = require("../../models/Payout.js");
const { requestPayout } = require("../creator.controller.js");

function makeSession() {
  return {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(async () => {}),
  };
}

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

// `User.findById(id).select(...)` — used by requireApprovedCreatorHelper.
function selectOnly(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

// `User.findById(id).select(...).session(session)` — used for the
// insufficient-balance diagnostic read inside the transaction.
function selectThenSession(value) {
  return { select: jest.fn(() => ({ session: jest.fn().mockResolvedValue(value) })) };
}

// `Payout.findOne(...).session(session)`.
function sessionQuery(value) {
  return { session: jest.fn().mockResolvedValue(value) };
}

const APPROVED_CREATOR = {
  _id: "creator-1",
  role: "creator",
  creatorStatus: "approved",
  earningsCoins: 250,
};

describe("requestPayout — atomic balance reservation + Payout creation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("success: reserves the balance and creates the payout in one transaction", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
    Payout.create.mockResolvedValueOnce([
      {
        _id: "payout-1",
        amountCoins: 250,
        amountUsd: 25,
        method: "stripe",
        status: "pending",
        createdAt: new Date("2024-01-01"),
      },
    ]);

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "creator-1", earningsCoins: { $gte: 100 } },
      { $set: { earningsCoins: 0 } },
      expect.objectContaining({ new: false, session })
    );
    expect(Payout.create).toHaveBeenCalledWith(
      [expect.objectContaining({ creator: "creator-1", amountCoins: 250, amountUsd: 25, status: "pending" })],
      { session }
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        payout: expect.objectContaining({ _id: "payout-1", amountCoins: 250, amountUsd: 25 }),
      })
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test("Payout.create failure rolls back the whole transaction (balance reservation included)", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
    Payout.create.mockRejectedValueOnce(new Error("insert failed"));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

    // withTransaction propagates the Payout.create rejection, so the driver
    // aborts the transaction — the earningsCoins reset is never committed.
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test("insufficient balance: rejects with 400 and does not touch Payout", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR, earningsCoins: 40 }));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, minRequired: 100, current: 40 })
    );
    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(Payout.create).not.toHaveBeenCalled();
  });

  test("concurrency: a second in-flight request finds the balance already reserved and gets 400", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    // First request already won the race and zeroed earningsCoins.
    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockResolvedValueOnce(null);
    User.findById.mockReturnValueOnce(selectThenSession({ earningsCoins: 0 }));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, minRequired: 100, current: 0 })
    );
    expect(Payout.create).not.toHaveBeenCalled();
  });

  test("existing pending payout: rejects with 409 before any balance mutation", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    const pending = {
      _id: "payout-pending",
      amountCoins: 150,
      status: "pending",
      createdAt: new Date("2024-01-01"),
    };
    Payout.findOne.mockReturnValueOnce(sessionQuery(pending));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        payout: expect.objectContaining({ _id: "payout-pending", status: "pending" }),
      })
    );
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("retries on a transient write-conflict and succeeds on the next attempt", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));

    const conflictErr = new Error("Write conflict");
    conflictErr.code = 112;
    const failingSession = {
      withTransaction: jest.fn(async () => {
        throw conflictErr;
      }),
      endSession: jest.fn(async () => {}),
    };
    const succeedingSession = makeSession();

    jest
      .spyOn(mongoose, "startSession")
      .mockResolvedValueOnce(failingSession)
      .mockResolvedValueOnce(succeedingSession);

    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockResolvedValueOnce({ earningsCoins: 250 });
    Payout.create.mockResolvedValueOnce([
      { _id: "payout-2", amountCoins: 250, amountUsd: 25, method: "stripe", status: "pending", createdAt: new Date() },
    ]);

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: { method: "stripe" } }, res);

    expect(mongoose.startSession).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    expect(failingSession.endSession).toHaveBeenCalledTimes(1);
    expect(succeedingSession.endSession).toHaveBeenCalledTimes(1);
  });

  test("rollback: unexpected error inside the transaction aborts without creating a Payout", async () => {
    User.findById.mockReturnValueOnce(selectOnly({ ...APPROVED_CREATOR }));
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValueOnce(session);

    Payout.findOne.mockReturnValueOnce(sessionQuery(null));
    User.findOneAndUpdate.mockRejectedValueOnce(new Error("db down"));

    const res = makeRes();
    await requestPayout({ userId: "creator-1", body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(Payout.create).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
