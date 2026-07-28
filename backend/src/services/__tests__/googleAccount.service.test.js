const {
  getAuthProvider,
  hasBcryptPasswordEvidence,
  migrateSafeLegacyGoogleAccounts,
} = require("../googleAccount.service.js");

const makeFindSelectLeanChain = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value),
  })),
});

describe("googleAccount.service", () => {
  test("identifies current and safe legacy Google accounts without Gmail heuristics", () => {
    expect(getAuthProvider({ authProvider: "google" })).toBe("google");
    expect(getAuthProvider({ googleId: "google-1" })).toBe("google");
    expect(getAuthProvider({ images: [{ source: "google" }] })).toBe("google");
    expect(getAuthProvider({ email: "alvaradomeetyoulive@gmail.com" })).toBeNull();
    expect(getAuthProvider({ password: "$2a$10$7EqJtq98hPqEX7fNZaFWoOhiS4c1vSPdQvj1DrN25aP2a6cxZ7aVa" })).toBe("local");
    expect(getAuthProvider({ email: "person@gmail.com", emailVerified: false })).toBeNull();
    expect(hasBcryptPasswordEvidence({ password: "not-bcrypt" })).toBe(false);
  });

  test("safe migration is idempotent and does not change Stripe or unrelated fields", async () => {
    const User = {
      countDocuments: jest.fn()
        // diagnostics: currentGoogle, legacyGoogleIdentifiable, localAccounts, adminAccounts, ambiguousAccounts
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(5)
        // migration operation matches: Google normalization, legacy local normalization
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1),
      find: jest.fn()
        .mockReturnValueOnce(makeFindSelectLeanChain([{ _id: "g1", email: "google@example.com" }]))
        .mockReturnValueOnce(makeFindSelectLeanChain([{ _id: "a1", email: "alvaradomeetyoulive@gmail.com" }])),
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
      expect.objectContaining({ password: { $regex: expect.stringContaining("^\\$2") } }),
      { $set: { authProvider: "local" } }
    );
    const updates = JSON.stringify([User.updateMany.mock.calls[0][1], User.updateMany.mock.calls[1][1]]);
    expect(updates).not.toMatch(/stripeCustomerId|stripeAccountId|subscriptionId/i);
    expect(updates).not.toMatch(/password|role|profile/i);
  });

  test("dry-run reports documents without writing", async () => {
    const User = {
      countDocuments: jest.fn()
        // diagnostics: currentGoogle, legacyGoogleIdentifiable, localAccounts, adminAccounts, ambiguousAccounts
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(5)
        // dry-run operation matches: Google normalization, legacy local normalization
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1),
      find: jest.fn()
        .mockReturnValueOnce(makeFindSelectLeanChain([{ _id: "g1", email: "google@example.com" }]))
        .mockReturnValueOnce(makeFindSelectLeanChain([{ _id: "a1", email: "alvaradomeetyoulive@gmail.com" }])),
      updateMany: jest.fn(),
    };

    const result = await migrateSafeLegacyGoogleAccounts(User);

    expect(result).toMatchObject({ dryRun: true, matchedCount: 3, modifiedCount: 0 });
    expect(result.diagnostics).toMatchObject({
      currentGoogle: 1,
      legacyGoogleIdentifiable: 2,
      localAccounts: 3,
      adminAccounts: 4,
      ambiguousAccounts: 5,
      documentsToModifyCount: 2,
    });
    expect(User.updateMany).not.toHaveBeenCalled();
  });
});
