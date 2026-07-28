const BCRYPT_PASSWORD_PATTERN_SOURCE = "^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$";
const BCRYPT_PASSWORD_PATTERN = new RegExp(BCRYPT_PASSWORD_PATTERN_SOURCE);
const BCRYPT_PASSWORD_FILTER = { password: { $regex: BCRYPT_PASSWORD_PATTERN_SOURCE } };
const GOOGLE_ID_FILTER = { googleId: { $exists: true, $nin: [null, ""] } };
const LEGACY_GOOGLE_IMAGE_FILTER = { images: { $elemMatch: { source: "google" } } };
const EMAIL_VERIFICATION_CLEAR_FIELDS = {
  emailVerificationCode: null,
  emailVerificationExpires: null,
  emailVerificationSentAt: null,
};

const CURRENT_GOOGLE_ACCOUNT_FILTER = { authProvider: "google" };
const NON_GOOGLE_ACCOUNT_FILTER = { $nor: [CURRENT_GOOGLE_ACCOUNT_FILTER, GOOGLE_ID_FILTER, LEGACY_GOOGLE_IMAGE_FILTER] };

const GOOGLE_ACCOUNT_FILTER = {
  $or: [
    CURRENT_GOOGLE_ACCOUNT_FILTER,
    GOOGLE_ID_FILTER,
    LEGACY_GOOGLE_IMAGE_FILTER,
  ],
};

const LEGACY_GOOGLE_ACCOUNT_FILTER = {
  authProvider: { $ne: "google" },
  $or: [
    GOOGLE_ID_FILTER,
    LEGACY_GOOGLE_IMAGE_FILTER,
  ],
};

const GOOGLE_NORMALIZATION_FILTER = {
  $and: [
    GOOGLE_ACCOUNT_FILTER,
    {
      $or: [
        { authProvider: { $ne: "google" } },
        { emailVerified: { $ne: true } },
        { emailVerificationCode: { $exists: true, $ne: null } },
        { emailVerificationExpires: { $exists: true, $ne: null } },
        { emailVerificationSentAt: { $exists: true, $ne: null } },
      ],
    },
  ],
};

const LOCAL_ACCOUNT_FILTER = {
  $and: [
    { role: { $ne: "admin" } },
    NON_GOOGLE_ACCOUNT_FILTER,
    {
      $or: [
        { authProvider: "local" },
        BCRYPT_PASSWORD_FILTER,
      ],
    },
  ],
};

const LEGACY_LOCAL_NORMALIZATION_FILTER = {
  $and: [
    { authProvider: { $ne: "local" } },
    NON_GOOGLE_ACCOUNT_FILTER,
    BCRYPT_PASSWORD_FILTER,
  ],
};

const AMBIGUOUS_ACCOUNT_FILTER = {
  $and: [
    { role: { $ne: "admin" } },
    NON_GOOGLE_ACCOUNT_FILTER,
    {
      $or: [
        { authProvider: { $exists: false } },
        { authProvider: null },
        { authProvider: "" },
      ],
    },
    {
      $or: [
        { password: { $exists: false } },
        { password: null },
        { password: "" },
        { password: { $not: BCRYPT_PASSWORD_FILTER.password } },
      ],
    },
  ],
};

const hasGoogleImageEvidence = (user = {}) =>
  Array.isArray(user.images) && user.images.some((image) => image && image.source === "google");

const hasGoogleId = (user = {}) => typeof user.googleId === "string" && user.googleId.trim() !== "";

const hasBcryptPasswordEvidence = (user = {}) =>
  (user.hasLocalPasswordEvidence === true ||
    (typeof user.password === "string" && BCRYPT_PASSWORD_PATTERN.test(user.password))) &&
  !hasGoogleId(user);

const isGoogleAccount = (user = {}) =>
  user?.authProvider === "google" || hasGoogleId(user) || hasGoogleImageEvidence(user);

const getAuthProvider = (user = {}) => {
  if (isGoogleAccount(user)) return "google";
  if (user?.authProvider === "local" || hasBcryptPasswordEvidence(user)) {
    return "local";
  }
  return null;
};

const isManualEmailVerificationAllowed = (user = {}) =>
  user?.role !== "admin" &&
  getAuthProvider(user) === "local" &&
  user?.emailVerified !== true &&
  // Some legacy Google accounts can still have authProvider:"local"; persistent Google evidence must still block manual OTP bypass.
  !isGoogleAccount(user);

const previewDocuments = (User, filter) =>
  User.find(filter)
    .select("_id email role authProvider emailVerified googleId")
    .lean();

async function getGoogleEmailVerificationDiagnostics(User) {
  const [
    currentGoogle,
    legacyGoogleIdentifiable,
    localAccounts,
    adminAccounts,
    ambiguousAccounts,
    googleDocumentsToModify,
    legacyLocalDocumentsToModify,
  ] = await Promise.all([
    User.countDocuments(CURRENT_GOOGLE_ACCOUNT_FILTER),
    User.countDocuments(LEGACY_GOOGLE_ACCOUNT_FILTER),
    User.countDocuments(LOCAL_ACCOUNT_FILTER),
    User.countDocuments({ role: "admin" }),
    User.countDocuments(AMBIGUOUS_ACCOUNT_FILTER),
    previewDocuments(User, GOOGLE_NORMALIZATION_FILTER),
    previewDocuments(User, LEGACY_LOCAL_NORMALIZATION_FILTER),
  ]);
  const documentsToModify = [
    ...googleDocumentsToModify.map((user) => ({ ...user, plannedChange: "normalize-google-email-verification" })),
    ...legacyLocalDocumentsToModify.map((user) => ({ ...user, plannedChange: "classify-legacy-local" })),
  ];

  return {
    currentGoogle,
    legacyGoogleIdentifiable,
    localAccounts,
    adminAccounts,
    ambiguousAccounts,
    documentsToModify,
    documentsToModifyCount: documentsToModify.length,
    legacyEvidence: [
      {
        key: "googleId",
        value: "present",
        reason: "Persisted identifier from Google OAuth.",
      },
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
  const googleUpdate = {
    $set: {
      authProvider: "google",
      emailVerified: true,
      ...EMAIL_VERIFICATION_CLEAR_FIELDS,
    },
  };

  const legacyLocalUpdate = { $set: { authProvider: "local" } };
  const [diagnostics, googleMatchedCount, legacyLocalMatchedCount] = await Promise.all([
    getGoogleEmailVerificationDiagnostics(User),
    User.countDocuments(GOOGLE_NORMALIZATION_FILTER),
    User.countDocuments(LEGACY_LOCAL_NORMALIZATION_FILTER),
  ]);
  if (!execute) {
    return {
      dryRun: true,
      matchedCount: googleMatchedCount + legacyLocalMatchedCount,
      modifiedCount: 0,
      diagnostics,
      operations: [
        { name: "normalize-google-email-verification", matchedCount: googleMatchedCount, filter: GOOGLE_NORMALIZATION_FILTER, update: googleUpdate },
        { name: "classify-legacy-local", matchedCount: legacyLocalMatchedCount, filter: LEGACY_LOCAL_NORMALIZATION_FILTER, update: legacyLocalUpdate },
      ],
    };
  }

  const [googleResult, legacyLocalResult] = await Promise.all([
    User.updateMany(GOOGLE_NORMALIZATION_FILTER, googleUpdate),
    User.updateMany(LEGACY_LOCAL_NORMALIZATION_FILTER, legacyLocalUpdate),
  ]);
  return {
    dryRun: false,
    matchedCount: googleMatchedCount + legacyLocalMatchedCount,
    modifiedCount: (googleResult.modifiedCount || 0) + (legacyLocalResult.modifiedCount || 0),
    diagnostics,
    operations: [
      { name: "normalize-google-email-verification", matchedCount: googleMatchedCount, modifiedCount: googleResult.modifiedCount || 0, filter: GOOGLE_NORMALIZATION_FILTER, update: googleUpdate },
      { name: "classify-legacy-local", matchedCount: legacyLocalMatchedCount, modifiedCount: legacyLocalResult.modifiedCount || 0, filter: LEGACY_LOCAL_NORMALIZATION_FILTER, update: legacyLocalUpdate },
    ],
  };
}

module.exports = {
  AMBIGUOUS_ACCOUNT_FILTER,
  CURRENT_GOOGLE_ACCOUNT_FILTER,
  GOOGLE_ACCOUNT_FILTER,
  GOOGLE_NORMALIZATION_FILTER,
  LEGACY_LOCAL_NORMALIZATION_FILTER,
  BCRYPT_PASSWORD_FILTER,
  EMAIL_VERIFICATION_CLEAR_FIELDS,
  LEGACY_GOOGLE_ACCOUNT_FILTER,
  LOCAL_ACCOUNT_FILTER,
  NON_GOOGLE_ACCOUNT_FILTER,
  getAuthProvider,
  getGoogleEmailVerificationDiagnostics,
  hasBcryptPasswordEvidence,
  hasGoogleImageEvidence,
  isManualEmailVerificationAllowed,
  isGoogleAccount,
  migrateSafeLegacyGoogleAccounts,
};
