"use strict";

const mongoose = require("mongoose");

jest.mock("../../models/VideoCall.js", () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({
  exists: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../../models/CoinTransaction.js", () => ({
  create: jest.fn(),
}));

jest.mock("../../models/AgencyRelationship.js", () => ({
  findOne: jest.fn(),
}));

jest.mock("../../services/callRules.service.js", () => ({
  CALL_TYPES: { SOCIAL: "social", PAID_CREATOR: "paid_creator" },
  normalizeCallType: jest.fn((type) => type || "social"),
  assertSocialCallAllowed: jest.fn(),
  assertPaidCreatorCallAllowed: jest.fn(),
  assertNotBlockedBetween: jest.fn(),
  isPendingCallExpired: jest.fn(() => false),
  PENDING_CALL_TIMEOUT_MS: 30000,
}));

jest.mock("../../lib/socket.js", () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() })),
  })),
  getOnlineUsers: jest.fn(() => []),
}));

const VideoCall = require("../../models/VideoCall.js");
const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const AgencyRelationship = require("../../models/AgencyRelationship.js");
const callRules = require("../../services/callRules.service.js");
const socket = require("../../lib/socket.js");
const { respondCall, endCall, getIncoming, tickCall } = require("../videoCall.controller.js");

const callerId = "507f1f77bcf86cd799439011";
const creatorId = "507f1f77bcf86cd799439012";
const callId = "507f1f77bcf86cd799439013";
const agencyId = "507f1f77bcf86cd799439014";

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

function makeSession() {
  return {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn(),
  };
}

function mockQueryWithSession(value) {
  return { session: jest.fn().mockResolvedValue(value) };
}

function agencyQuery(value = null) {
  return { session: jest.fn().mockResolvedValue(value) };
}

function populateQuery(value) {
  const query = {
    populate: jest.fn(() => query),
    then: (resolve) => Promise.resolve(resolve(value)),
  };
  return query;
}

function paidCall(overrides = {}) {
  return {
    _id: callId,
    caller: callerId,
    recipient: creatorId,
    status: "pending",
    type: "paid_creator",
    callCoins: 100,
    startedAt: null,
    initialChargeDebitedAt: null,
    initialChargeCreditedAt: null,
    refundedAt: null,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function acceptCall({ claimed = paidCall({ status: "accepted" }), callerUpdate = { _id: callerId } } = {}) {
  const session = makeSession();
  jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
  AgencyRelationship.findOne.mockReturnValue(agencyQuery(null));
  VideoCall.findById
    .mockResolvedValueOnce(paidCall())
    .mockReturnValueOnce(mockQueryWithSession(paidCall()))
    .mockReturnValueOnce(populateQuery(claimed));
  VideoCall.findOneAndUpdate.mockResolvedValueOnce(claimed);
  User.findOneAndUpdate.mockResolvedValueOnce(callerUpdate);
  User.findByIdAndUpdate.mockResolvedValue({});
  CoinTransaction.create.mockResolvedValue([]);

  const res = makeRes();
  await respondCall({ params: { id: callId }, userId: creatorId, body: { action: "accept" } }, res);
  return { res, session };
}

describe("paid call billing atomicity", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    callRules.normalizeCallType.mockImplementation((type) => type || "social");
    callRules.isPendingCallExpired.mockReturnValue(false);
    socket.getIO.mockReturnValue({
      to: jest.fn(() => ({ emit: jest.fn() })),
    });
    socket.getOnlineUsers.mockReturnValue([]);
  });

  test("concurrent accept attempts produce a single paid state transition", async () => {
    await acceptCall();

    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    AgencyRelationship.findOne.mockReturnValue(agencyQuery(null));
    VideoCall.findById
      .mockResolvedValueOnce(paidCall())
      .mockReturnValueOnce(mockQueryWithSession(paidCall()))
      .mockReturnValueOnce(populateQuery(paidCall({ status: "accepted" })));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(null);

    const secondRes = makeRes();
    await respondCall({ params: { id: callId }, userId: creatorId, body: { action: "accept" } }, secondRes);

    expect(VideoCall.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(CoinTransaction.create).toHaveBeenCalledTimes(1);
    expect(secondRes.status).toHaveBeenCalledWith(400);
  });

  test("accept with insufficient balance rolls back before crediting or ledger creation", async () => {
    const claimed = paidCall({ status: "accepted" });
    await acceptCall({ claimed, callerUpdate: null });

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: callerId, coins: { $gte: 100 } },
      { $inc: { coins: -100 } },
      expect.objectContaining({ new: true })
    );
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
  });

  test("two simultaneous reject requests create only one pending refund", async () => {
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const refundable = paidCall({ initialChargeDebitedAt: new Date("2026-01-01T00:00:00Z") });
    const rejected = paidCall({
      status: "rejected",
      initialChargeDebitedAt: refundable.initialChargeDebitedAt,
      save: jest.fn().mockResolvedValue(undefined),
    });

    VideoCall.findById
      .mockResolvedValueOnce(refundable)
      .mockReturnValueOnce(populateQuery(rejected))
      .mockResolvedValueOnce(refundable)
      .mockReturnValueOnce(mockQueryWithSession(rejected))
      .mockReturnValueOnce(populateQuery(rejected));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(rejected).mockResolvedValueOnce(null);
    User.findByIdAndUpdate.mockResolvedValue({});
    CoinTransaction.create.mockResolvedValue([]);

    await respondCall({ params: { id: callId }, userId: creatorId, body: { action: "reject" } }, makeRes());
    await respondCall({ params: { id: callId }, userId: creatorId, body: { action: "reject" } }, makeRes());

    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(CoinTransaction.create).toHaveBeenCalledTimes(1);
  });

  test("reject vs missed race creates only one refund", async () => {
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const stale = paidCall({ initialChargeDebitedAt: new Date("2026-01-01T00:00:00Z") });
    const missed = paidCall({
      status: "missed",
      initialChargeDebitedAt: stale.initialChargeDebitedAt,
      save: jest.fn().mockResolvedValue(undefined),
    });
    callRules.isPendingCallExpired.mockReturnValueOnce(true);
    VideoCall.findById.mockResolvedValueOnce(stale).mockReturnValueOnce(mockQueryWithSession(missed));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(missed).mockResolvedValueOnce(null);
    VideoCall.findOne
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(stale) })
      .mockReturnValueOnce({ sort: jest.fn().mockReturnValue(populateQuery(null)) });
    User.findByIdAndUpdate.mockResolvedValue({});
    CoinTransaction.create.mockResolvedValue([]);

    await respondCall({ params: { id: callId }, userId: creatorId, body: { action: "reject" } }, makeRes());
    await getIncoming({ userId: creatorId }, makeRes());

    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(CoinTransaction.create).toHaveBeenCalledTimes(1);
  });

  test("missed vs pending end race creates only one refund", async () => {
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    const stale = paidCall({ initialChargeDebitedAt: new Date("2026-01-01T00:00:00Z") });
    const missed = paidCall({
      status: "missed",
      initialChargeDebitedAt: stale.initialChargeDebitedAt,
      save: jest.fn().mockResolvedValue(undefined),
    });
    VideoCall.findOne
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(stale) })
      .mockReturnValueOnce({ sort: jest.fn().mockReturnValue(populateQuery(null)) });
    VideoCall.findById.mockResolvedValueOnce(stale).mockReturnValueOnce(mockQueryWithSession(missed));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(missed).mockResolvedValueOnce(null);
    User.findByIdAndUpdate.mockResolvedValue({});
    CoinTransaction.create.mockResolvedValue([]);

    await getIncoming({ userId: creatorId }, makeRes());
    await endCall({ params: { id: callId }, userId: callerId, body: {} }, makeRes());

    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(CoinTransaction.create).toHaveBeenCalledTimes(1);
  });

  test("duplicate tick inside same billing window is idempotent", async () => {
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    AgencyRelationship.findOne.mockReturnValue(agencyQuery(null));
    const active = paidCall({ status: "accepted", lastBilledAt: new Date(), startedAt: new Date() });
    VideoCall.findById
      .mockReturnValueOnce(mockQueryWithSession(active))
      .mockReturnValueOnce(mockQueryWithSession(active));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(active).mockResolvedValueOnce(null);
    User.findOneAndUpdate.mockResolvedValue({ _id: callerId });
    User.findByIdAndUpdate.mockResolvedValue({});
    VideoCall.findByIdAndUpdate.mockResolvedValue({});
    CoinTransaction.create.mockResolvedValue([]);

    await tickCall({ params: { id: callId }, userId: callerId }, makeRes());
    await tickCall({ params: { id: callId }, userId: callerId }, makeRes());

    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(CoinTransaction.create).toHaveBeenCalledTimes(1);
  });

  test("tick with insufficient balance does not go negative and ends the call", async () => {
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    AgencyRelationship.findOne.mockReturnValue(agencyQuery({ parentCreator: agencyId, percentage: 10 }));
    const active = paidCall({ status: "accepted", startedAt: new Date("2026-01-01T00:00:00Z") });
    active.save = jest.fn().mockResolvedValue(undefined);
    VideoCall.findById.mockReturnValueOnce(mockQueryWithSession(active));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(active);
    User.findOneAndUpdate.mockResolvedValueOnce(null);

    const res = makeRes();
    await tickCall({ params: { id: callId }, userId: callerId }, res);

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: callerId, coins: { $gte: 100 } },
      { $inc: { coins: -100 } },
      expect.any(Object)
    );
    expect(active.status).toBe("ended");
    expect(res.status).toHaveBeenCalledWith(402);
    expect(CoinTransaction.create).not.toHaveBeenCalled();
  });

  test("failure inside accept transaction returns an error and creates no partial ledger after credit failure", async () => {
    const session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
    AgencyRelationship.findOne.mockReturnValue(agencyQuery(null));
    const accepted = paidCall({ status: "accepted" });
    VideoCall.findById
      .mockResolvedValueOnce(paidCall())
      .mockReturnValueOnce(mockQueryWithSession(paidCall()));
    VideoCall.findOneAndUpdate.mockResolvedValueOnce(accepted);
    User.findOneAndUpdate.mockResolvedValueOnce({ _id: callerId });
    User.findByIdAndUpdate.mockRejectedValueOnce(new Error("credit failed"));

    const res = makeRes();
    await respondCall({ params: { id: callId }, userId: creatorId, body: { action: "accept" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
  });
});
