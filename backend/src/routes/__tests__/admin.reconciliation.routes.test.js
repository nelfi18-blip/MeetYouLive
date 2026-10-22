"use strict";

/**
 * Route-level permission tests for GET /api/admin/reconciliation/coins.
 * Verifies it is admin-only (does NOT allow "finance", unlike VIEW_REVENUE),
 * using the REAL auth.middleware + admin.middleware (requireAdmin), with
 * User.findById mocked (no real DB/Stripe access).
 */

const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");

const adminId = "507f1f77bcf86cd799439011";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = req.get("x-test-user-id") || adminId;
    next();
  },
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

jest.mock("../../services/stripeReconciliation.service.js", () => ({
  reconcileCoinPurchases: jest.fn().mockResolvedValue({ ok: true, complete: true, results: {} }),
  ReconciliationValidationError: class extends Error {},
  isStripeConfigured: () => true,
}));

const adminRoutes = require("../admin.routes.js");

const makeApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/admin", adminRoutes);
  return app;
};

const mockRoleLookup = (role) => {
  User.findById.mockReturnValueOnce({
    select: jest.fn().mockResolvedValue(role ? { role } : null),
  });
};

describe("GET /api/admin/reconciliation/coins — permissions", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  test("admin role is allowed", async () => {
    mockRoleLookup("admin");
    const res = await request(app)
      .get("/api/admin/reconciliation/coins")
      .query({ startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" })
      .set("x-test-user-id", adminId);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("finance role is denied (unlike VIEW_REVENUE/requirePermission)", async () => {
    mockRoleLookup("finance");
    const res = await request(app)
      .get("/api/admin/reconciliation/coins")
      .query({ startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" })
      .set("x-test-user-id", "finance-user");

    expect(res.status).toBe(403);
  });

  test("moderator role is denied", async () => {
    mockRoleLookup("moderator");
    const res = await request(app)
      .get("/api/admin/reconciliation/coins")
      .query({ startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" })
      .set("x-test-user-id", "moderator-user");

    expect(res.status).toBe(403);
  });

  test("regular user role is denied", async () => {
    mockRoleLookup("user");
    const res = await request(app)
      .get("/api/admin/reconciliation/coins")
      .query({ startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" })
      .set("x-test-user-id", "regular-user");

    expect(res.status).toBe(403);
  });

  test("unknown user is denied", async () => {
    mockRoleLookup(null);
    const res = await request(app)
      .get("/api/admin/reconciliation/coins")
      .query({ startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-02-01T00:00:00.000Z" })
      .set("x-test-user-id", "ghost-user");

    expect(res.status).toBe(403);
  });
});
