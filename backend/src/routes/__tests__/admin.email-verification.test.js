const express = require("express");
const request = require("supertest");
const User = require("../../models/User.js");
const { logStaffAction } = require("../../services/audit.service.js");

const adminId = "507f1f77bcf86cd799439011";
const targetUserId = "507f1f77bcf86cd799439012";

jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = req.get("x-test-user-id") || adminId;
    req.userRole = req.get("x-test-role") || "admin";
    next();
  },
}));

jest.mock("../../services/audit.service.js", () => ({
  logStaffAction: jest.fn(),
}));

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  updateOne: jest.fn(),
}));

const adminRoutes = require("../admin.routes.js");

const makeApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/admin", adminRoutes);
  return app;
};

const makeSelectChain = (value) => ({
  select: jest.fn().mockResolvedValue(value),
});

const makeLeanSelectChain = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value),
  })),
});

const mockAdminAccess = () => {
  User.findById.mockReturnValueOnce(makeSelectChain({ _id: adminId, role: "admin" }));
};

describe("admin manual email verification", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
    User.countDocuments.mockResolvedValue(0);
    User.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    logStaffAction.mockResolvedValue(undefined);
  });

  test("admin puede verificar manualmente el email", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, authProvider: "local", emailVerified: false }));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: targetUserId, authProvider: "local", emailVerified: false },
      {
        $set: {
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpires: null,
          emailVerificationSentAt: null,
        },
      },
      { timestamps: false }
    );
  });

  test("usuario normal recibe 403", async () => {
    User.findById.mockReturnValueOnce(makeSelectChain({ _id: adminId, role: "user" }));

    const res = await request(app)
      .patch(`/api/admin/users/${targetUserId}/verify-email`)
      .set("x-test-role", "user");

    expect(res.status).toBe(403);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("cuenta inexistente recibe 404", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain(null));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(404);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("cuenta ya verificada no se altera", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, authProvider: "local", emailVerified: true }));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email ya estaba verificado");
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("campos Stripe permanecen intactos", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, authProvider: "local", emailVerified: false }));

    await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    const update = User.updateOne.mock.calls[0][1];
    expect(JSON.stringify(update)).not.toMatch(/stripeCustomerId|stripeAccountId|subscriptionId/i);
  });

  test("OTP, expiración y fecha de envío se limpian", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, authProvider: "local", emailVerified: false }));

    await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(User.updateOne.mock.calls[0][1].$set).toMatchObject({
      emailVerificationCode: null,
      emailVerificationExpires: null,
      emailVerificationSentAt: null,
    });
  });

  test("auditoría se registra sin OTP ni datos Stripe", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, authProvider: "local", emailVerified: false }));

    await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(logStaffAction).toHaveBeenCalledWith(expect.objectContaining({
      staffId: adminId,
      staffRole: "admin",
      action: "EMAIL_VERIFIED_BY_ADMIN",
      targetType: "User",
      targetId: targetUserId,
      targetIdentifier: targetUserId,
      details: { affectedUserId: targetUserId },
    }));
    const auditPayload = logStaffAction.mock.calls[0][0];
    expect(auditPayload).not.toHaveProperty("password");
    expect(auditPayload.details).not.toHaveProperty("password");
    expect(auditPayload.details).not.toHaveProperty("emailVerificationCode");
    expect(auditPayload.details).not.toHaveProperty("emailVerificationExpires");
    expect(auditPayload.details).not.toHaveProperty("stripeCustomerId");
    expect(auditPayload.details).not.toHaveProperty("stripeAccountId");
    expect(auditPayload.details).not.toHaveProperty("subscriptionId");
  });

  test("cuenta Google antigua no puede verificarse manualmente por error", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({
      _id: targetUserId,
      authProvider: "google",
      googleId: "google-123",
      emailVerified: false,
    }));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(400);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("usuario con emailVerified undefined se clasifica de forma segura para verificación manual", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, authProvider: "local" }));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(400);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("listado admin devuelve emailVerified y proveedor explícitos", async () => {
    mockAdminAccess();
    const users = [
      { _id: "local-unverified", email: "local-u@example.com", authProvider: "local", emailVerified: false },
      { _id: "local-verified", email: "local-v@example.com", authProvider: "local", emailVerified: true },
      { _id: "google-user", email: "google@example.com", authProvider: "google", googleId: "google-1", emailVerified: true },
      { _id: "legacy-user", email: "legacy@example.com" },
    ];
    User.find.mockReturnValueOnce({
      sort: jest.fn(() => ({
        skip: jest.fn(() => ({
          limit: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue(users),
          })),
        })),
      })),
    });
    User.countDocuments.mockResolvedValueOnce(users.length);

    const res = await request(app).get("/api/admin/users");

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual(expect.arrayContaining([
      expect.objectContaining({ _id: "local-unverified", authProvider: "local", emailVerified: false, isGoogleAccount: false }),
      expect.objectContaining({ _id: "local-verified", authProvider: "local", emailVerified: true, isGoogleAccount: false }),
      expect.objectContaining({ _id: "google-user", authProvider: "google", emailVerified: true, isGoogleAccount: true }),
      expect.objectContaining({ _id: "legacy-user", authProvider: null, emailVerified: null, isGoogleAccount: false }),
    ]));
    const legacyUser = res.body.users.find((user) => user._id === "legacy-user");
    expect(legacyUser.authProvider).toBeNull();
    expect(legacyUser.emailVerified).toBeNull();
  });

  test("diagnóstico de verificación devuelve conteos requeridos sin migrar datos", async () => {
    mockAdminAccess();
    User.countDocuments
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);

    const res = await request(app).get("/api/admin/users/email-verification-diagnostics");

    expect(res.status).toBe(200);
    expect(res.body.diagnostics).toEqual({
      emailVerifiedTrue: 11,
      emailVerifiedFalse: 7,
      emailVerifiedMissing: 3,
      googleAccounts: 5,
      googleAccountsNotVerified: 2,
    });
    expect(User.updateOne).not.toHaveBeenCalled();
  });
});
