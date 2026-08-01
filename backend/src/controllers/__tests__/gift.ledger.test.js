"use strict";

const mongoose = require("mongoose");

jest.mock("../../models/Gift.js", () => ({
  create: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock("../../models/GiftCatalog.js", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../models/Live.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock("../../models/User.js", () => ({
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  exists: jest.fn(),
}));
jest.mock("../../models/CoinTransaction.js", () => ({
  create: jest.fn(),
}));
jest.mock("../../models/AgencyRelationship.js", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../lib/socket.js", () => ({
  getIO: jest.fn(),
}));
jest.mock("../../services/missions.service.js", () => ({
  trackEvent: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../services/notification.service.js", () => ({
  createNotification: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../services/progression.service.js", () => ({
  unlockAchievement: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../services/analytics.service.js", () => ({
  trackAnalyticsEvent: jest.fn(),
}));

const Gift = require("../../models/Gift.js");
const GiftCatalog = require("../../models/GiftCatalog.js");
const Live = require("../../models/Live.js");
const User = require("../../models/User.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const AgencyRelationship = require("../../models/AgencyRelationship.js");
const { sendGift } = require("../gift.controller.js");

const senderId = "507f1f77bcf86cd799439011";
const receiverId = "507f1f77bcf86cd799439012";
const giftId = "507f1f77bcf86cd799439013";
const liveId = "507f1f77bcf86cd799439014";

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

function selectQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

function makeGiftDoc() {
  return {
    _id: "507f1f77bcf86cd799439015",
    sender: senderId,
    receiver: receiverId,
    populate: jest.fn(async function populate(field) {
      if (field === "sender") this.sender = { username: "sender" };
      if (field === "giftCatalogItem") {
        this.giftCatalogItem = { name: "Rose", icon: "🌹", coinCost: 100, rarity: "common" };
      }
      return this;
    }),
  };
}

function makeReq(context, overrides = {}) {
  return {
    userId: senderId,
    body: {
      receiverId,
      giftSlug: "rose",
      quantity: 1,
      context,
      contextId: context === "live" ? liveId : null,
      ...overrides,
    },
  };
}

describe("sendGift coin transaction ledger", () => {
  let session;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    session = makeSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session);

    GiftCatalog.findOne.mockResolvedValue({
      _id: giftId,
      slug: "rose",
      name: "Rose",
      icon: "🌹",
      coinCost: 100,
      rarity: "common",
      category: "emotional",
      type: "basic",
      isSuper: false,
    });
    Gift.create.mockResolvedValue([makeGiftDoc()]);
    Gift.aggregate.mockResolvedValue([]);
    Live.findOne.mockReturnValue(selectQuery({ _id: liveId, giftsEnabled: true }));
    Live.findOneAndUpdate.mockResolvedValue(null);
    Live.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    Live.findByIdAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.findOneAndUpdate.mockResolvedValue({ _id: senderId, coins: 900 });
    User.findByIdAndUpdate.mockResolvedValue({ topGifts: [] });
    User.exists.mockReturnValue(sessionQuery(true));
    AgencyRelationship.findOne.mockReturnValue(sessionQuery(null));
    CoinTransaction.create.mockResolvedValue([]);
  });

  test.each(["live", "private_call", "profile"])(
    "%s gifts record gift_sent and gift_received with ordered transaction create",
    async (context) => {
      User.findById.mockReturnValue(sessionQuery({
        _id: receiverId,
        role: "creator",
        creatorStatus: "approved",
      }));

      const res = makeRes();
      await sendGift(makeReq(context), res);

      expect(CoinTransaction.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({ userId: senderId, type: "gift_sent", amount: -100 }),
          expect.objectContaining({ userId: receiverId, type: "gift_received", amount: 60 }),
        ],
        { session, ordered: true }
      );
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
    }
  );

  test("non-earning receiver records a single gift_sent document with ordered transaction create", async () => {
    User.findById.mockReturnValue(sessionQuery({
      _id: receiverId,
      role: "user",
      creatorStatus: "none",
    }));

    const res = makeRes();
    await sendGift(makeReq("profile"), res);

    expect(CoinTransaction.create).toHaveBeenCalledWith(
      [expect.objectContaining({ userId: senderId, type: "gift_sent", amount: -100 })],
      { session, ordered: true }
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("ledger failure aborts before success response or post-transaction side effects", async () => {
    User.findById.mockReturnValue(sessionQuery({
      _id: receiverId,
      role: "creator",
      creatorStatus: "approved",
    }));
    CoinTransaction.create.mockRejectedValueOnce(new Error("ledger failed"));

    const res = makeRes();
    await sendGift(makeReq("live"), res);

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(CoinTransaction.create).toHaveBeenCalledWith(expect.any(Array), { session, ordered: true });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "ledger failed" });
    expect(Gift.aggregate).not.toHaveBeenCalled();
  });
});
