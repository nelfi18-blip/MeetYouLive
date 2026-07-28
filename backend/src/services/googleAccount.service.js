const BCRYPT_PASSWORD_PATTERN_SOURCE = "^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$";
const BCRYPT_PASSWORD_PATTERN = new RegExp(BCRYPT_PASSWORD_PATTERN_SOURCE);
const BCRYPT_PASSWORD_FILTER = { password: { $regex: BCRYPT_PASSWORD_PATTERN_SOURCE } };
const GOOGLE_ID_FILTER = { googleId: { $exists: true, $nin: [null, ""] } };
const GOOGLE_IMAGE_SOURCE_FILTER = { images: { $elemMatch: { source: "google" } } };
const EMAIL_VERIFICATION_CLEAR_FIELDS = {
  emailVerificationCode: null,
  emailVerificationExpires: null,
  emailVerificationSentAt: null,
};

const CURRENT_GOOGLE_ACCOUNT_FILTER = { authProvider: "google" };
const USER_GOOGLE_EVIDENCE_FILTERS = [
  CURRENT_GOOGLE_ACCOUNT_FILTER,
  GOOGLE_ID_FILTER,
  GOOGLE_IMAGE_SOURCE_FILTER,
];
const NON_GOOGLE_ACCOUNT_FILTER = { $nor: USER_GOOGLE_EVIDENCE_FILTERS };

const GOOGLE_ACCOUNT_FILTER = {
  $or: USER_GOOGLE_EVIDENCE_FILTERS,
};

const LEGACY_GOOGLE_ACCOUNT_FILTER = {
  authProvider: { $ne: "google" },
  $or: [GOOGLE_ID_FILTER, GOOGLE_IMAGE_SOURCE_FILTER],
};

const GOOGLE_NORMALIZATION_NEEDED_FILTER = {
  $or: [
    { authProvider: { $ne: "google" } },
    { emailVerified: { $ne: true } },
    { emailVerificationCode: { $exists: true, $ne: null } },
    { emailVerificationExpires: { $exists: true, $ne: null } },
    { emailVerificationSentAt: { $exists: true, $ne: null } },
  ],
};

const normalizeEvidenceIds = (ids = []) => [
  ...new Set(
    ids
      .filter((id) => id !== null && id !== undefined && String(id).trim() !== "")
      .map((id) => id)
  ),
];

const getIdEvidenceFilter = (nextAuthGoogleUserIds = []) => {
  const ids = normalizeEvidenceIds(nextAuthGoogleUserIds);
  return ids.length ? { _id: { $in: ids } } : null;
};

const buildGoogleAccountFilter = (nextAuthGoogleUserIds = []) => {
  const accountIdFilter = getIdEvidenceFilter(nextAuthGoogleUserIds);
  return {
    $or: accountIdFilter
      ? [...USER_GOOGLE_EVIDENCE_FILTERS, accountIdFilter]
      : USER_GOOGLE_EVIDENCE_FILTERS,
  };
};

const buildNonGoogleAccountFilter = (nextAuthGoogleUserIds = []) => {
  const accountIdFilter = getIdEvidenceFilter(nextAuthGoogleUserIds);
  return {
    $nor: accountIdFilter
      ? [...USER_GOOGLE_EVIDENCE_FILTERS, accountIdFilter]
      : USER_GOOGLE_EVIDENCE_FILTERS,
  };
};

const buildGoogleNormalizationFilter = (nextAuthGoogleUserIds = []) => ({
  $and: [
    buildGoogleAccountFilter(nextAuthGoogleUserIds),
    GOOGLE_NORMALIZATION_NEEDED_FILTER,
  ],
});

const GOOGLE_NORMALIZATION_FILTER = buildGoogleNormalizationFilter();

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

const buildLocalAccountFilter = (nextAuthGoogleUserIds = []) => ({
  $and: [
    { role: { $ne: "admin" } },
    buildNonGoogleAccountFilter(nextAuthGoogleUserIds),
    {
      $or: [
        { authProvider: "local" },
        BCRYPT_PASSWORD_FILTER,
      ],
    },
  ],
});

const LEGACY_LOCAL_NORMALIZATION_FILTER = {
  $and: [
    { authProvider: { $ne: "local" } },
    NON_GOOGLE_ACCOUNT_FILTER,
    BCRYPT_PASSWORD_FILTER,
  ],
};

const buildLegacyLocalNormalizationFilter = (nextAuthGoogleUserIds = []) => ({
  $and: [
    { authProvider: { $ne: "local" } },
    buildNonGoogleAccountFilter(nextAuthGoogleUserIds),
    BCRYPT_PASSWORD_FILTER,
  ],
});

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

const buildLegacyAccountFilter = (nextAuthGoogleUserIds = []) => ({
  $and: [
    { role: { $ne: "admin" } },
    buildNonGoogleAccountFilter(nextAuthGoogleUserIds),
    {
      $nor: [
        { authProvider: "local" },
        BCRYPT_PASSWORD_FILTER,
      ],
    },
  ],
});

const hasGoogleId = (user = {}) => typeof user.googleId === "string" && user.googleId.trim() !== "";

const hasGoogleCreationMetadata = (user = {}) =>
  user.hasNextAuthGoogleEvidence === true ||
  (Array.isArray(user.images) &&
    user.images.some((image) => image?.source === "google"));

const hasBcryptPasswordEvidence = (user = {}) =>
  (user.hasLocalPasswordEvidence === true ||
    (typeof user.password === "string" && BCRYPT_PASSWORD_PATTERN.test(user.password))) &&
  !hasGoogleId(user) &&
  !hasGoogleCreationMetadata(user);

const isGoogleAccount = (user = {}) =>
  user?.authProvider === "google" || hasGoogleId(user) || hasGoogleCreationMetadata(user);

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

const getAccountsCollection = (User, accountCollection) =>
  accountCollection || User?.db?.collection?.("accounts") || null;

const getNextAuthGoogleUserIds = async (User, { accountCollection, userIds } = {}) => {
  const accounts = getAccountsCollection(User, accountCollection);
  if (!accounts?.distinct) return [];
  const filter = { provider: "google", userId: { $exists: true, $nin: [null, ""] } };
  if (Array.isArray(userIds) && userIds.length) {
    const ids = normalizeEvidenceIds(userIds);
    const stringIds = ids.map((id) => String(id));
    filter.userId = { $in: [...ids, ...stringIds] };
  }
  try {
    const ids = await accounts.distinct("userId", filter);
    return normalizeEvidenceIds(ids);
  } catch {
    return [];
  }
};

async function getGoogleEmailVerificationDiagnostics(User, options = {}) {
  const nextAuthGoogleUserIds = await getNextAuthGoogleUserIds(User, options);
  const googleFilter = buildGoogleAccountFilter(nextAuthGoogleUserIds);
  const nonGoogleFilter = buildNonGoogleAccountFilter(nextAuthGoogleUserIds);
  const localFilter = buildLocalAccountFilter(nextAuthGoogleUserIds);
  const legacyFilter = buildLegacyAccountFilter(nextAuthGoogleUserIds);
  const googleNormalizationFilter = buildGoogleNormalizationFilter(nextAuthGoogleUserIds);
  const legacyLocalNormalizationFilter = buildLegacyLocalNormalizationFilter(nextAuthGoogleUserIds);
  const [
    currentGoogle,
    legacyGoogleIdentifiable,
    nextAuthGoogleIdentifiable,
    googleAccounts,
    localAccounts,
    adminAccounts,
    legacyAccounts,
    googleDocumentsToModifyCount,
    legacyLocalDocumentsToModifyCount,
  ] = await Promise.all([
    User.countDocuments(CURRENT_GOOGLE_ACCOUNT_FILTER),
    User.countDocuments(LEGACY_GOOGLE_ACCOUNT_FILTER),
    nextAuthGoogleUserIds.length
      ? User.countDocuments({ $and: [{ role: { $ne: "admin" } }, { _id: { $in: nextAuthGoogleUserIds } }] })
      : Promise.resolve(0),
    User.countDocuments({ $and: [{ role: { $ne: "admin" } }, googleFilter] }),
    User.countDocuments(localFilter),
    User.countDocuments({ role: "admin" }),
    User.countDocuments(legacyFilter),
    User.countDocuments(googleNormalizationFilter),
    User.countDocuments(legacyLocalNormalizationFilter),
  ]);
  const documentsToModifyCount = googleDocumentsToModifyCount + legacyLocalDocumentsToModifyCount;

  return {
    summary: {
      googleAccounts,
      localAccounts,
      adminAccounts,
      legacyAccounts,
    },
    currentGoogle,
    legacyGoogleIdentifiable,
    nextAuthGoogleIdentifiable,
    localAccounts,
    adminAccounts,
    ambiguousAccounts: legacyAccounts,
    legacyAccounts,
    documentsToModifyCount,
    legacyEvidence: [
      {
        key: "googleId",
        value: "present",
        reason: "Persisted identifier from Google OAuth.",
      },
      {
        key: "images.source",
        value: "google",
        reason: "Persisted creation metadata written by the Google OAuth session route.",
      },
      {
        key: "accounts.provider",
        value: "google",
        reason: "Persisted NextAuth account provider associated by userId.",
      },
    ],
    ambiguousLegacyGoogle: {
      count: null,
      reason: "No safe count is possible without persistent Google evidence; Gmail domains are intentionally excluded.",
    },
  };
}

async function migrateSafeLegacyGoogleAccounts(User, { execute = false, accountCollection } = {}) {
  const nextAuthGoogleUserIds = await getNextAuthGoogleUserIds(User, { accountCollection });
  const googleNormalizationFilter = buildGoogleNormalizationFilter(nextAuthGoogleUserIds);
  const legacyLocalNormalizationFilter = buildLegacyLocalNormalizationFilter(nextAuthGoogleUserIds);
  const googleUpdate = {
    $set: {
      authProvider: "google",
      emailVerified: true,
      ...EMAIL_VERIFICATION_CLEAR_FIELDS,
    },
  };

  const legacyLocalUpdate = { $set: { authProvider: "local" } };
  const [diagnostics, googleMatchedCount, legacyLocalMatchedCount] = await Promise.all([
    getGoogleEmailVerificationDiagnostics(User, { accountCollection }),
    User.countDocuments(googleNormalizationFilter),
    User.countDocuments(legacyLocalNormalizationFilter),
  ]);
  if (!execute) {
    return {
      dryRun: true,
      matchedCount: googleMatchedCount + legacyLocalMatchedCount,
      modifiedCount: 0,
      diagnostics,
      operations: [
        { name: "normalize-google-email-verification", matchedCount: googleMatchedCount },
        { name: "classify-legacy-local", matchedCount: legacyLocalMatchedCount },
      ],
    };
  }

  const [googleResult, legacyLocalResult] = await Promise.all([
    User.updateMany(googleNormalizationFilter, googleUpdate),
    User.updateMany(legacyLocalNormalizationFilter, legacyLocalUpdate),
  ]);
  return {
    dryRun: false,
    matchedCount: googleMatchedCount + legacyLocalMatchedCount,
    modifiedCount: (googleResult.modifiedCount || 0) + (legacyLocalResult.modifiedCount || 0),
    diagnostics,
    operations: [
      { name: "normalize-google-email-verification", matchedCount: googleMatchedCount, modifiedCount: googleResult.modifiedCount || 0 },
      { name: "classify-legacy-local", matchedCount: legacyLocalMatchedCount, modifiedCount: legacyLocalResult.modifiedCount || 0 },
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
  buildNonGoogleAccountFilter,
  getAuthProvider,
  getGoogleEmailVerificationDiagnostics,
  getNextAuthGoogleUserIds,
  hasBcryptPasswordEvidence,
  isManualEmailVerificationAllowed,
  isGoogleAccount,
  migrateSafeLegacyGoogleAccounts,
};
