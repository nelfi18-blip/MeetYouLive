const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const PlatformSettings = require("../../models/PlatformSettings.js");
const { requireAdmin } = require("../../middlewares/admin.middleware.js");
const { getSettings, updateSettings } = require("../../controllers/admin.controller.js");

const adminUserId = "507f1f77bcf86cd799439011";

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

jest.mock("../../models/PlatformSettings.js", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const makeUserRole = (role) => ({
  select: jest.fn().mockResolvedValue({ _id: adminUserId, role }),
});

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = adminUserId;
    next();
  });
  app.get("/api/admin/settings", requireAdmin, getSettings);
  app.patch("/api/admin/settings", requireAdmin, updateSettings);
  return app;
};

describe("admin persistent settings endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PlatformSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    PlatformSettings.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        boostPriceCrush: 50,
        chatProtection: {
          chatProtectionEnabled: true,
          blockPhones: false,
          minimumMessages: 5,
          trustRuleMode: "any",
        },
      }),
    });
  });

  test("rejects non-admin updates", async () => {
    User.findById.mockReturnValue(makeUserRole("user"));

    const res = await request(makeApp())
      .patch("/api/admin/settings")
      .send({ chatProtection: { blockPhones: false } });

    expect(res.status).toBe(403);
    expect(PlatformSettings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("allows admin updates and reads persisted settings", async () => {
    User.findById.mockReturnValue(makeUserRole("admin"));

    const updateRes = await request(makeApp())
      .patch("/api/admin/settings")
      .send({ chatProtection: { blockPhones: false, minimumMessages: 5, trustRuleMode: "any" } });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.settings.chatProtection.blockPhones).toBe(false);
    expect(PlatformSettings.findOneAndUpdate).toHaveBeenCalled();
  });
});
