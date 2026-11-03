const { v5: uuidv5 } = require("uuid");

// StoreKit 2's `Product.PurchaseOption.appAccountToken` (and the
// `appAccountToken` field Apple later returns on the verified transaction)
// MUST be a valid UUID — unlike Google Play's `obfuscatedAccountId`, which
// accepts an arbitrary string. Our users are identified by a Mongo
// ObjectId (24 hex chars), so we deterministically derive a UUID from it
// using UUID v5 (name-based, SHA-1) with a fixed, private namespace.
//
// This derivation MUST stay byte-for-byte identical on the client
// (frontend/lib/appleAccountToken.js, used right before launching the
// StoreKit purchase sheet) and here on the backend (used to verify the
// purchase belongs to the authenticated user) — otherwise every purchase
// would be rejected as an account mismatch. Never change
// APPLE_ACCOUNT_TOKEN_NAMESPACE without a coordinated migration on both
// sides.
const APPLE_ACCOUNT_TOKEN_NAMESPACE = "7c7b6a9e-3e0a-4a0d-9d4e-9f7c6e9b6a21";

/**
 * Deterministically derives the UUID that must be set as StoreKit's
 * `appAccountToken` for a given authenticated user id. Pure function: the
 * same `userId` always yields the same UUID, and different user ids yield
 * different UUIDs (collision-resistant via UUID v5/SHA-1).
 */
function deriveAppAccountToken(userId) {
  if (!userId) {
    const error = new Error("userId is required to derive an Apple appAccountToken");
    error.code = "USER_ID_MISSING";
    throw error;
  }
  return uuidv5(String(userId), APPLE_ACCOUNT_TOKEN_NAMESPACE);
}

module.exports = {
  APPLE_ACCOUNT_TOKEN_NAMESPACE,
  deriveAppAccountToken,
};
