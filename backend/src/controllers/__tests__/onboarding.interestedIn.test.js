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

const BASE_BODY = {
  name: "New User",
  birthdate: "2000-01-01",
  gender: "female",
  intent: "dating",
  interests: ["music", "travel", "gaming"],
  location: {
    type: "Point",
    coordinates: [-70.6693, -33.4489],
    country: "Chile",
    city: "Santiago",
  },
  images: [{ url: "https://example.com/photo.jpg", isPrimary: true }],
  profilePhotos: ["https://example.com/photo.jpg"],
  avatar: "https://example.com/photo.jpg",
};

const makeCurrentUser = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439099",
  role: "user",
  isBlocked: false,
  isSuspended: false,
  images: [],
  profilePhotos: [],
  avatar: "",
  interestedIn: "both",
  interestedInConfirmed: false,
  ...overrides,
  toObject() {
    return { ...this };
  },
  set(updates) {
    Object.assign(this, updates);
  },
  save: jest.fn(async function save() {
    return this;
  }),
});

const req = (body, currentUser) => ({
  userId: currentUser._id,
  protocol: "https",
  get(name) {
    return name.toLowerCase() === "host" ? "meetyoulive.onrender.com" : "";
  },
  body,
});

describe("onboarding mandatory interestedIn selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("blocks onboarding completion for a new user who never selects a preference", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });

    const res = makeResponse();
    await updateOnboarding(req({ ...BASE_BODY }, currentUser), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingComplete: false,
        missingFields: expect.arrayContaining(["interestedIn"]),
      })
    );
    expect(currentUser.interestedInConfirmed).toBe(false);
  });

  test("completes onboarding once an explicit 'both' selection is submitted", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });

    const res = makeResponse();
    await updateOnboarding(req({ ...BASE_BODY, interestedIn: "both" }, currentUser), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingComplete: true })
    );
    expect(currentUser.interestedInConfirmed).toBe(true);
    expect(currentUser.interestedIn).toBe("both");
  });

  test("accepts legacy 'women'/'men' aliases as an explicit confirmed selection", async () => {
    const currentUser = makeCurrentUser();
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });

    const res = makeResponse();
    await updateOnboarding(req({ ...BASE_BODY, interestedIn: "women" }, currentUser), res);

    expect(currentUser.interestedIn).toBe("female");
    expect(currentUser.interestedInConfirmed).toBe(true);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingComplete: true })
    );
  });

  test("an already-confirmed existing user can re-save onboarding without resubmitting the preference", async () => {
    const currentUser = makeCurrentUser({ interestedIn: "male", interestedInConfirmed: true });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });

    const res = makeResponse();
    await updateOnboarding(req({ ...BASE_BODY }, currentUser), res);

    expect(currentUser.interestedIn).toBe("male");
    expect(currentUser.interestedInConfirmed).toBe(true);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingComplete: true })
    );
  });

  test("changing the preference later re-confirms the new explicit choice", async () => {
    const currentUser = makeCurrentUser({ interestedIn: "male", interestedInConfirmed: true });
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(currentUser) });

    const res = makeResponse();
    await updateOnboarding(req({ ...BASE_BODY, interestedIn: "female" }, currentUser), res);

    expect(currentUser.interestedIn).toBe("female");
    expect(currentUser.interestedInConfirmed).toBe(true);
  });
});
