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
        lean: jest.fn().mockResolvedValue({ pushRateLimit: { count: 0, date: null } }),
      }),
    });
    mockUpdateOne.mockResolvedValue({});
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

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: "507f1f77bcf86cd799439012" },
      { $set: { pushToken: null } }
    );
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(invalidRegistrationValue);
    consoleSpy.mockRestore();
  });
});
