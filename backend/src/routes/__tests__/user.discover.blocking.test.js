const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");
const User = require("../../models/User.js");
const Live = require("../../models/Live.js");

const currentUserId = "507f1f77bcf86cd799439011";
const blockedByViewerId = "507f1f77bcf86cd799439012";
const viewerBlockedById = "507f1f77bcf86cd799439013";
const eligibleUserId = "507f1f77bcf86cd799439014";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = currentUserId;
    next();
  },
  optionalVerifyToken: (_req, _res, next) => next(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  aggregate: jest.fn(),
}));

jest.mock("../../models/Live.js", () => ({
  find: jest.fn(),
}));

jest.mock("../../lib/cloudinary.js", () => ({
  uploadProfilePhoto: jest.fn(),
}));

jest.mock("../../lib/socket.js", () => ({
  getOnlineUsers: jest.fn(() => []),
}));

const userRoutes = require("../user.routes.js");

const makeApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/user", userRoutes);
  return app;
};

const makeUserFindByIdChain = (viewer) => ({
  select: jest.fn().mockResolvedValue(viewer),
});

const makeLiveFindChain = (lives = []) => ({
  populate: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(lives),
    })),
  })),
});

const baseViewer = (blockedUsers = []) => ({
  _id: currentUserId,
  interests: ["music"],
  intent: "dating",
  gender: "male",
  interestedIn: "both",
  discoveryPreferences: {},
  blockedUsers,
});

const getDiscoverMatch = () => User.aggregate.mock.calls[0][0][0].$match;

describe("GET /api/user/discover blocking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.aggregate.mockResolvedValue([]);
    Live.find.mockReturnValue(makeLiveFindChain([]));
  });

  test("excludes users blocked by the viewer", async () => {
    User.findById.mockReturnValue(makeUserFindByIdChain(baseViewer([blockedByViewerId])));

    const res = await request(makeApp()).get("/api/user/discover");

    expect(res.status).toBe(200);
    expect(getDiscoverMatch()._id.$nin.map(String)).toEqual([currentUserId, blockedByViewerId]);
  });

  test("excludes users who blocked the viewer", async () => {
    User.findById.mockReturnValue(makeUserFindByIdChain(baseViewer()));

    const res = await request(makeApp()).get("/api/user/discover");

    expect(res.status).toBe(200);
    expect(getDiscoverMatch().blockedUsers).toEqual({
      $ne: new mongoose.Types.ObjectId(currentUserId),
    });
  });

  test("excludes both sides when blocking is mutual", async () => {
    User.findById.mockReturnValue(makeUserFindByIdChain(baseViewer([viewerBlockedById])));

    const res = await request(makeApp()).get("/api/user/discover");

    expect(res.status).toBe(200);
    expect(getDiscoverMatch()._id.$nin.map(String)).toContain(viewerBlockedById);
    expect(getDiscoverMatch().blockedUsers).toEqual({
      $ne: new mongoose.Types.ObjectId(currentUserId),
    });
  });

  test("returns an eligible user who is not blocked in either direction", async () => {
    User.findById.mockReturnValue(makeUserFindByIdChain(baseViewer()));
    User.aggregate.mockResolvedValue([
      {
        _id: new mongoose.Types.ObjectId(eligibleUserId),
        username: "eligible",
        interests: ["music", "travel"],
        intent: "dating",
        role: "user",
      },
    ]);

    const res = await request(makeApp()).get("/api/user/discover");

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).toEqual(expect.objectContaining({ username: "eligible" }));
  });

  test("keeps existing admin/staff and blocked-account discovery filters unchanged", async () => {
    User.findById.mockReturnValue(makeUserFindByIdChain(baseViewer()));

    const res = await request(makeApp()).get("/api/user/discover");

    expect(res.status).toBe(200);
    expect(getDiscoverMatch()).toEqual(
      expect.objectContaining({
        isBlocked: false,
        onboardingComplete: true,
        role: { $nin: expect.any(Array) },
      })
    );
    expect(getDiscoverMatch()).not.toHaveProperty("isSuspended");
  });

  test("does not add Like, Match, Crush, or Super Crush filters", async () => {
    User.findById.mockReturnValue(makeUserFindByIdChain(baseViewer()));

    const res = await request(makeApp()).get("/api/user/discover");

    expect(res.status).toBe(200);
    const match = getDiscoverMatch();
    expect(match).not.toHaveProperty("likes");
    expect(match).not.toHaveProperty("matches");
    expect(match).not.toHaveProperty("crushes");
    expect(match).not.toHaveProperty("superCrushes");
  });
});
