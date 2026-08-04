const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const Live = require("../../models/Live.js");

const currentUserId = "507f1f77bcf86cd799439011";
const targetUserId = "507f1f77bcf86cd799439012";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = currentUserId;
    next();
  },
  optionalVerifyToken: (req, _res, next) => {
    if (req.headers.authorization) {
      req.userId = currentUserId;
    }
    next();
  },
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  aggregate: jest.fn(),
  exists: jest.fn(),
}));

jest.mock("../../models/Live.js", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
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

const pickSelectedFields = (value, fields) => {
  if (!value || !fields) return value;
  const selected = new Set(fields.split(/\s+/).filter(Boolean));
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key === "_id" || selected.has(key))
  );
};

const makeFindOneChain = (value) => ({
  select: jest.fn((fields) => ({
    lean: jest.fn().mockResolvedValue(pickSelectedFields(value, fields)),
  })),
});

const makeFindByIdChain = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value),
  })),
});

const makeLiveFindOneChain = (value) => ({
  populate: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(value),
    })),
  })),
});

const makePublicUser = (overrides = {}) => ({
  _id: targetUserId,
  username: "target",
  name: "Target User",
  displayName: "Target",
  avatar: "https://example.com/avatar.jpg",
  profilePhotos: ["https://example.com/avatar.jpg"],
  bio: "Public bio",
  role: "user",
  isBlocked: false,
  isSuspended: false,
  email: "private@example.com",
  password: "hashed-password",
  blockedUsers: [],
  ...overrides,
});

describe("GET /api/user/:id/public blocking", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
    User.findOne.mockReturnValue(makeFindOneChain(makePublicUser()));
    User.findById.mockImplementation((id) => {
      if (String(id) === currentUserId) {
        return makeFindByIdChain({ _id: currentUserId, blockedUsers: [] });
      }
      if (String(id) === targetUserId) {
        return makeFindByIdChain({ _id: targetUserId, blockedUsers: [] });
      }
      return makeFindByIdChain(null);
    });
    Live.findOne.mockReturnValue(makeLiveFindOneChain(null));
  });

  test("rejects public profile access when the viewer blocked the target", async () => {
    User.findById.mockImplementation((id) => {
      if (String(id) === currentUserId) {
        return makeFindByIdChain({ _id: currentUserId, blockedUsers: [targetUserId] });
      }
      if (String(id) === targetUserId) {
        return makeFindByIdChain({ _id: targetUserId, blockedUsers: [] });
      }
      return makeFindByIdChain(null);
    });

    const res = await request(app)
      .get(`/api/user/${targetUserId}/public`)
      .set("Authorization", "******");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "No puedes ver este perfil" });
    expect(Live.findOne).not.toHaveBeenCalled();
  });

  test("rejects public profile access when the target blocked the viewer", async () => {
    User.findById.mockImplementation((id) => {
      if (String(id) === currentUserId) {
        return makeFindByIdChain({ _id: currentUserId, blockedUsers: [] });
      }
      if (String(id) === targetUserId) {
        return makeFindByIdChain({ _id: targetUserId, blockedUsers: [currentUserId] });
      }
      return makeFindByIdChain(null);
    });

    const res = await request(app)
      .get(`/api/user/${targetUserId}/public`)
      .set("Authorization", "******");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "No puedes ver este perfil" });
    expect(Live.findOne).not.toHaveBeenCalled();
  });

  test("returns the public profile when there is no block", async () => {
    const res = await request(app)
      .get(`/api/user/${targetUserId}/public`)
      .set("Authorization", "******");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      _id: targetUserId,
      username: "target",
      name: "Target User",
      isLive: false,
      liveId: null,
    });
  });

  test("preserves anonymous public profile access", async () => {
    const res = await request(app).get(`/api/user/${targetUserId}/public`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("target");
    expect(User.findById).not.toHaveBeenCalled();
  });

  test("does not expose private fields in the public profile response", async () => {
    const res = await request(app)
      .get(`/api/user/${targetUserId}/public`)
      .set("Authorization", "******");

    expect(res.status).toBe(200);
    expect(res.body.email).toBeUndefined();
    expect(res.body.password).toBeUndefined();
    expect(res.body.blockedUsers).toBeUndefined();
  });
});
