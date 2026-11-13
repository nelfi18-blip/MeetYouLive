const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const Live = require("../../models/Live.js");
const { getOnlineUsers } = require("../../lib/socket.js");

const currentUserId = "507f1f77bcf86cd799439011";
const targetUserId = "507f1f77bcf86cd799439012";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "No autorizado" });
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
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  aggregate: jest.fn(),
  exists: jest.fn(),
}));

jest.mock("../../lib/socket.js", () => ({
  getOnlineUsers: jest.fn(),
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
      name: "Target",
      publicName: "Target",
      isLive: false,
      liveId: null,
    });
  });

  test("requires login for profile details even when the URL is known", async () => {
    const res = await request(app).get(`/api/user/${targetUserId}/public`);

    expect(res.status).toBe(401);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test("does not expose private fields in the public profile response", async () => {
    const res = await request(app)
      .get(`/api/user/${targetUserId}/public`)
      .set("Authorization", "******");

    expect(res.status).toBe(200);
    expect(res.body.email).toBeUndefined();
    expect(res.body.password).toBeUndefined();
    expect(res.body.blockedUsers).toBeUndefined();
    expect(res.body.username).toBeUndefined();
    expect(res.body.name).toBe("Target");
    expect(JSON.stringify(res.body)).not.toContain("Target User");
  });
});

test("public profiles never reveal raw GPS but preserve city and country", async () => {
  const user = makePublicUser({ location: {
    type: "Point", country: "Estados Unidos", city: "Boston",
    region: "Massachusetts", label: "Boston, Massachusetts",
    coordinates: [-71.06, 42.36],
  } });
  User.findOne.mockReturnValue(makeFindOneChain(user));
  Live.findOne.mockReturnValue(makeLiveFindOneChain(null));
  const res = await request(makeApp()).get("/api/user/" + targetUserId + "/public").set("Authorization", "Bearer test");
  expect(res.status).toBe(200);
  expect(res.body.location).toEqual({
    country: "Estados Unidos", city: "Boston",
    region: "Massachusetts", label: "Boston, Massachusetts",
  });
  expect(JSON.stringify(res.body)).not.toContain("-71.06");
  expect(JSON.stringify(res.body)).not.toContain("42.36");
});

describe("GET /api/user/online GPS privacy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOnlineUsers.mockReturnValue([{ userId: targetUserId, lastSeen: 123456 }]);
  });

  test("online users expose city/country but never private coordinates", async () => {
    User.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: targetUserId,
          name: "Target User",
          location: {
            type: "Point", country: "Estados Unidos", city: "Boston",
            region: "Massachusetts", label: "Boston, Massachusetts",
            coordinates: [-71.06, 42.36],
          },
        },
      ]),
    });
    const response = await request(makeApp()).get("/api/user/online").set("Authorization", "Bearer test");
    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0]).toMatchObject({
      name: "Target", isOnline: true, lastSeen: 123456,
      location: {
        country: "Estados Unidos", city: "Boston", region: "Massachusetts",
        label: "Boston, Massachusetts",
      },
    });
    const json = JSON.stringify(response.body);
    expect(json).not.toContain("-71.06");
    expect(json).not.toContain("42.36");
    expect(json).not.toContain("coordinates");
    expect(json).not.toContain("locationPoint");
  });

  test("empty online presence does not query or disclose other accounts", async () => {
    getOnlineUsers.mockReturnValue([]);
    const response = await request(makeApp()).get("/api/user/online").set("Authorization", "Bearer test");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ users: [] });
    expect(User.find).not.toHaveBeenCalled();
  });

  test("legacy text-only location remains readable and coordinate-free", async () => {
    User.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: targetUserId, location: "Boston, Estados Unidos" }]),
    });
    const response = await request(makeApp()).get("/api/user/online").set("Authorization", "Bearer test");
    expect(response.status).toBe(200);
    expect(response.body.users[0].location).toBe("Boston, Estados Unidos");
  });
});
