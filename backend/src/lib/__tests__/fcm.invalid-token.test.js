const mockUpdateOne = jest.fn();
const mockFindById = jest.fn();
const mockSend = jest.fn();

jest.mock("../../models/User.js", () => ({
  findById: mockFindById,
  updateOne: mockUpdateOne,
}));

jest.mock("firebase-admin", () => ({
  apps: [],
  credential: { cert: jest.fn((value) => value) },
  initializeApp: jest.fn(() => ({ name: "test" })),
  messaging: jest.fn(() => ({ send: mockSend })),
}));

describe("FCM token handling", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.FCM_PROJECT_ID = "project";
    process.env.FCM_CLIENT_EMAIL = "client@example.test";
    process.env.FCM_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
    mockFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ pushRateLimit: { count: 0, date: null }, pushTokens: [] }),
      }),
    });
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  afterEach(() => {
    delete process.env.FCM_PROJECT_ID;
    delete process.env.FCM_CLIENT_EMAIL;
    delete process.env.FCM_PRIVATE_KEY;
  });

  test("24. invalid FCM token is cleared without logging the token value", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockSend.mockRejectedValueOnce(Object.assign(new Error("invalid registration"), {
      code: "messaging/invalid-registration-token",
    }));
    const { sendPush } = require("../fcm.js");

    const invalidRegistrationValue = "invalid-registration-value";
    await sendPush("507f1f77bcf86cd799439012", invalidRegistrationValue, "Title", "Body", { link: "/x" });

    expect(mockUpdateOne).toHaveBeenNthCalledWith(
      2,
      { _id: "507f1f77bcf86cd799439012" },
      { $pull: { pushTokens: { token: invalidRegistrationValue } } }
    );
    expect(mockUpdateOne).toHaveBeenNthCalledWith(
      3,
      { _id: "507f1f77bcf86cd799439012", pushToken: invalidRegistrationValue },
      {
        $unset: { pushToken: "", pushTokenPlatform: "", pushTokenDeviceId: "" },
        $set: { pushTokenPermissionStatus: null },
      }
    );
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(invalidRegistrationValue);
    consoleSpy.mockRestore();
  });

  test("sends one push to each registered device token", async () => {
    mockFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          pushRateLimit: { count: 0, date: null },
          pushToken: "legacy-token",
          pushTokens: [
            { token: "legacy-token", platform: "web" },
            { token: "android-token", platform: "android" },
          ],
        }),
      }),
    });
    mockSend.mockResolvedValue({});
    const { sendPush } = require("../fcm.js");

    const result = await sendPush("507f1f77bcf86cd799439012", "legacy-token", "Title", "Body", {
      link: "/chats/1",
      type: "message",
    });
    expect(result).toMatchObject({ accepted: 2, attempted: 2, rejected: 0, status: "accepted" });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls.map(([message]) => message.token).sort()).toEqual([
      "android-token",
      "legacy-token",
    ]);
    expect(mockSend.mock.calls[0][0].android.notification.channelId).toBe("messages");
  }); 
  test("FCM rejection is never reported as accepted", async () => {
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    mockSend.mockRejectedValueOnce(Object.assign(new Error("rejected"), { code: "messaging/unavailable" }));
    const { sendPush } = require("../fcm.js");

    const result = await sendPush("507f1f77bcf86cd799439012", "phone-token", "Title", "Body", { type: "message" });
    expect(result).toMatchObject({ accepted: 0, attempted: 1, rejected: 1, status: "rejected" });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("phone-token");
    errorLog.mockRestore();
  });

  test("one successful device is accepted even if a second token fails", async () => {
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          pushRateLimit: { count: 0, date: null },
          pushToken: "good-token",
          pushTokens: [{ token: "bad-token" }],
        }),
      }),
    });
    mockSend.mockResolvedValueOnce("projects/test/messages/1").mockRejectedValueOnce(
      Object.assign(new Error("failed"), { code: "messaging/unavailable" })
    );
    const { sendPush } = require("../fcm.js");
    const result = await sendPush("507f1f77bcf86cd799439012", "good-token", "Title", "Body", { type: "message" });
    expect(result).toMatchObject({ accepted: 1, attempted: 2, rejected: 1, status: "accepted" });
    errorLog.mockRestore();
  });

  test("unconfigured FCM is skipped, not falsely marked delivered", async () => {
    delete process.env.FCM_PROJECT_ID;
    const { sendPush } = require("../fcm.js");
    const result = await sendPush("507f1f77bcf86cd799439012", "phone-token", "Title", "Body");
    expect(result).toMatchObject({ accepted: 0, attempted: 0, status: "skipped", reason: "fcm_unavailable" });
    expect(mockSend).not.toHaveBeenCalled();
  });

});
