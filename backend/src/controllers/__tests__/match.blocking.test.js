const User = require("../../models/User.js");
const Like = require("../../models/Like.js");
const callRules = require("../../services/callRules.service.js");
const compatibility = require("../../services/compatibility.service.js");

const currentUserId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

jest.mock("../../models/Like.js", () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock("../../models/Chat.js", () => ({}));
jest.mock("../../models/CoinTransaction.js", () => ({}));
jest.mock("../../models/CrushTransaction.js", () => ({}));
jest.mock("../../models/AgencyRelationship.js", () => ({}));
jest.mock("../../services/agency.service.js", () => ({ calculateSplit: jest.fn() }));
jest.mock("../../services/compatibility.service.js", () => ({ calculateCompatibility: jest.fn() }));
jest.mock("../../lib/socket.js", () => ({ getIO: jest.fn() }));
jest.mock("../../services/push.service.js", () => ({ queueEvent: jest.fn() }));
jest.mock("../../services/missions.service.js", () => ({ trackEvent: jest.fn() }));
jest.mock("../../lib/photoFields.js", () => ({ withSerializedUserPhotoFields: (_req, user) => user }));
jest.mock("../../services/callRules.service.js", () => ({
  hasUserBlockBetween: jest.fn(),
}));

const { likeUser, checkMatch, getMatches } = require("../match.controller.js");

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

  test("reports no match after a block", async () => {
    callRules.hasUserBlockBetween.mockResolvedValue(true);
    const res = makeRes();

    await checkMatch({ userId: currentUserId, params: { userId: otherUserId } }, res);

    expect(res.json).toHaveBeenCalledWith({ iLiked: false, theyLiked: false, match: false, blocked: true });
    expect(Like.findOne).not.toHaveBeenCalled();
  });

  test("does not expose block lists in matches response", async () => {
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
});
