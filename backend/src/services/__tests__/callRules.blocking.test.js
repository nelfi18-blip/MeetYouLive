const User = require("../../models/User.js");
const Like = require("../../models/Like.js");

const userId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

jest.mock("../../models/Like.js", () => ({
  exists: jest.fn(),
}));

const makeUserQuery = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value),
  })),
});

describe("call rules blocking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("detects unilateral blocks from the current user", async () => {
    const { hasUserBlockBetween } = require("../callRules.service.js");
    User.findById
      .mockReturnValueOnce(makeUserQuery({ blockedUsers: [otherUserId] }))
      .mockReturnValueOnce(makeUserQuery({ blockedUsers: [] }));

    await expect(hasUserBlockBetween(userId, otherUserId)).resolves.toBe(true);
  });

  test("detects mutual blocks", async () => {
    const { hasUserBlockBetween } = require("../callRules.service.js");
    User.findById
      .mockReturnValueOnce(makeUserQuery({ blockedUsers: [otherUserId] }))
      .mockReturnValueOnce(makeUserQuery({ blockedUsers: [userId] }));

    await expect(hasUserBlockBetween(userId, otherUserId)).resolves.toBe(true);
  });

  test("rejects social calls after a block even when likes are mutual", async () => {
    const { assertSocialCallAllowed } = require("../callRules.service.js");
    User.findById
      .mockReturnValueOnce(makeUserQuery({ blockedUsers: [] }))
      .mockReturnValueOnce(makeUserQuery({ blockedUsers: [userId] }));
    Like.exists.mockResolvedValue(true);

    await expect(assertSocialCallAllowed(userId, otherUserId)).rejects.toMatchObject({
      statusCode: 403,
      message: "No puedes interactuar con este usuario",
    });
    expect(Like.exists).not.toHaveBeenCalled();
  });
});
