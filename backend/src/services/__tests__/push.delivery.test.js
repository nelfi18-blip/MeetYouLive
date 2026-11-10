const mockFindEvents = jest.fn();
const mockFindUser = jest.fn();
const mockUpdateEvents = jest.fn();
const mockAnalyticsInsert = jest.fn();
const mockSendPush = jest.fn();

jest.mock("../../models/User.js", () => ({
  findById: mockFindUser,
}));
jest.mock("../../models/PushEvent.js", () => ({
  find: mockFindEvents,
  updateMany: mockUpdateEvents,
  create: jest.fn(),
}));
jest.mock("../../models/PushAnalytic.js", () => ({
  insertMany: mockAnalyticsInsert,
}));
jest.mock("../../lib/fcm.js", () => ({ sendPush: mockSendPush }));

const { flushQueue } = require("../push.service.js");

const userId = "507f1f77bcf86cd799439012";
const pending = {
  _id: "event-1",
  userId,
  type: "message",
  priority: 2,
  scheduledAt: new Date("2026-11-09T00:00:00.000Z"),
  payload: {
    title: "New message",
    body: "Someone sent you a message",
    data: { link: "/chats/abc" },
  },
};

describe("queue must only claim provider-accepted push notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindEvents.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([pending]),
      }),
    });
    mockFindUser.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          pushToken: "token-used-only-in-test",
          pushTokens: [],
          pushSettings: { enabled: true },
          lastActiveAt: null,
        }),
      }),
    });
    mockUpdateEvents.mockResolvedValue({ modifiedCount: 1 });
    mockAnalyticsInsert.mockResolvedValue([]);
  });

  test("FCM acceptance marks the event as sent and produces an analytic", async () => {
    mockSendPush.mockResolvedValue({ accepted: 1, attempted: 1, rejected: 0, status: "accepted" });
    await flushQueue();

    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockUpdateEvents).toHaveBeenCalledWith(
      { _id: { $in: ["event-1"] } },
      { status: "sent", sentAt: expect.any(Date) }
    );
    expect(mockAnalyticsInsert).toHaveBeenCalledWith(
      [expect.objectContaining({ action: "sent", type: "message" })],
      { ordered: false }
    );
  });

  test("FCM unavailable cancels the unsent event without a fake sent analytic", async () => {
    const log = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mockSendPush.mockResolvedValue({ accepted: 0, attempted: 0, rejected: 0, status: "skipped", reason: "fcm_unavailable" });
      await flushQueue();

      expect(mockUpdateEvents).toHaveBeenCalledWith(
        { _id: { $in: ["event-1"] } },
        { status: "cancelled" }
      );
      expect(mockAnalyticsInsert).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("token-used-only-in-test");
    } finally {
      log.mockRestore();
    }
  });

  test("all FCM tokens rejected never marks the event sent", async () => {
    const log = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mockSendPush.mockResolvedValue({ accepted: 0, attempted: 2, rejected: 2, status: "rejected", reason: "fcm_rejected" });
      await flushQueue();

      expect(mockUpdateEvents).toHaveBeenCalledWith(
        { _id: { $in: ["event-1"] } },
        { status: "cancelled" }
      );
      expect(mockAnalyticsInsert).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
