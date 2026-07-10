const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const Like = require("../../models/Like.js");
const Report = require("../../models/Report.js");

const currentUserId = "507f1f77bcf86cd799439011";
const targetUserId = "507f1f77bcf86cd799439012";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = currentUserId;
    next();
  },
}));

jest.mock("../../middlewares/admin.middleware.js", () => ({
  requireAdmin: (_req, _res, next) => next(),
  requireModeratorOrAdmin: (_req, _res, next) => next(),
}));

jest.mock("../../services/audit.service.js", () => ({
  logStaffAction: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock("../../models/Like.js", () => ({
  deleteMany: jest.fn(),
}));

jest.mock("../../models/Report.js", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

const moderationRoutes = require("../moderation.routes.js");

const makeApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/moderation", moderationRoutes);
  return app;
};

const makeFindByIdChain = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value),
  })),
});

describe("moderation user blocking", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
    User.findById.mockReturnValue(makeFindByIdChain({ _id: targetUserId }));
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Like.deleteMany.mockResolvedValue({ deletedCount: 2 });
  });

  test("blocks a user and removes likes in both directions", async () => {
    const res = await request(app).post(`/api/moderation/users/${targetUserId}/block`).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, blockedUserId: targetUserId });
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: currentUserId },
      { $addToSet: { blockedUsers: targetUserId } }
    );
    expect(Like.deleteMany).toHaveBeenCalledWith({
      $or: [
        { from: currentUserId, to: targetUserId },
        { from: targetUserId, to: currentUserId },
      ],
    });
  });

  test("double block remains idempotent through addToSet", async () => {
    await request(app).post(`/api/moderation/users/${targetUserId}/block`).send({});
    const res = await request(app).post(`/api/moderation/users/${targetUserId}/block`).send({});

    expect(res.status).toBe(200);
    expect(User.updateOne).toHaveBeenCalledTimes(2);
    expect(User.updateOne).toHaveBeenLastCalledWith(
      { _id: currentUserId },
      { $addToSet: { blockedUsers: targetUserId } }
    );
  });

  test("rejects self block", async () => {
    const res = await request(app).post(`/api/moderation/users/${currentUserId}/block`).send({});

    expect(res.status).toBe(400);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(Like.deleteMany).not.toHaveBeenCalled();
  });

  test("rejects self report", async () => {
    const res = await request(app).post("/api/moderation/report").send({
      targetType: "user",
      targetId: currentUserId,
      reason: "Other",
    });

    expect(res.status).toBe(400);
    expect(Report.create).not.toHaveBeenCalled();
  });
});
