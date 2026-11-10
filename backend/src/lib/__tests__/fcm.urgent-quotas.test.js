const mockFindById = jest.fn();
const mockUpdateOne = jest.fn();
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

const USER_ID = "507f1f77bcf86cd799439012";
const today = () => new Date();
const makeUser = (pushRateLimit = {}) => ({
  pushToken: "registered-android-token",
  pushTokens: [{ token: "registered-android-token", platform: "android" }],
  pushRateLimit,
});

function withUser(user) {
  mockFindById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(user),
    }),
  });
}

describe("urgent Android FCM delivery quotas and priority", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.FCM_PROJECT_ID = "test";
    process.env.FCM_CLIENT_EMAIL = "test@example.test";
    process.env.FCM_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
    mockSend.mockResolvedValue({});
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  afterEach(() => {
    delete process.env.FCM_PROJECT_ID;
    delete process.env.FCM_CLIENT_EMAIL;
    delete process.env.FCM_PRIVATE_KEY;
  });

  test("ordinary messages keep their existing eight-per-day limit", async () => {
    withUser(makeUser({ date: today(), count: 8 }));
    const { sendPush } = require("../fcm.js");
    await sendPush(USER_ID, "registered-android-token", "Message", "New message", { type: "new_message" });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  test("incoming call has its own quota and high-priority short-lived FCM notice", async () => {
    withUser(makeUser({ date: today(), count: 8 }));
    const { sendPush } = require("../fcm.js");
    await sendPush(USER_ID, "registered-android-token", "Llamada", "Alguien llama", { type: "call_incoming", link: "/call/abc" });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const outgoing = mockSend.mock.calls[0][0];
    expect(outgoing.android.priority).toBe("high");
    expect(outgoing.android.ttl).toBe(45 * 1000);
    expect(outgoing.android.notification.channelId).toBe("calls");
    expect(outgoing.data.link).toBe("/call/abc");
    expect(mockUpdateOne.mock.calls[0][1].$set).toEqual(expect.objectContaining({
      "pushRateLimit.incomingCallCount": 1,
    }));
  });

  test("Live has an independent bounded quota even after calls and general notices filled their quotas", async () => {
    withUser(makeUser({
      date: today(), count: 8,
      incomingCallDate: today(), incomingCallCount: 8,
    }));
    const { sendPush } = require("../fcm.js");
    await sendPush(USER_ID, "registered-android-token", "LIVE", "Creator is live", { type: "live", liveId: "abc", link: "/live/abc" });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const outgoing = mockSend.mock.calls[0][0];
    expect(outgoing.android.priority).toBe("high");
    expect(outgoing.android.ttl).toBe(15 * 60 * 1000);
    expect(outgoing.android.notification.channelId).toBe("lives");
    expect(mockUpdateOne.mock.calls[0][1].$set).toEqual(expect.objectContaining({
      "pushRateLimit.liveCount": 1,
    }));
  });

  test("a call is still capped after eight incoming calls, without unlimited high-priority spam", async () => {
    withUser(makeUser({ incomingCallDate: today(), incomingCallCount: 8 }));
    const { sendPush } = require("../fcm.js");
    await sendPush(USER_ID, "registered-android-token", "Llamada", "Calling", { type: "call_incoming" });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  test("same-day quota reservation uses conditional atomic increment, not stale count overwrite", async () => {
    withUser(makeUser({ liveDate: today(), liveCount: 7 }));
    const { sendPush } = require("../fcm.js");
    await sendPush(USER_ID, "registered-android-token", "LIVE", "Go", { type: "live" });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [filter, update] = mockUpdateOne.mock.calls[0];
    expect(filter._id).toBe(USER_ID);
    expect(filter["pushRateLimit.liveDate"]).toEqual({
      $gte: expect.any(Date),
      $lt: expect.any(Date),
    });
    expect(filter.$or).toEqual(expect.arrayContaining([
      { "pushRateLimit.liveCount": { $lt: 8 } },
    ]));
    expect(update).toEqual({ $inc: { "pushRateLimit.liveCount": 1 } });
  });

  test("quota reservation fails closed when conditional Mongo update finds no available slot", async () => {
    withUser(makeUser({ liveDate: today(), liveCount: 7 }));
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    const { sendPush } = require("../fcm.js");
    await sendPush(USER_ID, "registered-android-token", "LIVE", "Go", { type: "live" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("concurrent daily reset retries only a bounded same-day atomic increment", async () => {
    withUser(makeUser({ liveDate: null, liveCount: 0 }));
    mockUpdateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { sendPush } = require("../fcm.js");
    await sendPush(USER_ID, "registered-android-token", "LIVE", "Go", { type: "live" });
    expect(mockUpdateOne).toHaveBeenCalledTimes(2);
    expect(mockUpdateOne.mock.calls[1][1]).toEqual({ $inc: { "pushRateLimit.liveCount": 1 } });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("routine notifications preserve normal priority, channel and default TTL", async () => {
    withUser(makeUser({ date: today(), count: 0 }));
    const { sendPush } = require("../fcm.js");
    await sendPush(USER_ID, "registered-android-token", "Mensaje", "Hola", { type: "message" });
    const outgoing = mockSend.mock.calls[0][0];
    expect(outgoing.android.notification.channelId).toBe("messages");
    expect(outgoing.android.priority).toBeUndefined();
    expect(outgoing.android.ttl).toBeUndefined();
  });
});
