jest.mock("../../models/Like.js", () => ({
  find: jest.fn(),
}));
jest.mock("../../models/Message.js", () => ({
  countDocuments: jest.fn(),
}));
jest.mock("../../models/VideoCall.js", () => ({
  countDocuments: jest.fn(),
}));
jest.mock("../../models/CoinTransaction.js", () => ({
  aggregate: jest.fn(),
}));

const Like = require("../../models/Like.js");
const Message = require("../../models/Message.js");
const VideoCall = require("../../models/VideoCall.js");
const CoinTransaction = require("../../models/CoinTransaction.js");
const { evaluateChatTrust, getMatchCreatedAt } = require("../chatTrust.service.js");

const userA = "507f1f77bcf86cd799439011";
const userB = "507f1f77bcf86cd799439012";
const chatId = "507f1f77bcf86cd799439013";
const chat = { _id: chatId, participants: [{ _id: userA }, { _id: userB }] };

const makeFindChain = (value) => ({
  select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
});

describe("chatTrust.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Like.find.mockReturnValue(makeFindChain([
      { from: userA, to: userB, createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
      { from: userB, to: userA, createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    ]));
    Message.countDocuments.mockResolvedValue(25);
    VideoCall.countDocuments.mockResolvedValue(1);
    CoinTransaction.aggregate.mockResolvedValue([{ total: 100 }]);
  });

  test("uses mutual Like timestamps instead of chat creation as match date", async () => {
    const matchDate = await getMatchCreatedAt(userA, userB);

    expect(matchDate).toBeInstanceOf(Date);
    expect(Like.find).toHaveBeenCalledWith({
      $or: [
        { from: userA, to: userB },
        { from: userB, to: userA },
      ],
    });
  });

  test("all mode requires every active condition", async () => {
    Message.countDocuments.mockResolvedValue(2);

    const result = await evaluateChatTrust({
      chat,
      chatId,
      senderId: userA,
      settings: {
        minimumDaysSinceMatch: 7,
        minimumMessages: 20,
        minimumCompletedCalls: 1,
        minimumCoinsSpent: 0,
        trustRuleMode: "all",
      },
    });

    expect(result.trusted).toBe(false);
    expect(result.checks.minimumMessages.scope).toBe("total_conversation");
  });

  test("any mode trusts when one active condition passes", async () => {
    Message.countDocuments.mockResolvedValue(2);
    VideoCall.countDocuments.mockResolvedValue(0);

    const result = await evaluateChatTrust({
      chat,
      chatId,
      senderId: userA,
      settings: {
        minimumDaysSinceMatch: 7,
        minimumMessages: 20,
        minimumCompletedCalls: 1,
        minimumCoinsSpent: 0,
        trustRuleMode: "any",
      },
    });

    expect(result.trusted).toBe(true);
    expect(result.checks.minimumDaysSinceMatch.passed).toBe(true);
  });
});
