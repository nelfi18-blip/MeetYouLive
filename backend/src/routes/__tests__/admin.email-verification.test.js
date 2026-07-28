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
  exists: jest.fn(),
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

const makeFindSelectLeanChain = (value) => ({
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
    User.exists.mockResolvedValue(null);
    logStaffAction.mockResolvedValue(undefined);
  });

  test("Alvarado local no verificada se puede verificar manualmente", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({
      _id: targetUserId,
      email: "alvaradomeetyoulive@gmail.com",
      role: "user",
      password: "$2a$10$7EqJtq98hPqEX7fNZaFWoOhiS4c1vSPdQvj1DrN25aP2a6cxZ7aVa",
      emailVerified: false,
    }));
    User.exists.mockResolvedValueOnce({ _id: targetUserId });

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(User.updateOne).toHaveBeenCalledWith(
      {
        $and: [
          { _id: targetUserId, emailVerified: { $ne: true }, role: { $ne: "admin" } },
          {
            $nor: [
              { authProvider: "google" },
              { googleId: { $exists: true, $nin: [null, ""] } },
              { images: { $elemMatch: { source: "google" } } },
            ],
          },
        ],
      },
      {
        $set: {
          authProvider: "local",
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
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, role: "user", authProvider: "local", emailVerified: true }));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email ya estaba verificado");
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("campos Stripe permanecen intactos", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, role: "user", authProvider: "local", emailVerified: false }));

    await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    const update = User.updateOne.mock.calls[0][1];
    expect(JSON.stringify(update)).not.toMatch(/stripeCustomerId|stripeAccountId|subscriptionId/i);
  });

  test("OTP, expiración y fecha de envío se limpian", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, role: "user", authProvider: "local", emailVerified: false }));

    await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(User.updateOne.mock.calls[0][1].$set).toMatchObject({
      emailVerificationCode: null,
      emailVerificationExpires: null,
      emailVerificationSentAt: null,
    });
  });

  test("auditoría se registra sin OTP ni datos Stripe", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({ _id: targetUserId, role: "user", authProvider: "local", emailVerified: false }));

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
      role: "user",
      authProvider: "google",
      googleId: "google-123",
      emailVerified: false,
    }));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(400);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("cuenta Google legacy con evidencia segura no puede verificarse manualmente por error", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({
      _id: targetUserId,
      role: "user",
      authProvider: "local",
      emailVerified: false,
      images: [{ url: "https://lh3.googleusercontent.com/a/photo=s96-c", source: "google" }],
    }));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(400);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("cuenta admin no puede verificarse manualmente", async () => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain({
      _id: targetUserId,
      role: "admin",
      authProvider: "local",
      emailVerified: false,
    }));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(400);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test.each([
    ["authProvider null", { _id: targetUserId, role: "user", authProvider: null, emailVerified: false }],
    ["authProvider vacío", { _id: targetUserId, role: "user", authProvider: "", emailVerified: false }],
    ["authProvider ausente", { _id: targetUserId, role: "user", emailVerified: false }],
  ])("cuenta ambigua no puede verificarse manualmente: %s", async (_name, user) => {
    mockAdminAccess();
    User.findById.mockReturnValueOnce(makeLeanSelectChain(user));

    const res = await request(app).patch(`/api/admin/users/${targetUserId}/verify-email`);

    expect(res.status).toBe(400);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  test("cuenta legacy con hash bcrypt y sin Google se muestra como local verificable", async () => {
    mockAdminAccess();
    const users = [
      {
        _id: "legacy-local",
        email: "person@gmail.com",
        password: "$2b$12$9EqJtq98hPqEX7fNZaFWoOhiS4c1vSPdQvj1DrN25aP2a6cxZ7aVa",
        emailVerified: false,
      },
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
    User.find.mockReturnValueOnce(makeFindSelectLeanChain([{ _id: "legacy-local" }]));
    User.countDocuments.mockResolvedValueOnce(users.length);

    const res = await request(app).get("/api/admin/users");

    expect(res.status).toBe(200);
    expect(res.body.users[0]).toMatchObject({
      _id: "legacy-local",
      authProvider: "local",
      emailVerified: false,
      isGoogleAccount: false,
    });
    expect(res.body.users[0]).not.toHaveProperty("password");
  });

  test("listado admin devuelve emailVerified y proveedor explícitos", async () => {
    mockAdminAccess();
    const users = [
      { _id: "local-unverified", email: "local-u@example.com", authProvider: "local", emailVerified: false },
      { _id: "local-verified", email: "local-v@example.com", authProvider: "local", emailVerified: true },
      { _id: "google-user", email: "google@example.com", authProvider: "google", googleId: "google-1", emailVerified: true },
      { _id: "legacy-google-user", email: "legacy-google@example.com", images: [{ source: "google" }], emailVerified: false },
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
    User.find.mockReturnValueOnce(makeFindSelectLeanChain([]));
    User.countDocuments.mockResolvedValueOnce(users.length);

    const res = await request(app).get("/api/admin/users");

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual(expect.arrayContaining([
      expect.objectContaining({ _id: "local-unverified", authProvider: "local", emailVerified: false, isGoogleAccount: false }),
      expect.objectContaining({ _id: "local-verified", authProvider: "local", emailVerified: true, isGoogleAccount: false }),
      expect.objectContaining({ _id: "google-user", authProvider: "google", emailVerified: true, isGoogleAccount: true }),
      expect.objectContaining({ _id: "legacy-google-user", authProvider: "google", emailVerified: false, isGoogleAccount: true }),
      expect.objectContaining({ _id: "legacy-user", authProvider: null, emailVerified: null, isGoogleAccount: false }),
    ]));
    const legacyUser = res.body.users.find((user) => user._id === "legacy-user");
    expect(legacyUser.authProvider).toBeNull();
    expect(legacyUser.emailVerified).toBeNull();
  });

  test("diagnóstico de verificación devuelve conteos requeridos sin migrar datos", async () => {
    mockAdminAccess();
    User.countDocuments
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);
    User.find
      .mockReturnValueOnce(makeFindSelectLeanChain([{ _id: "g1", email: "google@example.com" }]))
      .mockReturnValueOnce(makeFindSelectLeanChain([{ _id: "a1", email: "alvaradomeetyoulive@gmail.com" }]));

    const res = await request(app).get("/api/admin/users/email-verification-diagnostics");

    expect(res.status).toBe(200);
    expect(res.body.diagnostics).toEqual({
      currentGoogle: 5,
      legacyGoogleIdentifiable: 4,
      localAccounts: 2,
      adminAccounts: 1,
      ambiguousAccounts: 3,
      documentsToModify: [
        expect.objectContaining({ _id: "g1", plannedChange: "normalize-google-email-verification" }),
        expect.objectContaining({ _id: "a1", plannedChange: "classify-legacy-local" }),
      ],
      documentsToModifyCount: 2,
      legacyEvidence: [
        expect.objectContaining({ key: "googleId", value: "present" }),
        expect.objectContaining({ key: "images.source", value: "google" }),
      ],
      ambiguousLegacyGoogle: expect.objectContaining({ count: null }),
    });
    expect(User.updateOne).not.toHaveBeenCalled();
  });
});
