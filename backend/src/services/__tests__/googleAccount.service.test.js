const {
  getAuthProvider,
  getGoogleEmailVerificationDiagnostics,
  hasBcryptPasswordEvidence,
  migrateSafeLegacyGoogleAccounts,
} = require("../googleAccount.service.js");

describe("googleAccount.service", () => {
  test("identifies current and safe legacy Google accounts without Gmail heuristics", () => {
    expect(getAuthProvider({ authProvider: "google" })).toBe("google");
    expect(getAuthProvider({ googleId: "google-1" })).toBe("google");
    expect(getAuthProvider({ images: [{ source: "google" }] })).toBe("google");
    expect(getAuthProvider({ hasNextAuthGoogleEvidence: true })).toBe("google");
    expect(getAuthProvider({ email: "alvaradomeetyoulive@gmail.com" })).toBeNull();
    expect(getAuthProvider({ password: "$2a$10$7EqJtq98hPqEX7fNZaFWoOhiS4c1vSPdQvj1DrN25aP2a6cxZ7aVa" })).toBe("local");
    expect(getAuthProvider({ email: "person@gmail.com", emailVerified: false })).toBeNull();
    expect(hasBcryptPasswordEvidence({ password: "not-bcrypt" })).toBe(false);
  });

  test("classifies required account status cases without email-domain heuristics", () => {
    const bcryptPassword = "$2a$10$7EqJtq98hPqEX7fNZaFWoOhiS4c1vSPdQvj1DrN25aP2a6cxZ7aVa";

    expect(getAuthProvider({ images: [{ source: "google" }], emailVerified: false })).toBe("google");
    expect(getAuthProvider({ email: "local@gmail.com", authProvider: "local", emailVerified: false })).toBe("local");
    expect(getAuthProvider({ authProvider: "local", emailVerified: true })).toBe("local");
    expect(getAuthProvider({ authProvider: "local", emailVerified: false })).toBe("local");
    expect(getAuthProvider({ role: "admin", authProvider: "local", emailVerified: false })).toBe("local");
    expect(getAuthProvider({ emailVerified: false })).toBeNull();
    expect(getAuthProvider({ password: bcryptPassword })).toBe("local");
  });

  test("diagnostics report Google, Local, Admin, and Legacy counts with NextAuth account evidence", async () => {
    const accountCollection = {
      distinct: jest.fn().mockResolvedValue(["next-auth-google-user"]),
    };
    const User = {
      countDocuments: jest.fn()
        // currentGoogle, legacyGoogleIdentifiable
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        // nextAuthGoogleIdentifiable, googleAccounts, localAccounts, adminAccounts, legacyAccounts
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        // documents to modify
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1),
    };

    const diagnostics = await getGoogleEmailVerificationDiagnostics(User, { accountCollection });

    expect(accountCollection.distinct).toHaveBeenCalledWith("userId", {
      provider: "google",
      userId: { $exists: true, $nin: [null, ""] },
    });
    expect(diagnostics.summary).toEqual({
      googleAccounts: 4,
      localAccounts: 3,
      adminAccounts: 1,
      legacyAccounts: 2,
    });
    expect(diagnostics.nextAuthGoogleIdentifiable).toBe(1);
    expect(diagnostics.documentsToModifyCount).toBe(4);
  });

  test("safe migration is idempotent and does not change Stripe or unrelated fields", async () => {
    const User = {
      countDocuments: jest.fn()
        // migration operation matches: Google normalization, legacy local normalization
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        // diagnostics: currentGoogle, legacyGoogleIdentifiable, googleAccounts, localAccounts, adminAccounts, legacyAccounts
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(5)
        // diagnostics documents-to-modify counts
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1),
      updateMany: jest.fn()
        .mockResolvedValueOnce({ modifiedCount: 2 })
        .mockResolvedValueOnce({ modifiedCount: 1 }),
    };

    const result = await migrateSafeLegacyGoogleAccounts(User, { execute: true });

    expect(result).toMatchObject({ dryRun: false, matchedCount: 3, modifiedCount: 3 });
    expect(User.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ $and: expect.any(Array) }),
      {
        $set: {
          authProvider: "google",
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpires: null,
          emailVerificationSentAt: null,
        },
      }
    );
    expect(User.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({ password: { $regex: expect.stringContaining("^\\$2") } }),
        ]),
      }),
      { $set: { authProvider: "local" } }
    );
    const updates = JSON.stringify([User.updateMany.mock.calls[0][1], User.updateMany.mock.calls[1][1]]);
    expect(updates).not.toMatch(/stripeCustomerId|stripeAccountId|subscriptionId/i);
    expect(updates).not.toMatch(/password|role|profile/i);
  });

  test("dry-run reports documents without writing", async () => {
    const User = {
      countDocuments: jest.fn()
        // dry-run operation matches: Google normalization, legacy local normalization
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        // diagnostics: currentGoogle, legacyGoogleIdentifiable, googleAccounts, localAccounts, adminAccounts, legacyAccounts
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(6)
        // diagnostics documents-to-modify counts
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1),
      updateMany: jest.fn(),
    };

    const result = await migrateSafeLegacyGoogleAccounts(User);

    expect(result).toMatchObject({ dryRun: true, matchedCount: 3, modifiedCount: 0 });
    expect(result.diagnostics).toMatchObject({
      currentGoogle: 1,
      legacyGoogleIdentifiable: 2,
      localAccounts: 4,
      adminAccounts: 5,
      ambiguousAccounts: 6,
      documentsToModifyCount: 3,
    });
    expect(result.diagnostics.summary).toMatchObject({
      googleAccounts: 3,
      localAccounts: 4,
      adminAccounts: 5,
      legacyAccounts: 6,
    });
    expect(User.updateMany).not.toHaveBeenCalled();
  });
});
