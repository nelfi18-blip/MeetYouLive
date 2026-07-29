jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

jest.mock("../../services/analytics.service.js", () => ({
  trackSafeAnalyticsEvent: jest.fn(),
}));

const User = require("../../models/User.js");
const { updateOnboarding } = require("../onboarding.controller.js");

const makeResponse = () => {
  const res = {
    statusCode: 200,
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

describe("creator onboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("marks a complete creator profile as onboarded without making it feed eligible", async () => {
    const currentUser = {
      _id: "507f1f77bcf86cd799439011",
      email: "creator@example.com",
      role: "creator",
      creatorStatus: "pending",
      isBlocked: false,
      isSuspended: false,
      images: [],
      profilePhotos: [],
      avatar: "",
      toObject() {
        return { ...this };
      },
      set(updates) {
        Object.assign(this, updates);
      },
      save: jest.fn(async function save() {
        return this;
      }),
    };
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(currentUser),
    });

    const req = {
      userId: currentUser._id,
      protocol: "https",
      get(name) {
        return name.toLowerCase() === "host" ? "meetyoulive.onrender.com" : "";
      },
      body: {
        name: "Creator User",
        birthdate: "2000-01-01",
        gender: "female",
        interestedIn: "both",
        intent: "creator",
        interests: ["music", "travel", "gaming"],
        location: {
          type: "Point",
          coordinates: [-70.6693, -33.4489],
          country: "Chile",
          city: "Santiago",
        },
        images: [{ url: "https://example.com/creator-photo.jpg", isPrimary: true }],
        profilePhotos: ["https://example.com/creator-photo.jpg"],
        avatar: "https://example.com/creator-photo.jpg",
      },
    };
    const res = makeResponse();

    await updateOnboarding(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        onboardingComplete: true,
        canAppearInFeed: false,
        user: expect.objectContaining({
          role: "creator",
          creatorStatus: "pending",
          onboardingComplete: true,
          profilePhotos: ["https://example.com/creator-photo.jpg"],
        }),
      })
    );
    expect(currentUser.save).toHaveBeenCalled();
  });

  test("approved creator onboarding ignores manipulated creator classification fields", async () => {
    const currentUser = {
      _id: "507f1f77bcf86cd799439012",
      role: "creator",
      creatorStatus: "approved",
      isVerifiedCreator: true,
      creatorApprovedAt: new Date("2026-01-01T00:00:00.000Z"),
      authProvider: "google",
      emailVerified: true,
      coins: 500,
      earningsCoins: 200,
      creatorProfile: { displayName: "Creator", liveEnabled: true },
      isBlocked: false,
      isSuspended: false,
      images: [{ url: "https://example.com/current.jpg", isPrimary: true }],
      profilePhotos: ["https://example.com/current.jpg"],
      avatar: "https://example.com/current.jpg",
      toObject() {
        return { ...this };
      },
      set(updates) {
        Object.assign(this, updates);
      },
      save: jest.fn(async function save() {
        return this;
      }),
    };
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(currentUser),
    });

    const req = {
      userId: currentUser._id,
      protocol: "https",
      get(name) {
        return name.toLowerCase() === "host" ? "meetyoulive.onrender.com" : "";
      },
      body: {
        name: "Creator Updated",
        birthdate: "2000-01-01",
        gender: "female",
        interestedIn: "both",
        intent: "creator",
        interests: ["music", "travel", "gaming"],
        location: { type: "Point", coordinates: [-70.6693, -33.4489], country: "Chile" },
        role: "user",
        creatorStatus: "none",
        isVerifiedCreator: false,
        creatorProfile: {},
        authProvider: "local",
        emailVerified: false,
        coins: 0,
        earningsCoins: 0,
      },
    };
    const res = makeResponse();

    await updateOnboarding(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(currentUser.save).toHaveBeenCalled();
    expect(currentUser).toMatchObject({
      role: "creator",
      creatorStatus: "approved",
      isVerifiedCreator: true,
      authProvider: "google",
      emailVerified: true,
      coins: 500,
      earningsCoins: 200,
      creatorProfile: { displayName: "Creator", liveEnabled: true },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          role: "creator",
          creatorStatus: "approved",
        }),
      })
    );
  });
});
