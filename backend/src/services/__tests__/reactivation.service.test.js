const mockSelect = jest.fn();

jest.mock("../../models/User.js", () => ({
  find: jest.fn(() => ({ select: mockSelect })),
  updateOne: jest.fn(),
}));

jest.mock("../../models/Like.js", () => ({
  countDocuments: jest.fn(),
}));

jest.mock("../../models/Chat.js", () => ({
  countDocuments: jest.fn(),
}));

jest.mock("../email.service.js", () => ({
  sendReactivationEmail: jest.fn(),
}));

jest.mock("../push.service.js", () => ({
  queueEvent: jest.fn(),
}));

const User = require("../../models/User.js");
const Like = require("../../models/Like.js");
const Chat = require("../../models/Chat.js");
const { sendReactivationEmail } = require("../email.service.js");
const { queueEvent } = require("../push.service.js");
const { runReactivationJob } = require("../reactivation.service.js");

describe("reactivation.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockResolvedValue([]);
    Like.countDocuments.mockResolvedValue(0);
    Chat.countDocuments.mockResolvedValue(0);
    sendReactivationEmail.mockResolvedValue({ messageId: "reactivation-test" });
    queueEvent.mockResolvedValue();
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("excludes admin users from reactivation email candidates", async () => {
    await runReactivationJob();

    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({
      role: { $ne: "admin" },
    }));
    expect(sendReactivationEmail).not.toHaveBeenCalled();
  });

  it("still sends reactivation emails to eligible user, creator, and subCreator accounts", async () => {
    const lastActiveAt = new Date(Date.now() - (25 * 60 * 60 * 1000));
    mockSelect.mockResolvedValue([
      { _id: "user-id", email: "user@example.com", username: "normal", lastActiveAt, reactivation: {} },
      { _id: "creator-id", email: "creator@example.com", username: "creator", lastActiveAt, reactivation: {} },
      { _id: "subcreator-id", email: "sub@example.com", username: "sub", lastActiveAt, reactivation: {} },
    ]);

    await runReactivationJob();

    expect(sendReactivationEmail).toHaveBeenCalledTimes(3);
    expect(sendReactivationEmail).toHaveBeenNthCalledWith(1, "user@example.com", "normal", 1, 0, 0);
    expect(sendReactivationEmail).toHaveBeenNthCalledWith(2, "creator@example.com", "creator", 1, 0, 0);
    expect(sendReactivationEmail).toHaveBeenNthCalledWith(3, "sub@example.com", "sub", 1, 0, 0);
    expect(User.updateOne).toHaveBeenCalledTimes(3);
  });
});
