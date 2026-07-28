const {
  LEGACY_GOOGLE_ACCOUNT_FILTER,
  getAuthProvider,
  migrateSafeLegacyGoogleAccounts,
} = require("../googleAccount.service.js");

describe("googleAccount.service", () => {
  test("identifies current and safe legacy Google accounts without Gmail heuristics", () => {
    expect(getAuthProvider({ authProvider: "google" })).toBe("google");
    expect(getAuthProvider({ googleId: "google-1" })).toBe("google");
    expect(getAuthProvider({ images: [{ source: "google" }] })).toBe("google");
    expect(getAuthProvider({ email: "person@gmail.com", emailVerified: false })).toBeNull();
  });

  test("safe legacy migration does not change Stripe or unrelated fields", async () => {
    const User = {
      countDocuments: jest.fn().mockResolvedValue(2),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
    };

    const result = await migrateSafeLegacyGoogleAccounts(User, { execute: true });

    expect(result).toMatchObject({ dryRun: false, matchedCount: 2, modifiedCount: 2 });
    expect(User.updateMany).toHaveBeenCalledWith(
      LEGACY_GOOGLE_ACCOUNT_FILTER,
      {
        $set: {
          authProvider: "google",
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpires: null,
          emailVerificationSentAt: null,
        },
      },
      { timestamps: false }
    );
    expect(JSON.stringify(User.updateMany.mock.calls[0][1])).not.toMatch(/stripeCustomerId|stripeAccountId|subscriptionId/i);
    expect(JSON.stringify(User.updateMany.mock.calls[0][1])).not.toMatch(/password|role|profile/i);
  });
});
