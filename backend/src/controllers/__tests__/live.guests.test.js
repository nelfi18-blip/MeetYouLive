const {
  requestJoinLive,
  approveGuest,
  declineGuest,
  leaveAsGuest,
  removeGuest,
  getGuests,
} = require("../live.controller.js");
const Live = require("../../models/Live.js");
const User = require("../../models/User.js");
const { getIO } = require("../../lib/socket.js");

const hostUserId = "507f1f77bcf86cd799439011";
const viewerUserId = "507f1f77bcf86cd799439012";
const otherViewerUserId = "507f1f77bcf86cd799439016";
const liveId = "507f1f77bcf86cd799439013";
const guestUserId = "507f1f77bcf86cd799439014";
const bannedUserId = "507f1f77bcf86cd799439015";

jest.mock("../../models/Live.js", () => ({
  findOne: jest.fn(),
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

function makeLive(overrides = {}) {
  return {
    _id: liveId,
    user: hostUserId,
    isLive: true,
    guests: [],
    guestRequests: [],
    maxGuests: 3,
    bannedUsers: [],
    save: jest.fn().mockResolvedValue(),
    ...overrides,
  };
}

function mockUser(user = { _id: viewerUserId, username: "viewer" }) {
  User.findById.mockReturnValue({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(user),
    })),
  });
}

describe("Multi-guest live controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIO.mockReturnValue(io);
    mockUser();
  });

  describe("requestJoinLive", () => {
    test("host cannot request to join their own live", async () => {
      Live.findOne.mockResolvedValue(makeLive());
      const req = { params: { id: liveId }, userId: hostUserId };
      const res = makeRes();

      await requestJoinLive(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(io.emit).not.toHaveBeenCalled();
    });

    test("viewer already approved as guest cannot request again", async () => {
      Live.findOne.mockResolvedValue(makeLive({ guests: [{ userId: viewerUserId, status: "active" }] }));
      const req = { params: { id: liveId }, userId: viewerUserId };
      const res = makeRes();

      await requestJoinLive(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("rejects a new request once maxGuests active guests are reached", async () => {
      Live.findOne.mockResolvedValue(
        makeLive({
          maxGuests: 1,
          guests: [{ userId: guestUserId, status: "active" }],
        })
      );
      const req = { params: { id: liveId }, userId: viewerUserId };
      const res = makeRes();

      await requestJoinLive(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    });

    test("viewer can request to join and host is notified via socket", async () => {
      const live = makeLive();
      Live.findOne.mockResolvedValue(live);
      const req = { params: { id: liveId }, userId: viewerUserId };
      const res = makeRes();

      await requestJoinLive(req, res);

      expect(live.guestRequests).toHaveLength(1);
      expect(live.guestRequests[0]).toMatchObject({ userId: viewerUserId, status: "pending" });
      expect(live.save).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(hostUserId);
      expect(io.emit).toHaveBeenCalledWith("GUEST_REQUEST_RECEIVED", expect.objectContaining({ liveId }));
    });
  });

  describe("approveGuest", () => {
    test("host receives the request and approves it, guest becomes active", async () => {
      const live = makeLive({ guestRequests: [{ userId: viewerUserId, status: "pending" }] });
      Live.findOne.mockResolvedValue(live);
      const req = { params: { id: liveId }, body: { guestUserId: viewerUserId }, userId: hostUserId };
      const res = makeRes();

      await approveGuest(req, res);

      expect(live.guestRequests[0].status).toBe("approved");
      expect(live.guests).toEqual(
        expect.arrayContaining([expect.objectContaining({ userId: viewerUserId, status: "active" })])
      );
      expect(live.save).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(viewerUserId);
      expect(io.emit).toHaveBeenCalledWith("GUEST_APPROVED", expect.objectContaining({ liveId }));
    });

    test("rejects approval when maxGuests is already reached (server-side enforcement)", async () => {
      const live = makeLive({
        maxGuests: 1,
        guests: [{ userId: guestUserId, status: "active" }],
        guestRequests: [{ userId: viewerUserId, status: "pending" }],
      });
      Live.findOne.mockResolvedValue(live);
      const req = { params: { id: liveId }, body: { guestUserId: viewerUserId }, userId: hostUserId };
      const res = makeRes();

      await approveGuest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(live.guests).toHaveLength(1);
      expect(io.emit).not.toHaveBeenCalled();
    });

    test("non-host cannot approve guests on someone else's live", async () => {
      Live.findOne.mockResolvedValue(null);
      const req = { params: { id: liveId }, body: { guestUserId: viewerUserId }, userId: otherViewerUserId };
      const res = makeRes();

      await approveGuest(req, res);

      expect(Live.findOne).toHaveBeenCalledWith({ _id: liveId, user: otherViewerUserId, isLive: true });
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("declineGuest", () => {
    test("host can decline a pending request", async () => {
      const live = makeLive({ guestRequests: [{ userId: viewerUserId, status: "pending" }] });
      Live.findOne.mockResolvedValue(live);
      const req = { params: { id: liveId }, body: { guestUserId: viewerUserId }, userId: hostUserId };
      const res = makeRes();

      await declineGuest(req, res);

      expect(live.guestRequests[0].status).toBe("declined");
      expect(live.save).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(viewerUserId);
      expect(io.emit).toHaveBeenCalledWith("GUEST_DECLINED", expect.objectContaining({ liveId }));
    });
  });

  describe("leaveAsGuest", () => {
    test("an active guest can leave and stops being treated as a guest", async () => {
      const live = makeLive({ guests: [{ userId: viewerUserId, status: "active" }] });
      Live.findOne.mockResolvedValue(live);
      const req = { params: { id: liveId }, userId: viewerUserId };
      const res = makeRes();

      await leaveAsGuest(req, res);

      expect(live.guests).toEqual([]);
      expect(live.save).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(`live:${liveId}`);
      expect(io.emit).toHaveBeenCalledWith("GUEST_LEFT", expect.objectContaining({ liveId, userId: viewerUserId }));
    });

    test("a plain viewer who is not a guest cannot leave as guest", async () => {
      Live.findOne.mockResolvedValue(makeLive());
      const req = { params: { id: liveId }, userId: otherViewerUserId };
      const res = makeRes();

      await leaveAsGuest(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(io.emit).not.toHaveBeenCalled();
    });
  });

  describe("removeGuest", () => {
    test("host can remove an active guest, who loses guest status", async () => {
      const live = makeLive({ guests: [{ userId: guestUserId, status: "active" }] });
      Live.findOne.mockResolvedValue(live);
      const req = { params: { id: liveId, guestUserId }, userId: hostUserId };
      const res = makeRes();

      await removeGuest(req, res);

      expect(live.guests).toEqual([]);
      expect(live.save).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(guestUserId);
      expect(io.emit).toHaveBeenCalledWith("GUEST_REMOVED", expect.objectContaining({ liveId }));
      expect(io.to).toHaveBeenCalledWith(`live:${liveId}`);
      expect(io.emit).toHaveBeenCalledWith("GUEST_LEFT", expect.objectContaining({ liveId, userId: guestUserId }));
    });

    test("non-host user cannot remove a guest", async () => {
      Live.findOne.mockResolvedValue(null);
      const req = { params: { id: liveId, guestUserId }, userId: otherViewerUserId };
      const res = makeRes();

      await removeGuest(req, res);

      expect(Live.findOne).toHaveBeenCalledWith({ _id: liveId, user: otherViewerUserId, isLive: true });
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("getGuests", () => {
    test("host sees pending requests, other viewers only see active guests", async () => {
      const liveDoc = {
        user: hostUserId,
        guests: [{ userId: guestUserId, status: "active" }],
        guestRequests: [{ userId: viewerUserId, status: "pending" }],
      };
      Live.findOne.mockReturnValue({
        select: jest.fn(() => ({
          populate: jest.fn(function populate() {
            return this;
          }),
          lean: jest.fn().mockResolvedValue(liveDoc),
        })),
      });

      const resHost = makeRes();
      await getGuests({ params: { id: liveId }, userId: hostUserId }, resHost);
      expect(resHost.json).toHaveBeenCalledWith({
        guests: liveDoc.guests,
        guestRequests: liveDoc.guestRequests,
      });

      const resViewer = makeRes();
      await getGuests({ params: { id: liveId }, userId: otherViewerUserId }, resViewer);
      expect(resViewer.json).toHaveBeenCalledWith({
        guests: liveDoc.guests,
        guestRequests: [],
      });
    });
  });
});
