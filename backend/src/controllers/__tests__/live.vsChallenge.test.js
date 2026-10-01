const {
  startVsChallenge,
  acceptVsChallenge,
  declineVsChallenge,
  getVsStatus,
} = require("../live.controller.js");
const Live = require("../../models/Live.js");
const User = require("../../models/User.js");
const { getIO } = require("../../lib/socket.js");

const hostUserId = "507f1f77bcf86cd799439011";
const hostLiveId = "507f1f77bcf86cd799439012";
const opponentUserId = "507f1f77bcf86cd799439013";
const opponentLiveId = "507f1f77bcf86cd799439014";
const viewerUserId = "507f1f77bcf86cd799439015";
const challengeId = "11111111-1111-1111-1111-111111111111";

jest.mock("../../models/Live.js", () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

const io = {
  to: jest.fn(() => io),
  emit: jest.fn(),
};

jest.mock("../../lib/socket.js", () => ({
  getIO: jest.fn(),
}));

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

function makeHostLive(overrides = {}) {
  return {
    _id: hostLiveId,
    user: hostUserId,
    isLive: true,
    isVsActive: false,
    vsChallenge: null,
    save: jest.fn().mockResolvedValue(),
    ...overrides,
  };
}

function makeOpponentLive(overrides = {}) {
  return {
    _id: opponentLiveId,
    user: { _id: opponentUserId, role: "creator", creatorStatus: "approved", username: "opponent", avatar: null },
    isLive: true,
    isVsActive: false,
    vsChallenge: null,
    save: jest.fn().mockResolvedValue(),
    ...overrides,
  };
}

function mockUser(user) {
  User.findById.mockReturnValue({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(user),
    })),
  });
}

describe("VS Battle challenge/accept/decline", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getIO.mockReturnValue(io);
  });

  describe("startVsChallenge", () => {
    test("approved creator can challenge an eligible opponent", async () => {
      const hostLive = makeHostLive();
      const opponentLive = makeOpponentLive();
      Live.findOne
        .mockReturnValueOnce(Promise.resolve(hostLive))
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(opponentLive) });
      mockUser({ _id: hostUserId, role: "creator", creatorStatus: "approved", username: "host", avatar: null });

      const req = { params: { id: hostLiveId }, userId: hostUserId, body: { opponentLiveId, durationMinutes: 5 } };
      const res = makeRes();

      await startVsChallenge(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending", opponentLiveId, durationMinutes: 5 })
      );
      expect(hostLive.vsChallenge).toMatchObject({ status: "pending", durationMinutes: 5 });
      expect(opponentLive.vsChallenge).toMatchObject({ status: "pending", durationMinutes: 5 });
      expect(hostLive.save).toHaveBeenCalled();
      expect(opponentLive.save).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(`live:${opponentLiveId}`);
      expect(io.emit).toHaveBeenCalledWith("vs_challenge_received", expect.objectContaining({ opponentLiveId }));
    });

    test("approved subCreator can challenge", async () => {
      const hostLive = makeHostLive();
      const opponentLive = makeOpponentLive();
      Live.findOne
        .mockReturnValueOnce(Promise.resolve(hostLive))
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(opponentLive) });
      mockUser({ _id: hostUserId, role: "subCreator", creatorStatus: "approved", username: "sub", avatar: null });

      const req = { params: { id: hostLiveId }, userId: hostUserId, body: { opponentLiveId, durationMinutes: 5 } };
      const res = makeRes();

      await startVsChallenge(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(hostLive.save).toHaveBeenCalled();
    });

    test("normal viewer receives 403", async () => {
      const hostLive = makeHostLive();
      Live.findOne.mockReturnValueOnce(Promise.resolve(hostLive));
      mockUser({ _id: viewerUserId, role: "user", creatorStatus: "none" });

      const req = { params: { id: hostLiveId }, userId: viewerUserId, body: { opponentLiveId, durationMinutes: 5 } };
      const res = makeRes();

      await startVsChallenge(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(hostLive.save).not.toHaveBeenCalled();
    });

    test.each(["pending", "rejected", "suspended"])(
      "creator with creatorStatus=%s receives 403",
      async (creatorStatus) => {
        const hostLive = makeHostLive();
        Live.findOne.mockReturnValueOnce(Promise.resolve(hostLive));
        mockUser({ _id: hostUserId, role: "creator", creatorStatus });

        const req = { params: { id: hostLiveId }, userId: hostUserId, body: { opponentLiveId, durationMinutes: 5 } };
        const res = makeRes();

        await startVsChallenge(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(hostLive.save).not.toHaveBeenCalled();
      }
    );

    test("non-approved opponent is rejected", async () => {
      const hostLive = makeHostLive();
      const opponentLive = makeOpponentLive({
        user: { _id: opponentUserId, role: "creator", creatorStatus: "pending" },
      });
      Live.findOne
        .mockReturnValueOnce(Promise.resolve(hostLive))
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(opponentLive) });
      mockUser({ _id: hostUserId, role: "creator", creatorStatus: "approved", username: "host" });

      const req = { params: { id: hostLiveId }, userId: hostUserId, body: { opponentLiveId, durationMinutes: 5 } };
      const res = makeRes();

      await startVsChallenge(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(hostLive.save).not.toHaveBeenCalled();
    });

    test("self challenge is rejected", async () => {
      const hostLive = makeHostLive();
      Live.findOne.mockReturnValueOnce(Promise.resolve(hostLive));
      mockUser({ _id: hostUserId, role: "creator", creatorStatus: "approved", username: "host" });

      const req = { params: { id: hostLiveId }, userId: hostUserId, body: { opponentLiveId: hostLiveId, durationMinutes: 5 } };
      const res = makeRes();

      await startVsChallenge(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(hostLive.save).not.toHaveBeenCalled();
    });

    test("nonexistent/inactive opponent live is rejected", async () => {
      const hostLive = makeHostLive();
      Live.findOne
        .mockReturnValueOnce(Promise.resolve(hostLive))
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(null) });
      mockUser({ _id: hostUserId, role: "creator", creatorStatus: "approved", username: "host" });

      const req = { params: { id: hostLiveId }, userId: hostUserId, body: { opponentLiveId, durationMinutes: 5 } };
      const res = makeRes();

      await startVsChallenge(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("rejects when host already has an active VS battle", async () => {
      const hostLive = makeHostLive({ isVsActive: true });
      Live.findOne.mockReturnValueOnce(Promise.resolve(hostLive));
      mockUser({ _id: hostUserId, role: "creator", creatorStatus: "approved", username: "host" });

      const req = { params: { id: hostLiveId }, userId: hostUserId, body: { opponentLiveId, durationMinutes: 5 } };
      const res = makeRes();

      await startVsChallenge(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("rejects when opponent already has an active VS battle", async () => {
      const hostLive = makeHostLive();
      const opponentLive = makeOpponentLive({ isVsActive: true });
      Live.findOne
        .mockReturnValueOnce(Promise.resolve(hostLive))
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(opponentLive) });
      mockUser({ _id: hostUserId, role: "creator", creatorStatus: "approved", username: "host" });

      const req = { params: { id: hostLiveId }, userId: hostUserId, body: { opponentLiveId, durationMinutes: 5 } };
      const res = makeRes();

      await startVsChallenge(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("acceptVsChallenge", () => {
    function makePendingChallenge() {
      return {
        challengeId,
        challengerLiveId: hostLiveId,
        opponentLiveId,
        durationMinutes: 5,
        status: "pending",
        createdAt: new Date(),
      };
    }

    test("only the challenged live's owner can accept, and acceptance activates both lives", async () => {
      const challenge = makePendingChallenge();
      const opponentLive = makeOpponentLive({ vsChallenge: { ...challenge } });
      const hostLive = makeHostLive({ vsChallenge: { ...challenge } });

      Live.findOne.mockResolvedValueOnce(opponentLive);
      Live.findById.mockResolvedValueOnce(hostLive);
      mockUser({ _id: opponentUserId, role: "creator", creatorStatus: "approved", username: "opponent", avatar: null });

      const req = { params: { id: opponentLiveId, challengeId }, userId: opponentUserId };
      const res = makeRes();

      await acceptVsChallenge(req, res);

      expect(hostLive.isVsActive).toBe(true);
      expect(opponentLive.isVsActive).toBe(true);
      expect(String(hostLive.opponentId)).toBe(opponentLiveId);
      expect(String(opponentLive.opponentId)).toBe(hostLiveId);
      expect(hostLive.vsChallenge).toBeNull();
      expect(opponentLive.vsChallenge).toBeNull();
      expect(io.emit).toHaveBeenCalledWith("vs_battle_started", expect.objectContaining({ role: "host" }));
      expect(io.emit).toHaveBeenCalledWith("vs_battle_started", expect.objectContaining({ role: "opponent" }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    });

    test("non-owner of the challenged live cannot accept (live lookup scoped to owner)", async () => {
      // requestJoinLive-style ownership check: Live.findOne is scoped to { _id, user: req.userId }.
      // A non-owner querying with their own userId will not match the opponent live.
      Live.findOne.mockResolvedValueOnce(null);
      mockUser({ _id: viewerUserId, role: "creator", creatorStatus: "approved" });

      const req = { params: { id: opponentLiveId, challengeId }, userId: viewerUserId };
      const res = makeRes();

      await acceptVsChallenge(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("a challenge cannot be accepted twice", async () => {
      const challenge = { ...makePendingChallenge(), status: "accepted", respondedAt: new Date() };
      const opponentLive = makeOpponentLive({ vsChallenge: challenge });
      Live.findOne.mockResolvedValueOnce(opponentLive);
      mockUser({ _id: opponentUserId, role: "creator", creatorStatus: "approved" });

      const req = { params: { id: opponentLiveId, challengeId }, userId: opponentUserId };
      const res = makeRes();

      await acceptVsChallenge(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(opponentLive.isVsActive).toBe(false);
    });
  });

  describe("getVsStatus", () => {
    function mockLiveChain(result) {
      return {
        populate: jest.fn(() => ({
          select: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue(result),
          })),
        })),
      };
    }

    test("identifies a pending incoming challenge (current live is the opponent)", async () => {
      const challenge = {
        challengeId,
        challengerLiveId: hostLiveId,
        opponentLiveId,
        durationMinutes: 5,
        status: "pending",
        createdAt: new Date(),
      };
      const opponentLiveDoc = {
        _id: opponentLiveId,
        user: { _id: opponentUserId, username: "opponent", name: "Opponent", avatar: null },
        isVsActive: false,
        opponentId: null,
        vsChallenge: { ...challenge },
      };
      const hostLiveDoc = {
        _id: hostLiveId,
        user: { _id: hostUserId, username: "host", name: "Host", avatar: null },
      };

      Live.findById
        .mockReturnValueOnce(mockLiveChain(opponentLiveDoc))
        .mockReturnValueOnce(mockLiveChain(hostLiveDoc));

      const req = { params: { id: opponentLiveId } };
      const res = makeRes();

      await getVsStatus(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.challenger).toEqual(
        expect.objectContaining({ liveId: String(hostLiveId), username: "host" })
      );
      expect(payload.challengeOpponent).toBeNull();
      expect(payload.vsChallenge).toEqual(expect.objectContaining({ status: "pending" }));
    });

    test("identifies a pending outgoing challenge and returns the opponent identity (current live is the challenger)", async () => {
      const challenge = {
        challengeId,
        challengerLiveId: hostLiveId,
        opponentLiveId,
        durationMinutes: 5,
        status: "pending",
        createdAt: new Date(),
      };
      const hostLiveDoc = {
        _id: hostLiveId,
        user: { _id: hostUserId, username: "host", name: "Host", avatar: null },
        isVsActive: false,
        opponentId: null,
        vsChallenge: { ...challenge },
      };
      const opponentLiveDoc = {
        _id: opponentLiveId,
        user: { _id: opponentUserId, username: "opponent", name: "Opponent", avatar: null },
      };

      Live.findById
        .mockReturnValueOnce(mockLiveChain(hostLiveDoc))
        .mockReturnValueOnce(mockLiveChain(opponentLiveDoc));

      const req = { params: { id: hostLiveId } };
      const res = makeRes();

      await getVsStatus(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.challengeOpponent).toEqual(
        expect.objectContaining({ liveId: String(opponentLiveId), username: "opponent" })
      );
      expect(payload.challenger).toBeNull();
      expect(payload.vsChallenge).toEqual(expect.objectContaining({ status: "pending" }));
    });

    test("does not alter recovery of an active VS battle (no pending challenge)", async () => {
      const hostLiveDoc = {
        _id: hostLiveId,
        user: { _id: hostUserId, username: "host", name: "Host", avatar: null },
        isVsActive: true,
        opponentId: opponentLiveId,
        vsStartTime: new Date(),
        vsDuration: 120,
        vsScore: { host: 10, opponent: 5 },
        vsChallenge: null,
      };
      const opponentLiveDoc = {
        _id: opponentLiveId,
        user: { _id: opponentUserId, username: "opponent", name: "Opponent", avatar: null },
      };

      Live.findById
        .mockReturnValueOnce(mockLiveChain(hostLiveDoc))
        .mockReturnValueOnce(mockLiveChain(opponentLiveDoc));

      const req = { params: { id: hostLiveId } };
      const res = makeRes();

      await getVsStatus(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.isVsActive).toBe(true);
      expect(payload.opponent).toEqual(
        expect.objectContaining({ liveId: String(opponentLiveId), username: "opponent" })
      );
      expect(payload.challenger).toBeNull();
      expect(payload.challengeOpponent).toBeNull();
    });
  });

  describe("declineVsChallenge", () => {
    test("decline does NOT activate the VS battle", async () => {
      const challenge = {
        challengeId,
        challengerLiveId: hostLiveId,
        opponentLiveId,
        durationMinutes: 5,
        status: "pending",
        createdAt: new Date(),
      };
      const opponentLive = makeOpponentLive({ vsChallenge: { ...challenge } });
      const hostLive = makeHostLive({ vsChallenge: { ...challenge } });
      Live.findOne.mockResolvedValueOnce(opponentLive);
      Live.findById.mockResolvedValueOnce(hostLive);

      const req = { params: { id: opponentLiveId, challengeId }, userId: opponentUserId };
      const res = makeRes();

      await declineVsChallenge(req, res);

      expect(opponentLive.isVsActive).toBe(false);
      expect(hostLive.isVsActive).toBe(false);
      expect(opponentLive.vsChallenge.status).toBe("declined");
      expect(io.emit).toHaveBeenCalledWith("vs_challenge_declined", expect.objectContaining({ challengeId }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    });
  });
});
