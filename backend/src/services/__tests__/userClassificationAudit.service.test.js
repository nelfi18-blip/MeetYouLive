const {
  buildAuditReport,
  buildCountsOnlyAuditReport,
  classifyUser,
  runUserClassificationAudit,
} = require("../userClassificationAudit.service.js");

const bcryptHash = "$2a$10$7EqJtq98hPqEX7fNZaFWoOhiS4c1vSPdQvj1DrN25aP2a6cxZ7aVa";

describe("userClassificationAudit.service", () => {
  test("classifies modern Google with persisted provider and googleId", () => {
    const result = classifyUser({
      _id: "google-modern",
      authProvider: "google",
      googleId: "google-1",
      emailVerified: true,
    });

    expect(result.classification).toBe("google_confirmada");
    expect(result.contradictions).toEqual([]);
  });

  test("classifies legacy Google with persisted historical evidence", () => {
    const report = buildAuditReport([
      {
        _id: "507f1f77bcf86cd799439011",
        email: "legacy-google@example.com",
        images: [{ source: "google" }],
        emailVerified: true,
      },
      {
        _id: "next-auth-google-user",
        email: "nextauth@example.com",
        emailVerified: true,
      },
    ], { nextAuthGoogleUserIds: ["next-auth-google-user"] });

    expect(report.counts.googleConfirmed).toBe(2);
    expect(report.users).toEqual(expect.arrayContaining([
      expect.objectContaining({
        classification: "google_confirmada",
        googleId: "ausente",
        reason: expect.arrayContaining(["metadata images.source=google"]),
      }),
      expect.objectContaining({
        classification: "google_confirmada",
        reason: expect.arrayContaining(["cuenta NextAuth provider=google"]),
      }),
    ]));
  });

  test("classifies local Gmail by bcrypt evidence and never by email domain", () => {
    const report = buildAuditReport([
      {
        _id: "507f1f77bcf86cd799439012",
        email: "alvaradomeetyoulive@gmail.com",
        authProvider: "local",
        password: bcryptHash,
        emailVerified: true,
      },
    ]);

    expect(report.counts.localConfirmed).toBe(1);
    expect(report.counts.googleConfirmed).toBe(0);
    expect(report.users[0]).toMatchObject({
      classification: "local_confirmada",
      authProvider: "local",
      emailVerified: true,
      password: "presente",
    });
    expect(report.users[0].email).not.toBe("alvaradomeetyoulive@gmail.com");
  });

  test("keeps verified and unverified local accounts in local classification", () => {
    const report = buildAuditReport([
      { _id: "local-verified", authProvider: "local", password: bcryptHash, emailVerified: true },
      { _id: "local-unverified", authProvider: "local", password: bcryptHash, emailVerified: false },
    ]);

    expect(report.counts.localConfirmed).toBe(2);
    expect(report.counts.emailVerified).toBe(1);
    expect(report.counts.emailUnverified).toBe(1);
    expect(report.users.map((user) => user.classification)).toEqual([
      "local_confirmada",
      "local_confirmada",
    ]);
  });

  test("classifies admin separately and flags incorrect OTP state", () => {
    const report = buildAuditReport([
      {
        _id: "admin-user",
        role: "admin",
        authProvider: "local",
        password: bcryptHash,
        emailVerified: false,
        emailVerificationCode: "hashed-otp",
        emailVerificationExpires: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    expect(report.counts.admins).toBe(1);
    expect(report.counts.adminWithIncorrectOtpState).toBe(1);
    expect(report.counts.emailUnverified).toBe(0);
    expect(report.users[0]).toMatchObject({
      classification: "admin",
      emailVerificationCode: "presente",
      adminWithIncorrectOtpState: true,
    });
    expect(JSON.stringify(report)).not.toContain("hashed-otp");
  });

  test("classifies legacy ambiguous without sufficient provider evidence", () => {
    const report = buildAuditReport([
      { _id: "legacy-ambiguous", email: "person@gmail.com", emailVerified: false },
    ]);

    expect(report.counts.legacyAmbiguous).toBe(1);
    expect(report.counts.mustRemainUnknown).toBe(1);
    expect(report.users[0]).toMatchObject({
      classification: "legacy_ambigua",
      recommendedAction: expect.stringContaining("Sin información"),
    });
  });

  test("flags contradictory data for Google and local provider mismatches", () => {
    const report = buildAuditReport([
      {
        _id: "google-bad",
        authProvider: "local",
        googleId: "google-1",
        emailVerified: false,
        emailVerificationSentAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        _id: "local-bad-provider",
        authProvider: "legacy",
        password: bcryptHash,
        emailVerified: true,
      },
    ]);

    expect(report.counts.googleWithEmailVerifiedFalse).toBe(1);
    expect(report.counts.localWithIncorrectAuthProvider).toBe(1);
    expect(report.counts.contradictoryAccounts).toBe(2);
    expect(report.users[0].contradictions).toEqual(expect.arrayContaining([
      "evidencia Google con authProvider distinto de google",
      "cuenta Google con emailVerified distinto de true",
      "cuenta Google conserva estado OTP",
    ]));
    expect(report.users[1]).toMatchObject({
      classification: "local_confirmada",
      localWithIncorrectAuthProvider: true,
    });
  });

  test("dry-run audit reads only selected fields and never writes", async () => {
    const lean = jest.fn().mockResolvedValue([
      { _id: "local", authProvider: "local", password: bcryptHash, emailVerified: true },
    ]);
    const select = jest.fn(() => ({ lean }));
    const User = {
      find: jest.fn(() => ({ select })),
      updateMany: jest.fn(),
      updateOne: jest.fn(),
      db: {
        collection: jest.fn(() => ({
          distinct: jest.fn().mockResolvedValue([]),
        })),
      },
    };

    const report = await runUserClassificationAudit(User);

    expect(report.dryRun).toBe(true);
    expect(report.counts.localConfirmed).toBe(1);
    expect(User.find).toHaveBeenCalledWith({});
    expect(select).toHaveBeenCalledWith(expect.stringContaining("emailVerified"));
    expect(User.updateMany).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test("counts-only report includes only safe mandatory counters", () => {
    const report = buildAuditReport([
      { _id: "google", authProvider: "google", googleId: "secret-google-id", emailVerified: false },
      { _id: "local", authProvider: "local", password: bcryptHash, emailVerified: true },
      { _id: "admin", role: "admin", emailVerified: false, emailVerificationCode: "hashed-otp" },
      { _id: "legacy", email: "legacy@example.com", emailVerified: false },
    ]);

    const countsOnly = buildCountsOnlyAuditReport(report.counts);

    expect(countsOnly).toEqual({
      totalUsuarios: 4,
      googleConfirmadas: 0,
      localesConfirmadas: 1,
      administradores: 1,
      legacyAmbiguas: 1,
      emailsVerificados: 1,
      emailsSinVerificar: 2,
      googleConEmailVerifiedFalse: 1,
      adminsConEstadoOtpIncorrecto: 1,
      datosContradictorios: 2,
      cuentasCorregiblesAutomaticamente: 1,
      cuentasDebenConservarSinInformacion: 1,
    });
    expect(JSON.stringify(countsOnly)).not.toContain("legacy@example.com");
    expect(JSON.stringify(countsOnly)).not.toContain("secret-google-id");
    expect(JSON.stringify(countsOnly)).not.toContain("hashed-otp");
  });
});
