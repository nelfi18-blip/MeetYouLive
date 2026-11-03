import { v5 as uuidv5 } from "uuid";

// MUST stay byte-for-byte identical to
// backend/src/services/appleAccountToken.service.js
// (APPLE_ACCOUNT_TOKEN_NAMESPACE) — see that file for why StoreKit 2
// requires a UUID `appAccountToken` instead of the raw Mongo user id.
const APPLE_ACCOUNT_TOKEN_NAMESPACE = "7c7b6a9e-3e0a-4a0d-9d4e-9f7c6e9b6a21";

/**
 * Deterministically derives the UUID that must be passed as StoreKit's
 * `appAccountToken` for a given authenticated user id. Pure function: the
 * same `userId` always yields the same UUID.
 */
export function deriveAppAccountToken(userId) {
  if (!userId) {
    const error = new Error("userId is required to derive an Apple appAccountToken");
    error.code = "USER_ID_MISSING";
    throw error;
  }
  return uuidv5(String(userId), APPLE_ACCOUNT_TOKEN_NAMESPACE);
}
