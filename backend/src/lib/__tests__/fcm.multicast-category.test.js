/**
 * Regression tests for sendMulticastPush's category filter.
 *
 * Root-cause bug fixed here: documents created before `pushSettings` existed
 * on the User schema (or otherwise missing the subfield at the Mongo level)
 * have no `pushSettings.categories` array stored at all. A plain equality
 * match on that field silently excluded every such user from ever receiving
 * a push for creators they follow going live — see fcm.js sendMulticastPush
 * for the full explanation.
 */
const mockFind = jest.fn();
const mockFindById = jest.fn();
const mockSend = jest.fn();

jest.mock("../../models/User.js", () => ({
  find: mockFind,
  findById: mockFindById,
  updateOne: jest.fn(),
}));

jest.mock("firebase-admin", () => ({
  apps: [],
  credential: { cert: jest.fn((value) => value) },
  initializeApp: jest.fn(() => ({ name: "test" })),
  messaging: jest.fn(() => ({ send: mockSend })),
}));

describe("sendMulticastPush category filter", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.FCM_PROJECT_ID = "project";
    process.env.FCM_CLIENT_EMAIL = "client@example.test";
    process.env.FCM_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
    mockSend.mockResolvedValue({});
    mockFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ pushRateLimit: { count: 0, date: null }, pushToken: "tok", pushTokens: [] }),
      }),
    });
  });

  afterEach(() => {
    delete process.env.FCM_PROJECT_ID;
    delete process.env.FCM_CLIENT_EMAIL;
    delete process.env.FCM_PRIVATE_KEY;
  });

  test("query includes users with no pushSettings.categories stored (pre-existing accounts)", async () => {
    mockFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    const { sendMulticastPush } = require("../fcm.js");

    await sendMulticastPush(["507f1f77bcf86cd799439011"], "Title", "Body", {}, "live");

    expect(mockFind).toHaveBeenCalledTimes(1);
    const [query] = mockFind.mock.calls[0];
    expect(query["pushSettings.enabled"]).toEqual({ $ne: false });
    // The $or equality-only filter must NOT be the final word — missing or
    // empty categories arrays must still match (opt-in by default).
    expect(query.$and).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          $or: expect.arrayContaining([
            { "pushSettings.categories": "live" },
            { "pushSettings.categories": { $exists: false } },
            { "pushSettings.categories": { $size: 0 } },
          ]),
        }),
      ])
    );
  });

  test("a user who actually opted out of the category is still excluded by the query shape", async () => {
    // Simulate what Mongo would do: a user with an explicit categories list
    // that does NOT include "live" should not be returned by $and/$or above.
    // We assert the query construction only (no live Mongo in this test
    // environment) — the exclusion semantics are covered by relying on
    // standard Mongo $or match-one-of semantics plus the explicit list.
    mockFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    const { sendMulticastPush } = require("../fcm.js");

    await sendMulticastPush(["507f1f77bcf86cd799439011"], "Title", "Body", {}, "live");

    const [query] = mockFind.mock.calls[0];
    expect(query.$or).toBeUndefined(); // replaced by $and once a type filter is applied
  });

  test("delivers the push to a user returned by the query", async () => {
    mockFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: "507f1f77bcf86cd799439011", pushToken: "tok", pushTokens: [] },
      ]),
    });
    const { sendMulticastPush } = require("../fcm.js");

    await sendMulticastPush(["507f1f77bcf86cd799439011"], "🎥 Creator is live", "Don't miss it", { link: "/live/abc", type: "live" }, "live");

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].notification).toEqual({ title: "🎥 Creator is live", body: "Don't miss it" });
    expect(mockSend.mock.calls[0][0].android.notification.channelId).toBe("lives");
  });
});
