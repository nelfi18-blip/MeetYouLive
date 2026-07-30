const express = require("express");
const request = require("supertest");

const mockVerifyToken = jest.fn((req, _res, next) => next());
const mockUpdatePayout = jest.fn((req, res) => res.json({ ok: true, permission: req.requiredPermission }));
const mockRequirePermission = jest.fn((permission) => (req, _res, next) => {
  req.requiredPermission = permission;
  next();
});

jest.mock("express-rate-limit", () => () => (_req, _res, next) => next());

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: mockVerifyToken,
}));

jest.mock("../../middlewares/admin.middleware.js", () => ({
  requireAdmin: jest.fn((_req, _res, next) => next()),
  requireModeratorOrAdmin: jest.fn((_req, _res, next) => next()),
  requirePermission: mockRequirePermission,
}));

jest.mock("../../controllers/admin.controller.js", () => ({
  getOverview: jest.fn(),
  getUsers: jest.fn(),
  getReports: jest.fn(),
  updateReport: jest.fn(),
  makeAdmin: jest.fn(),
  getCreatorRequests: jest.fn(),
  approveCreator: jest.fn(),
  rejectCreator: jest.fn(),
  suspendCreator: jest.fn(),
  reactivateCreator: jest.fn(),
  getCreators: jest.fn(),
  getCreatorDetail: jest.fn(),
  getVerificationRequests: jest.fn(),
  verifyUser: jest.fn(),
  getActiveLives: jest.fn(),
  getLiveHistory: jest.fn(),
  getTransactions: jest.fn(),
  suspendUser: jest.fn(),
  unsuspendUser: jest.fn(),
  getAnalytics: jest.fn(),
  getRevenueMetrics: jest.fn(),
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
  getMetricsOverview: jest.fn(),
  hardDeleteUser: jest.fn(),
  getPayouts: jest.fn(),
  updatePayout: mockUpdatePayout,
  verifyUserEmailByAdmin: jest.fn(),
  getEmailVerificationDiagnostics: jest.fn(),
}));

jest.mock("../../controllers/withdraw.controller.js", () => ({
  listWithdrawals: jest.fn(),
  approveWithdrawal: jest.fn(),
  rejectWithdrawal: jest.fn(),
}));

jest.mock("../../controllers/feed.controller.js", () => ({
  getFeedDiagnostics: jest.fn(),
}));

jest.mock("../../controllers/analytics.controller.js", () => ({
  getGrowthAnalytics: jest.fn(),
}));

const adminRoutes = require("../admin.routes.js");

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRoutes);
  return app;
};

describe("PATCH /api/admin/payouts/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("registers a single route protected by UPDATE_PAYOUTS and handled by updatePayout", async () => {
    const payoutPatchRoutes = adminRoutes.stack.filter(
      (layer) => layer.route?.path === "/payouts/:id" && layer.route.methods.patch
    );

    expect(payoutPatchRoutes).toHaveLength(1);
    const res = await request(makeApp())
      .patch("/api/admin/payouts/507f1f77bcf86cd799439011")
      .send({ action: "approve" });

    expect(res.status).toBe(200);
    expect(res.body.permission).toBe("UPDATE_PAYOUTS");
    expect(mockVerifyToken).toHaveBeenCalledTimes(1);
    expect(mockUpdatePayout).toHaveBeenCalledTimes(1);
  });
});
