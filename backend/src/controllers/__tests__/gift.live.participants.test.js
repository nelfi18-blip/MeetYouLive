"use strict";

// Multi-Guest gift targeting — backend security tests.
//
// For live gifts, the backend must never trust the client-supplied receiverId
// blindly: it must load the Live, require it to exist/be active, require
// giftsEnabled, and require the receiver to be either the live host or a
// currently ACTIVE Multi-Guest participant — all BEFORE any coins move.

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
const hostId = "507f1f77bcf86cd799439012";
const activeGuestId = "507f1f77bcf86cd799439016";
const disconnectedGuestId = "507f1f77bcf86cd799439017";
const pendingRequesterId = "507f1f77bcf86cd799439018";
const outsiderId = "507f1f77bcf86cd799439019";
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

function makeGiftDoc(receiverId) {
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

function makeReq(receiverId, overrides = {}) {
  return {
    userId: senderId,
    body: {
      receiverId,
      giftSlug: "rose",
      quantity: 1,
      context: "live",
      contextId: liveId,
      ...overrides,
    },
  };
}

describe("sendGift — Multi-Guest live participant targeting", () => {
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
    Gift.aggregate.mockResolvedValue([]);
    Live.findOneAndUpdate.mockResolvedValue(null);
    Live.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    Live.findByIdAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.findOneAndUpdate.mockResolvedValue({ _id: senderId, coins: 900 });
    User.findByIdAndUpdate.mockResolvedValue({ topGifts: [] });
    User.exists.mockReturnValue(sessionQuery(true));
    AgencyRelationship.findOne.mockReturnValue(sessionQuery(null));
    CoinTransaction.create.mockResolvedValue([]);
  });

  const liveDoc = (overrides = {}) => ({
    _id: liveId,
    giftsEnabled: true,
    user: hostId,
    guests: [
      { userId: activeGuestId, status: "active" },
      { userId: disconnectedGuestId, status: "disconnected" },
    ],
    ...overrides,
  });

  test("1. gift to the live host is permitted", async () => {
    Live.findOne.mockReturnValue(selectQuery(liveDoc()));
    User.findById.mockReturnValue(sessionQuery({ _id: hostId, role: "creator", creatorStatus: "approved" }));
    Gift.create.mockResolvedValue([makeGiftDoc(hostId)]);

    const res = makeRes();
    await sendGift(makeReq(hostId), res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("2. gift to an ACTIVE guest is permitted", async () => {
    Live.findOne.mockReturnValue(selectQuery(liveDoc()));
    User.findById.mockReturnValue(sessionQuery({ _id: activeGuestId, role: "creator", creatorStatus: "approved" }));
    Gift.create.mockResolvedValue([makeGiftDoc(activeGuestId)]);

    const res = makeRes();
    await sendGift(makeReq(activeGuestId), res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("3. gift to a DISCONNECTED guest is rejected before any coin transfer", async () => {
    Live.findOne.mockReturnValue(selectQuery(liveDoc()));

    const res = makeRes();
    await sendGift(makeReq(disconnectedGuestId), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Gift.create).not.toHaveBeenCalled();
  });

  test("4. gift to a user unrelated to the live is rejected", async () => {
    Live.findOne.mockReturnValue(selectQuery(liveDoc()));

    const res = makeRes();
    await sendGift(makeReq(outsiderId), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Gift.create).not.toHaveBeenCalled();
  });

  test("5. gift to a pending guestRequest (never added to guests[]) is rejected", async () => {
    // Pending guestRequests never appear in `live.guests`, so this is
    // equivalent to gifting an outsider from the receiver-validation POV.
    Live.findOne.mockReturnValue(selectQuery(liveDoc()));

    const res = makeRes();
    await sendGift(makeReq(pendingRequesterId), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(Gift.create).not.toHaveBeenCalled();
  });

  test("6. inexistent/inactive live is rejected safely", async () => {
    Live.findOne.mockReturnValue(selectQuery(null));

    const res = makeRes();
    await sendGift(makeReq(hostId), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Gift.create).not.toHaveBeenCalled();
  });

  test("7. giftsEnabled=false rejects even a valid host receiver", async () => {
    Live.findOne.mockReturnValue(selectQuery(liveDoc({ giftsEnabled: false })));

    const res = makeRes();
    await sendGift(makeReq(hostId), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(Gift.create).not.toHaveBeenCalled();
  });

  test("8. self-gift is still rejected even when the sender is the host", async () => {
    const res = makeRes();
    await sendGift(makeReq(senderId, { receiverId: senderId }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Live.findOne).not.toHaveBeenCalled();
    expect(Gift.create).not.toHaveBeenCalled();
  });

  test("9. an approved creator receiving as an active guest still earns per existing economy rules", async () => {
    Live.findOne.mockReturnValue(selectQuery(liveDoc()));
    User.findById.mockReturnValue(sessionQuery({ _id: activeGuestId, role: "creator", creatorStatus: "approved" }));
    Gift.create.mockResolvedValue([makeGiftDoc(activeGuestId)]);

    const res = makeRes();
    await sendGift(makeReq(activeGuestId), res);

    // 100 coins, 40% platform commission => 60 creatorNetShare, no agency.
    expect(CoinTransaction.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({ userId: senderId, type: "gift_sent", amount: -100 }),
        expect.objectContaining({ userId: activeGuestId, type: "gift_received", amount: 60 }),
      ],
      { session, ordered: true }
    );
    const earningsCall = User.findByIdAndUpdate.mock.calls.find(
      (call) => call[1] && call[1].$inc && call[1].$inc.earningsCoins !== undefined
    );
    expect(earningsCall).toBeDefined();
    expect(String(earningsCall[0])).toBe(activeGuestId);
    expect(earningsCall[1]).toEqual({ $inc: { earningsCoins: 60 } });
  });

  test("10. split/economy for a guest receiver matches the unchanged platform/creator rules (no agency)", async () => {
    Live.findOne.mockReturnValue(selectQuery(liveDoc()));
    User.findById.mockReturnValue(sessionQuery({ _id: activeGuestId, role: "creator", creatorStatus: "approved" }));
    Gift.create.mockResolvedValue([makeGiftDoc(activeGuestId)]);

    const res = makeRes();
    await sendGift(makeReq(activeGuestId), res);

    expect(Gift.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          coinCost: 100,
          creatorShare: 60,
          platformShare: 40,
          agencyShare: 0,
        }),
      ],
      { session }
    );
  });
});
