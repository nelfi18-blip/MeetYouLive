const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = "507f1f77bcf86cd799439011";
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
}));

const userRoutes = require("../user.routes.js");

const makeQuery = (value) => ({
  select: jest.fn().mockResolvedValue(value),
});

const makeBaseUser = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  name: "Discovery User",
  avatar: "/uploads/avatar.png",
  profilePhotos: ["/uploads/avatar.png"],
  images: [{ url: "/uploads/avatar.png", isPrimary: true }],
  onboardingComplete: true,
  birthdate: new Date("2000-01-01T00:00:00.000Z"),
  location: { type: "Point", coordinates: [-70.6693, -33.4489], country: "Chile", city: "Santiago" },
  locationPoint: { type: "Point", coordinates: [-70.6693, -33.4489] },
  gender: "female",
  interestedIn: "both",
  interestedInConfirmed: false,
  intent: "dating",
  interests: ["music", "travel", "movies"],
  role: "user",
  isBlocked: false,
  isSuspended: false,
  toObject() {
    return { ...this };
  },
  ...overrides,
});

describe("Discovery preference persistence via settings endpoints", () => {
  let app;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use("/api/user", userRoutes);
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe.each([
    ["PATCH /api/user/me", "/api/user/me"],
    ["PATCH /api/user/me/onboarding", "/api/user/me/onboarding"],
  ])("%s", (_label, endpoint) => {
    test("persists interestedInConfirmed=true when an explicit valid selection is submitted", async () => {
      const user = makeBaseUser();
      User.findById.mockReturnValueOnce(makeQuery(user));
      User.findOne.mockResolvedValue(null);
      User.findByIdAndUpdate.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue(
          makeBaseUser({ interestedIn: "women", interestedInConfirmed: true })
        ),
      });

      const res = await request(app)
        .patch(endpoint)
        .set("Authorization", "******")
        .send({ interestedIn: "women" });

      expect(res.status).toBe(200);
      const updatePayload = User.findByIdAndUpdate.mock.calls[0][1];
      expect(updatePayload.interestedIn).toBe("women");
      expect(updatePayload.interestedInConfirmed).toBe(true);
    });

    test("selecting 'both' explicitly is persisted as a confirmed choice", async () => {
      const user = makeBaseUser();
      User.findById.mockReturnValueOnce(makeQuery(user));
      User.findOne.mockResolvedValue(null);
      User.findByIdAndUpdate.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue(
          makeBaseUser({ interestedIn: "both", interestedInConfirmed: true })
        ),
      });

      const res = await request(app)
        .patch(endpoint)
        .set("Authorization", "******")
        .send({ interestedIn: "both" });

      expect(res.status).toBe(200);
      const updatePayload = User.findByIdAndUpdate.mock.calls[0][1];
      expect(updatePayload.interestedIn).toBe("both");
      expect(updatePayload.interestedInConfirmed).toBe(true);
    });

    test("an empty selection clears interestedInConfirmed instead of defaulting to a confirmed 'both'", async () => {
      const user = makeBaseUser({ interestedIn: "male", interestedInConfirmed: true });
      User.findById.mockReturnValueOnce(makeQuery(user));
      User.findOne.mockResolvedValue(null);
      User.findByIdAndUpdate.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue(
          makeBaseUser({ interestedIn: "both", interestedInConfirmed: false })
        ),
      });

      const res = await request(app)
        .patch(endpoint)
        .set("Authorization", "******")
        .send({ interestedIn: "" });

      expect(res.status).toBe(200);
      const updatePayload = User.findByIdAndUpdate.mock.calls[0][1];
      expect(updatePayload.interestedIn).toBe("both");
      expect(updatePayload.interestedInConfirmed).toBe(false);
    });

    test("an invalid value is ignored and never marks the preference as confirmed", async () => {
      const user = makeBaseUser();
      User.findById.mockReturnValueOnce(makeQuery(user));
      User.findOne.mockResolvedValue(null);
      User.findByIdAndUpdate.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue(makeBaseUser()),
      });

      const res = await request(app)
        .patch(endpoint)
        .set("Authorization", "******")
        .send({ interestedIn: "not-a-real-option" });

      expect(res.status).toBe(200);
      const updatePayload = User.findByIdAndUpdate.mock.calls[0][1];
      expect(updatePayload).not.toHaveProperty("interestedIn");
      expect(updatePayload).not.toHaveProperty("interestedInConfirmed");
    });

    test("omitting the field entirely leaves the existing confirmation state untouched", async () => {
      const user = makeBaseUser({ interestedIn: "male", interestedInConfirmed: true });
      User.findById.mockReturnValueOnce(makeQuery(user));
      User.findOne.mockResolvedValue(null);
      User.findByIdAndUpdate.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue(user),
      });

      const res = await request(app)
        .patch(endpoint)
        .set("Authorization", "******")
        .send({ bio: "Just updating my bio" });

      expect(res.status).toBe(200);
      const updatePayload = User.findByIdAndUpdate.mock.calls[0][1];
      expect(updatePayload).not.toHaveProperty("interestedIn");
      expect(updatePayload).not.toHaveProperty("interestedInConfirmed");
    });
  });
});
