"use strict";

jest.mock("../../models/Live.js", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../../models/Gift.js", () => ({
  aggregate: jest.fn(),
}));
jest.mock("../../models/CoinTransaction.js", () => ({
  create: jest.fn(),
}));
jest.mock("../../models/AgencyRelationship.js", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../lib/socket.js", () => ({
  getIO: jest.fn(),
  hasLiveHost: jest.fn(),
  getHostLastSeenAt: jest.fn(() => null),
  getLiveEvent: jest.fn(),
  setLiveEvent: jest.fn(),
  clearLiveEvent: jest.fn(),
  clearAllEventsForLive: jest.fn(),
  clearLiveRoomState: jest.fn(),
  removeLiveUserFromRoom: jest.fn(),
}));
jest.mock("../../lib/fcm.js", () => ({ sendMulticastPush: jest.fn(() => Promise.resolve()) }));
jest.mock("../../services/missions.service.js", () => ({ trackEvent: jest.fn(() => Promise.resolve()) }));
jest.mock("../../services/notification.service.js", () => ({ createBulkNotifications: jest.fn() }));
jest.mock("../../services/analytics.service.js", () => ({
  trackAnalyticsEvent: jest.fn(),
  trackSafeAnalyticsEvent: jest.fn(),
}));

const Live = require("../../models/Live.js");
const User = require("../../models/User.js");
const Gift = require("../../models/Gift.js");
const { getIO, hasLiveHost } = require("../../lib/socket.js");
const { startLive, getLives, getLiveById, joinLive } = require("../live.controller.js");

const liveId = "507f1f77bcf86cd799439013";
const creatorId = "507f1f77bcf86cd799439011";
const viewerId = "507f1f77bcf86cd799439012";

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

function queryChain(value) {
  const chain = {};
  chain.populate = jest.fn(() => chain);
  chain.select = jest.fn(() => chain);
  chain.sort = jest.fn(() => chain);
  chain.lean = jest.fn(() => Promise.resolve(value));
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  chain.catch = (reject) => Promise.resolve(value).catch(reject);
  return chain;
}

function makeLive(overrides = {}) {
  const live = {
    _id: liveId,
    user: {
      _id: creatorId,
      username: "creator",
      role: "creator",
      creatorStatus: "approved",
    },
    title: "Live coherente",
    description: "",
    isLive: true,
    createdAt: new Date(),
    endedAt: null,
    viewerCount: 0,
    entryCost: 0,
    paidViewers: [],
    bannedUsers: [],
    isPrivate: false,
    isVipOnly: false,
    toObject() {
      return {
        _id: this._id,
        user: this.user,
        title: this.title,
        description: this.description,
        isLive: this.isLive,
        createdAt: this.createdAt,
        endedAt: this.endedAt,
        viewerCount: this.viewerCount,
        entryCost: this.entryCost,
        paidViewers: this.paidViewers,
        bannedUsers: this.bannedUsers,
        isPrivate: this.isPrivate,
        isVipOnly: this.isVipOnly,
      };
    },
    ...overrides,
  };
  return live;
}

describe("live public state endpoint consistency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Gift.aggregate.mockResolvedValue([]);
    hasLiveHost.mockReturnValue(false);
    Live.updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  test("LIVE_STARTED can announce a new DB-active live that GET /api/lives also lists without host memory", async () => {
    const emit = jest.fn();
    getIO.mockReturnValue({ to: jest.fn(() => ({ emit })) });
    User.findById.mockReturnValue(queryChain({
      _id: creatorId,
      role: "creator",
      creatorStatus: "approved",
      username: "creator",
      followers: [viewerId],
    }));
    Live.create.mockResolvedValue(makeLive({ user: creatorId }));

    const startRes = makeRes();
    await startLive({ userId: creatorId, body: { title: "Live coherente" } }, startRes);

    expect(emit).toHaveBeenCalledWith("LIVE_STARTED", expect.objectContaining({ liveId }));

    const publicLive = makeLive();
    Live.find.mockReturnValue(queryChain([publicLive]));
    const listRes = makeRes();
    await getLives({}, listRes);

    expect(listRes.json).toHaveBeenCalledWith([
      expect.objectContaining({
        _id: liveId,
        liveState: {
          persistedActive: true,
          hostConnected: false,
          publiclyListed: true,
        },
      }),
    ]);
  });

  test("GET /api/lives and GET /api/lives/:id agree for a publicly active live", async () => {
    const publicLive = makeLive();
    Live.find.mockReturnValue(queryChain([publicLive]));
    Live.findOne.mockReturnValue(queryChain(publicLive));

    const listRes = makeRes();
    await getLives({}, listRes);
    const detailRes = makeRes();
    await getLiveById({ params: { id: liveId }, userId: viewerId }, detailRes);

    expect(listRes.json.mock.calls[0][0]).toHaveLength(1);
    expect(detailRes.json).toHaveBeenCalledWith(expect.objectContaining({
      _id: liveId,
      liveState: expect.objectContaining({ publiclyListed: true }),
    }));
  });

  test("ended lives are not publicly listed or opened", async () => {
    const endedLive = makeLive({ isLive: false, endedAt: new Date() });
    Live.find.mockReturnValue(queryChain([]));
    Live.findOne.mockReturnValue(queryChain(endedLive));

    const listRes = makeRes();
    await getLives({}, listRes);
    const detailRes = makeRes();
    await getLiveById({ params: { id: liveId } }, detailRes);

    expect(listRes.json).toHaveBeenCalledWith([]);
    expect(detailRes.status).toHaveBeenCalledWith(404);
  });

  test("stale lives cannot be joined", async () => {
    const staleLive = makeLive({
      createdAt: new Date(Date.now() - (6 * 60 * 60 * 1000) - 1),
    });
    Live.findOne.mockReturnValue(queryChain(staleLive));

    const res = makeRes();
    await joinLive({ params: { id: liveId }, userId: viewerId }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  describe("owner recovery after in-memory host state is lost (e.g. backend restart)", () => {
    // Older than the 45s host-presence grace window, and simulating a
    // restart where `liveHosts`/`liveHostLastSeenAt` were wiped: no host
    // connected AND no last-seen timestamp at all.
    function makeGhostLiveFromRestart(overrides = {}) {
      return makeLive({
        createdAt: new Date(Date.now() - 60_000),
        ...overrides,
      });
    }

    beforeEach(() => {
      hasLiveHost.mockReturnValue(false);
    });

    test("the live's owner can recover their own persisted-active live and it is NOT marked ended", async () => {
      const ghostLive = makeGhostLiveFromRestart();
      Live.findOne.mockReturnValue(queryChain(ghostLive));

      const res = makeRes();
      await getLiveById({ params: { id: liveId }, userId: creatorId }, res);

      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: liveId,
        liveState: expect.objectContaining({ persistedActive: true, hostConnected: false, publiclyListed: false }),
      }));
      // Must not end the live just because the in-memory host is missing.
      expect(Live.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("the same ghost live stays excluded from the public listing while there is no host", async () => {
      const ghostLive = makeGhostLiveFromRestart();
      Live.find.mockReturnValue(queryChain([ghostLive]));

      const res = makeRes();
      await getLives({}, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    test("a normal viewer cannot use getLiveById to revive or access the ghost live", async () => {
      const ghostLive = makeGhostLiveFromRestart();
      Live.findOne.mockReturnValue(queryChain(ghostLive));

      const res = makeRes();
      await getLiveById({ params: { id: liveId }, userId: viewerId }, res);

      expect(res.status).toHaveBeenCalledWith(404);
      // Viewer access must not end the live either — it's still a
      // legitimate persisted-active live, merely hidden from this viewer.
      expect(Live.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("a normal viewer cannot use joinLive to revive the ghost live", async () => {
      const ghostLive = makeGhostLiveFromRestart();
      Live.findOne.mockReturnValue(queryChain(ghostLive));

      const res = makeRes();
      await joinLive({ params: { id: liveId }, userId: viewerId }, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(Live.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("once the host re-registers, the live is publicly active again for everyone", async () => {
      hasLiveHost.mockReturnValue(true);
      const recoveredLive = makeGhostLiveFromRestart();

      Live.find.mockReturnValue(queryChain([recoveredLive]));
      const listRes = makeRes();
      await getLives({}, listRes);
      expect(listRes.json.mock.calls[0][0]).toHaveLength(1);

      Live.findOne.mockReturnValue(queryChain(recoveredLive));
      const viewerRes = makeRes();
      await getLiveById({ params: { id: liveId }, userId: viewerId }, viewerRes);
      expect(viewerRes.json).toHaveBeenCalledWith(expect.objectContaining({
        liveState: expect.objectContaining({ publiclyListed: true }),
      }));
    });

    test("ended lives still cannot be recovered by their owner", async () => {
      const endedLive = makeGhostLiveFromRestart({ isLive: false, endedAt: new Date() });
      Live.findOne.mockReturnValue(queryChain(endedLive));

      const res = makeRes();
      await getLiveById({ params: { id: liveId }, userId: creatorId }, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("stale (>6h) lives still cannot be recovered by their owner", async () => {
      const staleLive = makeGhostLiveFromRestart({
        createdAt: new Date(Date.now() - (6 * 60 * 60 * 1000) - 1),
      });
      Live.findOne.mockReturnValue(queryChain(staleLive));

      const res = makeRes();
      await getLiveById({ params: { id: liveId }, userId: creatorId }, res);

      expect(res.status).toHaveBeenCalledWith(404);
      // Stale lives are a genuine end condition, so cleanup IS expected here.
      expect(Live.findByIdAndUpdate).toHaveBeenCalled();
    });
  });
});
