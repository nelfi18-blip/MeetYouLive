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
  updateMany: jest.fn(),
  updateOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  exists: jest.fn(),
  bulkWrite: jest.fn(),
  find: jest.fn(),
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

function makeUser(pushTokens = []) {
  return {
    pushToken: null,
    pushTokens,
    pushTokenPlatform: null,
    pushTokenDeviceId: null,
    pushTokenPermissionStatus: null,
    pushTokenUpdatedAt: null,
    save: jest.fn().mockResolvedValue(true),
  };
}

describe("PATCH /api/user/me/push-token", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.updateMany.mockResolvedValue({});
  });

  test("registers an Android token once per device and removes it from other users", async () => {
    const user = makeUser([{ token: "old-token", platform: "android", deviceId: "device-1" }]);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(makeApp())
      .patch("/api/user/me/push-token")
      .send({
        pushToken: "new-token",
        platform: "android",
        deviceId: "device-1",
        permissionStatus: "granted",
      });

    expect(res.status).toBe(200);
    expect(User.updateMany).toHaveBeenCalledWith(
      { _id: { $ne: "507f1f77bcf86cd799439011" }, "pushTokens.token": "new-token" },
      { $pull: { pushTokens: { token: "new-token" } } }
    );
    expect(user.pushTokens).toEqual([
      expect.objectContaining({ token: "new-token", platform: "android", deviceId: "device-1" }),
    ]);
    expect(user.save).toHaveBeenCalled();
  });

  test("logout unlinks the current device token without clearing other devices", async () => {
    const user = makeUser([
      { token: "device-1-token", platform: "android", deviceId: "device-1" },
      { token: "device-2-token", platform: "android", deviceId: "device-2" },
    ]);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = await request(makeApp())
      .patch("/api/user/me/push-token")
      .send({ pushToken: null, platform: "android", deviceId: "device-1", permissionStatus: "prompt" });

    expect(res.status).toBe(200);
    expect(user.pushTokens).toEqual([
      { token: "device-2-token", platform: "android", deviceId: "device-2" },
    ]);
    expect(user.save).toHaveBeenCalled();
  });
});
