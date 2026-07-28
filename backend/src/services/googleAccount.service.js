const LEGACY_GOOGLE_IMAGE_FILTER = { images: { $elemMatch: { source: "google" } } };
const EMAIL_VERIFICATION_CLEAR_FIELDS = {
  emailVerificationCode: null,
  emailVerificationExpires: null,
  emailVerificationSentAt: null,
};

const GOOGLE_ACCOUNT_FILTER = {
  $or: [
    { authProvider: "google" },
    { googleId: { $exists: true, $nin: [null, ""] } },
    LEGACY_GOOGLE_IMAGE_FILTER,
  ],
};

const LEGACY_GOOGLE_ACCOUNT_FILTER = {
  authProvider: { $ne: "google" },
  $or: [{ googleId: { $exists: false } }, { googleId: null }, { googleId: "" }],
  ...LEGACY_GOOGLE_IMAGE_FILTER,
};

const hasGoogleImageEvidence = (user = {}) =>
  Array.isArray(user.images) && user.images.some((image) => image && image.source === "google");

const hasGoogleId = (user = {}) => typeof user.googleId === "string" && user.googleId.trim() !== "";

const isGoogleAccount = (user = {}) =>
  user?.authProvider === "google" || hasGoogleId(user) || hasGoogleImageEvidence(user);

const getAuthProvider = (user = {}) => {
  if (isGoogleAccount(user)) return "google";
  if (user?.authProvider === "local") return "local";
  return null;
};

async function getGoogleEmailVerificationDiagnostics(User) {
  const [
    emailVerifiedTrue,
    emailVerifiedFalse,
    emailVerifiedMissing,
    authProviderGoogle,
    googleIdPresent,
    safelyIdentifiedLegacyGoogle,
    googleAccountsNotVerified,
  ] = await Promise.all([
    User.countDocuments({ emailVerified: true }),
    User.countDocuments({ emailVerified: false }),
    User.countDocuments({ emailVerified: { $exists: false } }),
    User.countDocuments({ authProvider: "google" }),
    User.countDocuments({ googleId: { $exists: true, $nin: [null, ""] } }),
    User.countDocuments(LEGACY_GOOGLE_ACCOUNT_FILTER),
    User.countDocuments({
      ...GOOGLE_ACCOUNT_FILTER,
      emailVerified: { $ne: true },
    }),
  ]);

  return {
    emailVerifiedTrue,
    emailVerifiedFalse,
    emailVerifiedMissing,
    authProviderGoogle,
    googleIdPresent,
    safelyIdentifiedLegacyGoogle,
    googleAccountsNotVerified,
    legacyEvidence: [
      {
        key: "images.source",
        value: "google",
        reason: "Persisted by the Google OAuth session code when importing the Google profile photo.",
      },
    ],
    ambiguousLegacyGoogle: {
      count: null,
      reason: "No safe count is possible without persistent Google evidence; Gmail domains are intentionally excluded.",
    },
  };
}

async function migrateSafeLegacyGoogleAccounts(User, { execute = false } = {}) {
  const filter = LEGACY_GOOGLE_ACCOUNT_FILTER;
  const update = {
    $set: {
      authProvider: "google",
      emailVerified: true,
      ...EMAIL_VERIFICATION_CLEAR_FIELDS,
    },
  };

  const matchedCount = await User.countDocuments(filter);
  if (!execute) {
    return { dryRun: true, matchedCount, modifiedCount: 0, filter, update };
  }

  const result = await User.collection.updateMany(filter, update);
  return {
    dryRun: false,
    matchedCount,
    modifiedCount: result.modifiedCount || 0,
    filter,
    update,
  };
}

module.exports = {
  GOOGLE_ACCOUNT_FILTER,
  EMAIL_VERIFICATION_CLEAR_FIELDS,
  LEGACY_GOOGLE_ACCOUNT_FILTER,
  getAuthProvider,
  getGoogleEmailVerificationDiagnostics,
  hasGoogleImageEvidence,
  isGoogleAccount,
  migrateSafeLegacyGoogleAccounts,
};
