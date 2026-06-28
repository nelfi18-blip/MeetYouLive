jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
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
});
