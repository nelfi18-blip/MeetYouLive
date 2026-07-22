"use strict";

const mongoose = require("mongoose");

jest.mock("../../models/Live.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  exists: jest.fn(),
}));

jest.mock("../../models/Gift.js", () => ({}));
jest.mock("../../models/CoinTransaction.js", () => ({
  create: jest.fn(),
}));
jest.mock("../../models/AgencyRelationship.js", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../lib/socket.js", () => ({
  getIO: jest.fn(),
  hasLiveHost: jest.fn(),
  getLiveEvent: jest.fn(),
  setLiveEvent: jest.fn(),
  clearLiveEvent: jest.fn(),
  clearAllEventsForLive: jest.fn(),
  removeLiveUserFromRoom: jest.fn(),
}));
jest.mock("../../lib/fcm.js", () => ({ sendMulticastPush: jest.fn() }));
jest.mock("../../services/missions.service.js", () => ({ trackEvent: jest.fn(() => Promise.resolve()) }));
jest.mock("../../services/notification.service.js", () => ({ createBulkNotifications: jest.fn() }));
jest.mock("../../services/analytics.service.js", () => ({ trackAnalyticsEvent: jest.fn() }));
jest.mock("../../services/live.service.js", () => ({
  isLiveActuallyActive: jest.fn(() => true),
  cleanupStaleLives: jest.fn(),
  markLiveAsEnded: jest.fn(),
  filterActiveLives: jest.fn(),
}));

const Live = require("../../models/Live.js");
const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const AgencyRelationship = require("../../models/AgencyRelationship.js");
const { joinLive } = require("../live.controller.js");

const liveId = "507f1f77bcf86cd799439013";
const viewerId = "507f1f77bcf86cd799439012";
const creatorId = "507f1f77bcf86cd799439011";
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

function sessionQuery(value) {
  return { session: jest.fn().mockResolvedValue(value) };
}

function makeLive(overrides = {}) {
  return {
    _id: liveId,
    user: creatorId,
    isLive: true,
    isPrivate: true,
    entryCost: 100,
    paidViewers: [],
    bannedUsers: [],
    toObject() {
      return {
        _id: this._id,
        user: this.user,
        isLive: this.isLive,
        isPrivate: this.isPrivate,
        entryCost: this.entryCost,
        paidViewers: this.paidViewers,
        bannedUsers: this.bannedUsers,
      };
    },
    ...overrides,
  };
}

function mockNoAgency() {
  AgencyRelationship.findOne.mockReturnValue(sessionQuery(null));
}

describe("joinLive private live billing", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(makeSession());
    mockNoAgency();
    User.findOneAndUpdate.mockResolvedValue({ _id: viewerId, coins: 0 });
    User.findByIdAndUpdate.mockResolvedValue({});
    User.exists.mockReturnValue(sessionQuery(true));
    CoinTransaction.create.mockResolvedValue([]);
  });

  test("charges a private live entry atomically and records room_entry transactions with platform split", async () => {
    const initialLive = makeLive();
    const joinedLive = makeLive({ paidViewers: [viewerId] });
    Live.findOne.mockResolvedValueOnce(initialLive);
    Live.findOneAndUpdate.mockResolvedValueOnce(joinedLive);

    const res = makeRes();
    await joinLive({ params: { id: liveId }, userId: viewerId }, res);

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: viewerId, coins: { $gte: 100 } },
      { $inc: { coins: -100 } },
      expect.objectContaining({ new: true, select: "_id coins" })
    );
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      creatorId,
      { $inc: { earningsCoins: 60 } },
      expect.any(Object)
    );
    expect(CoinTransaction.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: viewerId,
          type: "room_entry",
          amount: -100,
          metadata: expect.objectContaining({
            liveId,
            platformShare: 40,
            creatorNetShare: 60,
            idempotencyKey: `${liveId}:room-entry:${viewerId}:viewer`,
          }),
        }),
        expect.objectContaining({
          userId: creatorId,
          type: "room_entry",
          amount: 60,
          metadata: expect.objectContaining({
            liveId,
            idempotencyKey: `${liveId}:room-entry:${viewerId}:creator`,
          }),
        }),
      ]),
      expect.any(Object)
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ hasAccess: true }));
    expect(res.json.mock.calls[0][0]).not.toHaveProperty("paidViewers");
  });

  test("applies active agreed agency commission only to the creator share", async () => {
    AgencyRelationship.findOne.mockReturnValue(sessionQuery({
      parentCreator: agencyId,
      percentage: 10,
    }));
    Live.findOne.mockResolvedValueOnce(makeLive());
    Live.findOneAndUpdate.mockResolvedValueOnce(makeLive({ paidViewers: [viewerId] }));

    await joinLive({ params: { id: liveId }, userId: viewerId }, makeRes());

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      creatorId,
      { $inc: { earningsCoins: 54 } },
      expect.any(Object)
    );
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      agencyId,
      { $inc: { agencyEarningsCoins: 6, totalAgencyGeneratedCoins: 100 } },
      expect.any(Object)
    );
    expect(CoinTransaction.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: agencyId, type: "agency_earned", amount: 6 }),
      ]),
      expect.any(Object)
    );
  });

  test("already paid viewers can rejoin without duplicate billing", async () => {
    Live.findOne.mockResolvedValueOnce(makeLive({ paidViewers: [viewerId] }));

    await joinLive({ params: { id: liveId }, userId: viewerId }, makeRes());

    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
  });

  test("a concurrent duplicate join that already gained access skips duplicate billing", async () => {
    Live.findOne
      .mockResolvedValueOnce(makeLive())
      .mockReturnValueOnce(sessionQuery(makeLive({ paidViewers: [viewerId] })));
    Live.findOneAndUpdate.mockResolvedValueOnce(null);

    const res = makeRes();
    await joinLive({ params: { id: liveId }, userId: viewerId }, res);

    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ hasAccess: true }));
  });

  test("insufficient coins do not credit creator or create ledger entries", async () => {
    Live.findOne.mockResolvedValueOnce(makeLive());
    Live.findOneAndUpdate.mockResolvedValueOnce(makeLive({ paidViewers: [viewerId] }));
    User.findOneAndUpdate.mockResolvedValueOnce(null);

    const res = makeRes();
    await joinLive({ params: { id: liveId }, userId: viewerId }, res);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(CoinTransaction.create).not.toHaveBeenCalled();
  });
});
