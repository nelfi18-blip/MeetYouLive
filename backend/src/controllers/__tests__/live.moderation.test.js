const { moderateLiveUser } = require("../live.controller.js");
const Live = require("../../models/Live.js");
const User = require("../../models/User.js");
const { getIO, removeLiveUserFromRoom } = require("../../lib/socket.js");

const hostUserId = "507f1f77bcf86cd799439011";
const targetUserId = "507f1f77bcf86cd799439012";
const liveId = "507f1f77bcf86cd799439013";
const normalUserId = "507f1f77bcf86cd799439014";

jest.mock("../../models/Live.js", () => ({
  findOne: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

jest.mock("../../models/Gift.js", () => ({}));
jest.mock("../../services/missions.service.js", () => ({ trackEvent: jest.fn() }));
jest.mock("../../services/notification.service.js", () => ({ createBulkNotifications: jest.fn() }));
jest.mock("../../services/analytics.service.js", () => ({ trackAnalyticsEvent: jest.fn() }));
jest.mock("../../services/live.service.js", () => ({
  isLiveActuallyActive: jest.fn(),
  cleanupStaleLives: jest.fn(),
  markLiveAsEnded: jest.fn(),
  filterActiveLives: jest.fn(),
}));

const io = {
  to: jest.fn(() => io),
  emit: jest.fn(),
};

jest.mock("../../lib/socket.js", () => ({
  getIO: jest.fn(),
  removeLiveUserFromRoom: jest.fn(),
  hasLiveHost: jest.fn(),
  getLiveEvent: jest.fn(),
  setLiveEvent: jest.fn(),
  clearLiveEvent: jest.fn(),
  clearAllEventsForLive: jest.fn(),
}));

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

function makeLive(overrides = {}) {
  return {
    _id: liveId,
    user: hostUserId,
    isLive: true,
    guests: [{ userId: targetUserId }],
    guestRequests: [{ userId: targetUserId, status: "pending" }],
    bannedUsers: [],
    moderationActions: [],
    save: jest.fn().mockResolvedValue(),
    ...overrides,
  };
}

function mockTargetUser(user = { _id: targetUserId, username: "viewer" }) {
  User.findById.mockReturnValue({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(user),
    })),
  });
}

describe("moderateLiveUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIO.mockReturnValue(io);
    removeLiveUserFromRoom.mockResolvedValue(1);
    mockTargetUser();
  });

  test("kicks a user from the host's live and emits moderation events", async () => {
    const live = makeLive();
    Live.findOne.mockResolvedValue(live);
    const req = { params: { id: liveId, action: "kick" }, body: { targetUserId }, userId: hostUserId };
    const res = makeRes();

    await moderateLiveUser(req, res);

    expect(live.guests).toEqual([]);
    expect(live.guestRequests).toEqual([]);
    expect(live.bannedUsers).toEqual([]);
    expect(live.moderationActions).toHaveLength(1);
    expect(live.moderationActions[0]).toMatchObject({ moderator: hostUserId, target: targetUserId, action: "kick" });
    expect(live.save).toHaveBeenCalled();
    expect(removeLiveUserFromRoom).toHaveBeenCalledWith(
      liveId,
      targetUserId,
      expect.objectContaining({ liveId, targetUserId, action: "kick" })
    );
    expect(io.to).toHaveBeenCalledWith(targetUserId);
    expect(io.emit).toHaveBeenCalledWith("LIVE_USER_MODERATED", expect.objectContaining({ action: "kick" }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, action: "kick" }));
  });

  test("bans a user from the host's live without duplicating banned users", async () => {
    const live = makeLive({ bannedUsers: [targetUserId] });
    Live.findOne.mockResolvedValue(live);
    const req = { params: { id: liveId, action: "ban" }, body: { targetUserId, reason: "spam" }, userId: hostUserId };
    const res = makeRes();

    await moderateLiveUser(req, res);

    expect(live.bannedUsers.map(String)).toEqual([targetUserId]);
    expect(live.moderationActions[0]).toMatchObject({ action: "ban", reason: "spam" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, action: "ban" }));
  });

  test("rejects moderation from non-host users without emitting events", async () => {
    Live.findOne.mockResolvedValue(null);
    const req = { params: { id: liveId, action: "kick" }, body: { targetUserId }, userId: normalUserId };
    const res = makeRes();

    await moderateLiveUser(req, res);

    expect(Live.findOne).toHaveBeenCalledWith({ _id: liveId, user: normalUserId, isLive: true });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(removeLiveUserFromRoom).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  test("keeps kick and ban scoped to the requested live only", async () => {
    const live = makeLive();
    Live.findOne.mockResolvedValue(live);
    const req = {
      params: { id: liveId, action: "ban" },
      body: { targetUserId, liveId: "507f1f77bcf86cd799439099", channelName: "other-channel" },
      userId: hostUserId,
    };
    const res = makeRes();

    await moderateLiveUser(req, res);

    expect(Live.findOne).toHaveBeenCalledWith({ _id: liveId, user: hostUserId, isLive: true });
    expect(removeLiveUserFromRoom).toHaveBeenCalledWith(
      liveId,
      targetUserId,
      expect.objectContaining({ liveId, targetUserId, action: "ban" })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ liveId, targetUserId, action: "ban" }));
  });

  test("duplicate moderation requests are idempotent", async () => {
    const live = makeLive({
      bannedUsers: [targetUserId],
      moderationActions: [{ moderator: hostUserId, target: targetUserId, action: "ban", reason: "spam" }],
    });
    Live.findOne.mockResolvedValue(live);
    const req = { params: { id: liveId, action: "ban" }, body: { targetUserId, reason: "spam" }, userId: hostUserId };
    const res = makeRes();

    await moderateLiveUser(req, res);

    expect(live.bannedUsers.map(String)).toEqual([targetUserId]);
    expect(live.moderationActions).toHaveLength(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, action: "ban" }));
  });

  test("rejects invalid actions and self moderation", async () => {
    const resInvalid = makeRes();
    await moderateLiveUser(
      { params: { id: liveId, action: "suspend" }, body: { targetUserId }, userId: hostUserId },
      resInvalid
    );
    expect(resInvalid.status).toHaveBeenCalledWith(400);

    const resSelf = makeRes();
    await moderateLiveUser(
      { params: { id: liveId, action: "kick" }, body: { targetUserId: hostUserId }, userId: hostUserId },
      resSelf
    );
    expect(resSelf.status).toHaveBeenCalledWith(400);
    expect(Live.findOne).not.toHaveBeenCalled();
  });

  test("rejects when live or target user is missing", async () => {
    Live.findOne.mockResolvedValue(null);
    const resMissingLive = makeRes();
    await moderateLiveUser(
      { params: { id: liveId, action: "kick" }, body: { targetUserId }, userId: hostUserId },
      resMissingLive
    );
    expect(resMissingLive.status).toHaveBeenCalledWith(404);

    Live.findOne.mockResolvedValue(makeLive());
    mockTargetUser(null);
    const resMissingUser = makeRes();
    await moderateLiveUser(
      { params: { id: liveId, action: "kick" }, body: { targetUserId }, userId: hostUserId },
      resMissingUser
    );
    expect(resMissingUser.status).toHaveBeenCalledWith(404);
  });
});
