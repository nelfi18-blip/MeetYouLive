const User = require("../../models/User.js");
const Like = require("../../models/Like.js");
const Dislike = require("../../models/Dislike.js");
const callRules = require("../../services/callRules.service.js");
const compatibility = require("../../services/compatibility.service.js");
const { getIO } = require("../../lib/socket.js");
const { queueEvent } = require("../../services/push.service.js");
const { createNotification } = require("../../services/notification.service.js");

const currentUserId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

jest.mock("../../models/Like.js", () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  deleteOne: jest.fn(),
}));
jest.mock("../../models/Dislike.js", () => ({
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
}));

jest.mock("../../models/Chat.js", () => ({}));
jest.mock("../../models/CoinTransaction.js", () => ({}));
jest.mock("../../models/CrushTransaction.js", () => ({}));
jest.mock("../../models/AgencyRelationship.js", () => ({}));
jest.mock("../../services/agency.service.js", () => ({ calculateSplit: jest.fn() }));
jest.mock("../../services/compatibility.service.js", () => ({ calculateCompatibility: jest.fn() }));
jest.mock("../../lib/socket.js", () => ({ getIO: jest.fn() }));
jest.mock("../../services/push.service.js", () => ({ queueEvent: jest.fn() }));
jest.mock("../../services/notification.service.js", () => ({ createNotification: jest.fn(() => Promise.resolve()) }));
jest.mock("../../services/missions.service.js", () => ({ trackEvent: jest.fn() }));
jest.mock("../../lib/photoFields.js", () => ({ withSerializedUserPhotoFields: (_req, user) => user }));
jest.mock("../../services/callRules.service.js", () => ({
  hasUserBlockBetween: jest.fn(),
}));

const { likeUser, unlikeUser, checkMatch, getMatches, getLikesReceived } = require("../match.controller.js");

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(),
  };
  return res;
};

const makeUserQuery = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value),
  })),
});

const makeSelectQuery = (value) => ({
  select: jest.fn().mockResolvedValue(value),
});

const makePopulateQuery = (value) => ({
  populate: jest.fn().mockResolvedValue(value),
});
const makeIncomingLikesQuery = (value) => ({
  populate: jest.fn(() => ({
    sort: jest.fn().mockResolvedValue(value),
  })),
});
const flushBackgroundTasks = () => new Promise((resolve) => setImmediate(resolve));

const makeLikedUser = (overrides = {}) => ({
  _id: otherUserId,
  username: "liker",
  role: "user",
  blockedUsers: [],
  toObject() {
    const { toObject, ...data } = this;
    return { ...data };
  },
  ...overrides,
});

const makeIncomingLike = (from, overrides = {}) => ({
  _id: "507f1f77bcf86cd799439099",
  from,
  revealed: true,
  crushType: "standard",
  ...overrides,
});

describe("match blocking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue(makeUserQuery({ _id: otherUserId, isBlocked: false, isSuspended: false }));
  });

  test("rejects likes after a block", async () => {
    callRules.hasUserBlockBetween.mockResolvedValue(true);
    const res = makeRes();

    await likeUser({ userId: currentUserId, params: { userId: otherUserId } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "No puedes hacer match con este usuario" });
    expect(Like.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("standard like notifications keep liker identity locked", async () => {
    const emit = jest.fn();
    getIO.mockReturnValue({ to: jest.fn(() => ({ emit })) });
    callRules.hasUserBlockBetween.mockResolvedValue(false);
    User.findById
      .mockReturnValueOnce(makeUserQuery({ _id: otherUserId, isBlocked: false, isSuspended: false }))
      .mockReturnValueOnce(makeUserQuery({ _id: otherUserId }));
    Like.findOne.mockResolvedValue(null);
    Like.findOneAndUpdate.mockResolvedValue({});
    const res = makeRes();

    await likeUser({ userId: currentUserId, params: { userId: otherUserId } }, res);
    await flushBackgroundTasks();

    expect(emit).toHaveBeenCalledWith("CRUSH_RECEIVED", {
      crushType: "standard",
      locked: true,
    });

    test("pass persists a dislike and undo removes the persisted dislike", async () => {
      callRules.hasUserBlockBetween.mockResolvedValue(false);
      Dislike.updateOne.mockResolvedValue({ upsertedCount: 1 });
      Dislike.deleteOne.mockResolvedValue({ deletedCount: 1 });
      Like.deleteOne.mockResolvedValue({ deletedCount: 0 });
      const passRes = makeRes();

      await unlikeUser(
        { userId: currentUserId, params: { userId: otherUserId }, query: { action: "dislike" } },
        passRes
      );

      expect(Dislike.updateOne).toHaveBeenCalledWith(
        { from: currentUserId, to: otherUserId },
        { $setOnInsert: { from: currentUserId, to: otherUserId } },
        { upsert: true }
      );
      expect(passRes.json).toHaveBeenCalledWith({ success: true, match: false, message: "Perfil descartado" });

      const undoRes = makeRes();
      await unlikeUser({ userId: currentUserId, params: { userId: otherUserId }, query: {} }, undoRes);

      expect(Like.deleteOne).toHaveBeenCalledWith({ from: currentUserId, to: otherUserId });
      expect(Dislike.deleteOne).toHaveBeenCalledWith({ from: currentUserId, to: otherUserId });
      expect(undoRes.json).toHaveBeenCalledWith({ success: true, match: false, message: "Like removido" });
    });
    expect(createNotification).toHaveBeenCalledWith(otherUserId, expect.objectContaining({
      title: "💖 Alguien te dio like",
      message: expect.not.stringContaining("match"),
    }));
    expect(queueEvent).toHaveBeenCalledWith(
      otherUserId,
      "like",
      expect.objectContaining({
        title: "💖 Alguien te dio like",
        body: expect.not.stringContaining("match"),
      }),
      expect.objectContaining({ fromUserId: currentUserId })
    );
  });

  test("reports no match after a block", async () => {
    callRules.hasUserBlockBetween.mockResolvedValue(true);
    const res = makeRes();

    await checkMatch({ userId: currentUserId, params: { userId: otherUserId } }, res);

    expect(res.json).toHaveBeenCalledWith({ iLiked: false, theyLiked: false, match: false, blocked: true });
    expect(Like.findOne).not.toHaveBeenCalled();
  });

  test("hides a historical mutual match after a block", async () => {
    const matchedUser = {
      _id: otherUserId,
      username: "match",
      interests: ["music"],
      intent: "dating",
      blockedUsers: [],
      toObject() {
        return { ...this };
      },
    };
    User.findById.mockReturnValue(makeSelectQuery({ interests: ["music"], intent: "dating", blockedUsers: [otherUserId] }));
    Like.find
      .mockReturnValueOnce(makeSelectQuery([{ to: otherUserId }]))
      .mockReturnValueOnce(makePopulateQuery([{ from: matchedUser }]));
    const res = makeRes();

    await getMatches({ userId: currentUserId }, res);

    expect(res.json).toHaveBeenCalledWith({ matches: [] });
    expect(compatibility.calculateCompatibility).not.toHaveBeenCalled();
  });

  test("does not expose block lists in visible matches response", async () => {
    const matchedUser = {
      _id: otherUserId,
      username: "match",
      interests: ["music"],
      intent: "dating",
      blockedUsers: [],
      toObject() {
        return { ...this };
      },
    };
    User.findById.mockReturnValue(makeSelectQuery({ interests: ["music"], intent: "dating", blockedUsers: [] }));
    Like.find
      .mockReturnValueOnce(makeSelectQuery([{ to: otherUserId }]))
      .mockReturnValueOnce(makePopulateQuery([{ from: matchedUser }]));
    compatibility.calculateCompatibility.mockReturnValue({ compatibilityScore: 100, sharedInterests: ["music"] });
    const res = makeRes();

    await getMatches({ userId: currentUserId }, res);

    expect(res.json).toHaveBeenCalledWith({
      matches: [
        expect.not.objectContaining({
          blockedUsers: expect.anything(),
        }),
      ],
    });
  });

  test("keeps normal received likes visible", async () => {
    const revealedUser = makeLikedUser();
    const lockedUser = makeLikedUser({ _id: "507f1f77bcf86cd799439013", username: "locked" });
    User.findById.mockReturnValue(makeSelectQuery({ blockedUsers: [] }));
    Like.find
      .mockReturnValueOnce(makeSelectQuery([]))
      .mockReturnValueOnce(makeIncomingLikesQuery([
        makeIncomingLike(revealedUser),
        makeIncomingLike(lockedUser, {
          _id: "507f1f77bcf86cd799439098",
          revealed: false,
          crushType: "super_crush",
        }),
      ]));
    const res = makeRes();

    await getLikesReceived({ userId: currentUserId }, res);

    expect(res.json).toHaveBeenCalledWith({
      revealed: [
        {
          likeId: "507f1f77bcf86cd799439099",
          user: expect.not.objectContaining({ blockedUsers: expect.anything() }),
          crushType: "standard",
        },
      ],
      locked: [
        {
          likeId: "507f1f77bcf86cd799439098",
          crushType: "super_crush",
        },
      ],
      lockedCount: 1,
      unlockPrice: 50,
    });
  });

  test("hides received likes from users blocked by the viewer", async () => {
    User.findById.mockReturnValue(makeSelectQuery({ blockedUsers: [otherUserId] }));
    Like.find
      .mockReturnValueOnce(makeSelectQuery([]))
      .mockReturnValueOnce(makeIncomingLikesQuery([makeIncomingLike(makeLikedUser())]));
    const res = makeRes();

    await getLikesReceived({ userId: currentUserId }, res);

    expect(res.json).toHaveBeenCalledWith({
      revealed: [],
      locked: [],
      lockedCount: 0,
      unlockPrice: 50,
    });
  });

  test("hides received likes from users who blocked the viewer", async () => {
    User.findById.mockReturnValue(makeSelectQuery({ blockedUsers: [] }));
    Like.find
      .mockReturnValueOnce(makeSelectQuery([]))
      .mockReturnValueOnce(makeIncomingLikesQuery([
        makeIncomingLike(makeLikedUser({ blockedUsers: [currentUserId] })),
      ]));
    const res = makeRes();

    await getLikesReceived({ userId: currentUserId }, res);

    expect(res.json).toHaveBeenCalledWith({
      revealed: [],
      locked: [],
      lockedCount: 0,
      unlockPrice: 50,
    });
  });

  test("hides received likes when both users blocked each other", async () => {
    User.findById.mockReturnValue(makeSelectQuery({ blockedUsers: [otherUserId] }));
    Like.find
      .mockReturnValueOnce(makeSelectQuery([]))
      .mockReturnValueOnce(makeIncomingLikesQuery([
        makeIncomingLike(makeLikedUser({ blockedUsers: [currentUserId] })),
      ]));
    const res = makeRes();

    await getLikesReceived({ userId: currentUserId }, res);

    expect(res.json).toHaveBeenCalledWith({
      revealed: [],
      locked: [],
      lockedCount: 0,
      unlockPrice: 50,
    });
  });
});
