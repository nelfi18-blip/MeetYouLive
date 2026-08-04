const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");
const User = require("../../models/User.js");
const Live = require("../../models/Live.js");

const currentUserId = "507f1f77bcf86cd799439011";
const blockedUserId = "507f1f77bcf86cd799439012";
const eligibleUserId = "507f1f77bcf86cd799439013";
const adminUserId = "507f1f77bcf86cd799439014";
const suspendedUserId = "507f1f77bcf86cd799439015";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = currentUserId;
    next();
  },
  optionalVerifyToken: (_req, _res, next) => next(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  exists: jest.fn(),
  bulkWrite: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  aggregate: jest.fn(),
}));

jest.mock("../../models/Live.js", () => ({
  find: jest.fn(),
}));

jest.mock("../../services/compatibility.service.js", () => ({
  calculateCompatibility: jest.fn(() => ({
    compatibilityScore: 42,
    sharedInterests: ["music"],
  })),
}));

jest.mock("../../lib/cloudinary.js", () => ({
  uploadProfilePhoto: jest.fn(),
}));

const userRoutes = require("../user.routes.js");

const makeApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/user", userRoutes);
  return app;
};

const makeFindByIdChain = (value) => ({
  select: jest.fn().mockResolvedValue(value),
});

const makeLiveFindChain = (value) => ({
  populate: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(value),
    })),
  })),
});

const objectId = (id) => new mongoose.Types.ObjectId(id);
const sameId = (left, right) => String(left) === String(right);

const valueMatches = (value, condition) => {
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    if (condition.$nin) return !condition.$nin.some((id) => sameId(value, id));
    if (condition.$ne !== undefined) {
      if (Array.isArray(value)) return !value.some((item) => sameId(item, condition.$ne));
      return !sameId(value, condition.$ne);
    }
    if (condition.$in) return condition.$in.includes(value);
  }
  return value === condition;
};

const candidateMatches = (candidate, match) => {
  const clauses = match.$and || [];
  const directMatch = Object.entries(match).every(([field, condition]) => {
    if (field === "$and") return true;
    return valueMatches(candidate[field], condition);
  });
  return directMatch && clauses.every((clause) => candidateMatches(candidate, clause));
};

const makeUser = (overrides = {}) => ({
  _id: objectId(eligibleUserId),
  username: "eligible",
  name: "Eligible User",
  avatar: "https://example.com/eligible.jpg",
  profilePhotos: ["https://example.com/eligible.jpg"],
  gender: "female",
  interestedIn: "both",
  interests: ["music", "travel"],
  intent: "dating",
  role: "user",
  onboardingComplete: true,
  isBlocked: false,
  isSuspended: false,
  blockedUsers: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

describe("GET /api/user/discover", () => {
  let app;
  let candidates;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
    candidates = [];
    User.findById.mockReturnValue(makeFindByIdChain({
      _id: objectId(currentUserId),
      interests: ["music"],
      intent: "dating",
      interestedIn: "both",
      blockedUsers: [],
    }));
    User.aggregate.mockImplementation(async (pipeline) => {
      const match = pipeline.find((stage) => stage.$match)?.$match || {};
      const limit = pipeline.find((stage) => stage.$limit)?.$limit || candidates.length;
      return candidates.filter((candidate) => candidateMatches(candidate, match)).slice(0, limit);
    });
    Live.find.mockReturnValue(makeLiveFindChain([]));
  });

  test("excludes a user blocked by the viewer", async () => {
    User.findById.mockReturnValue(makeFindByIdChain({
      _id: objectId(currentUserId),
      interests: ["music"],
      intent: "dating",
      interestedIn: "both",
      blockedUsers: [objectId(blockedUserId)],
    }));
    candidates = [
      makeUser({ _id: objectId(blockedUserId), username: "blocked-by-viewer" }),
      makeUser({ _id: objectId(eligibleUserId), username: "eligible" }),
    ];

    const res = await request(app).get("/api/user/discover");

    expect(res.status).toBe(200);
    expect(res.body.users.map((user) => user.username)).toEqual(["eligible"]);
  });

  test("excludes a user who blocked the viewer", async () => {
    candidates = [
      makeUser({
        _id: objectId(blockedUserId),
        username: "blocked-viewer",
        blockedUsers: [objectId(currentUserId)],
      }),
      makeUser({ _id: objectId(eligibleUserId), username: "eligible" }),
    ];

    const res = await request(app).get("/api/user/discover");

    expect(res.status).toBe(200);
    expect(res.body.users.map((user) => user.username)).toEqual(["eligible"]);
  });

  test("excludes a user when both users blocked each other", async () => {
    User.findById.mockReturnValue(makeFindByIdChain({
      _id: objectId(currentUserId),
      interests: ["music"],
      intent: "dating",
      interestedIn: "both",
      blockedUsers: [objectId(blockedUserId)],
    }));
    candidates = [
      makeUser({
        _id: objectId(blockedUserId),
        username: "mutual-block",
        blockedUsers: [objectId(currentUserId)],
      }),
      makeUser({ _id: objectId(eligibleUserId), username: "eligible" }),
    ];

    const res = await request(app).get("/api/user/discover");

    expect(res.status).toBe(200);
    expect(res.body.users.map((user) => user.username)).toEqual(["eligible"]);
  });

  test("returns an eligible unblocked user and preserves the response contract", async () => {
    candidates = [makeUser({ _id: objectId(eligibleUserId), username: "eligible" })];

    const res = await request(app).get("/api/user/discover?page=1&limit=10");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      limit: 10,
      users: [
        expect.objectContaining({
          username: "eligible",
          isLive: false,
          liveId: null,
          compatibilityScore: 42,
          sharedInterests: ["music"],
        }),
      ],
    });
  });

  test("preserves current staff, blocked, onboarding, and suspension filters", async () => {
    candidates = [
      makeUser({ _id: objectId(adminUserId), username: "admin", role: "admin" }),
      makeUser({ _id: objectId(blockedUserId), username: "blocked", isBlocked: true }),
      makeUser({ _id: objectId("507f1f77bcf86cd799439016"), username: "incomplete", onboardingComplete: false }),
      makeUser({ _id: objectId(suspendedUserId), username: "suspended", isSuspended: true }),
      makeUser({ _id: objectId(eligibleUserId), username: "eligible" }),
    ];

    const res = await request(app).get("/api/user/discover");
    const match = User.aggregate.mock.calls[0][0][0].$match;

    expect(res.status).toBe(200);
    expect(match).toMatchObject({
      isBlocked: false,
      onboardingComplete: true,
      role: { $nin: expect.arrayContaining(["admin"]) },
    });
    expect(match).not.toHaveProperty("isSuspended");
    expect(res.body.users.map((user) => user.username)).toEqual(["suspended", "eligible"]);
  });
});
