const {
  AppStoreServerAPIClient,
  SignedDataVerifier,
  Environment,
} = require("@apple/app-store-server-library");

// Server-side App Store Server API + StoreKit 2 JWS verification used to
// validate and credit iOS in-app purchases for Coins.
//
// Credentials are read exclusively from environment variables (never
// bundled in the frontend or the iOS app) — see docs/APPLE_IAP_SETUP.md
// for how to obtain and configure each value. This mirrors the existing
// Google Play Billing service (googlePlayBilling.service.js) so both
// native store integrations follow the same "server is the only source of
// truth" shape.
function getBundleId() {
  return process.env.APPLE_IAP_BUNDLE_ID || null;
}

function getEnvironment() {
  const raw = (process.env.APPLE_IAP_ENVIRONMENT || "").trim().toLowerCase();
  if (raw === "production") return Environment.PRODUCTION;
  if (raw === "sandbox") return Environment.SANDBOX;
  return null;
}

function getAppAppleId() {
  const raw = process.env.APPLE_IAP_APP_APPLE_ID;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getSigningKey() {
  const raw = process.env.APPLE_IAP_PRIVATE_KEY;
  if (!raw) return null;
  // Mirrors the FCM_PRIVATE_KEY / GOOGLE_PLAY_PRIVATE_KEY convention:
  // `\n` line endings are handled automatically so the key can be pasted
  // as a single env var line.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/**
 * Root certificates used to verify Apple's JWS signatures, read from
 * APPLE_IAP_ROOT_CERTS_BASE64: one or more base64-encoded DER certificates
 * (Apple Root CA - G3, download from
 * https://www.apple.com/certificateauthority/), comma-separated. Never
 * fetched over the network at runtime — this service must never depend on
 * reaching apple.com to start up or to verify a purchase.
 */
function getRootCertificates() {
  const raw = process.env.APPLE_IAP_ROOT_CERTS_BASE64;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Buffer.from(entry, "base64"));
}

/** Returns true when all env vars required to verify App Store purchases are present. */
function isConfigured() {
  return Boolean(
    getSigningKey() &&
      process.env.APPLE_IAP_KEY_ID &&
      process.env.APPLE_IAP_ISSUER_ID &&
      getBundleId() &&
      getEnvironment() &&
      getRootCertificates().length > 0
  );
}

let cachedApiClient = null;
let cachedVerifier = null;

function getApiClient() {
  if (cachedApiClient) return cachedApiClient;
  if (!isConfigured()) {
    throw new Error("Apple In-App Purchase server credentials are not configured");
  }
  cachedApiClient = new AppStoreServerAPIClient(
    getSigningKey(),
    process.env.APPLE_IAP_KEY_ID,
    process.env.APPLE_IAP_ISSUER_ID,
    getBundleId(),
    getEnvironment()
  );
  return cachedApiClient;
}

function getVerifier() {
  if (cachedVerifier) return cachedVerifier;
  if (!isConfigured()) {
    throw new Error("Apple In-App Purchase server credentials are not configured");
  }
  // enableOnlineChecks=true performs revocation checking against Apple's
  // OCSP responders and enforces the certificate's validity window — never
  // disabled, since a stale/revoked signing certificate must never be
  // trusted.
  cachedVerifier = new SignedDataVerifier(
    getRootCertificates(),
    true,
    getEnvironment(),
    getBundleId(),
    getAppAppleId()
  );
  return cachedVerifier;
}

function createValidationError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Strictly validates and normalizes a decoded `JWSTransactionDecodedPayload`
 * into the shape the controller relies on. Never trusts client-submitted
 * data — the signature verification plus this normalization are the only
 * source of truth for product/quantity/account/refund state.
 *
 * Rejects (throws, never credits) whenever the transaction is for a
 * different product than requested, is not a Consumable, carries a
 * missing/unexpected quantity, or is missing its `appAccountToken` —
 * mirroring googlePlayBilling.service.js normalizeProductPurchaseV2's
 * fail-closed behavior. Nothing here is silently defaulted to a
 * "safe-looking" value.
 */
function normalizeTransaction(decoded, productId) {
  const decodedProductId = decoded?.productId;
  if (!decodedProductId || decodedProductId !== productId) {
    throw createValidationError(
      422,
      "PURCHASE_PRODUCT_MISMATCH",
      "The verified transaction's productId does not match the requested productId"
    );
  }

  if (decoded?.type !== "Consumable") {
    throw createValidationError(
      422,
      "PURCHASE_TYPE_INVALID",
      `Unexpected transaction type for a Coins purchase: ${decoded?.type}`
    );
  }

  // Our three packs are always sold as a single unit each; any other
  // quantity — including a missing one — would risk crediting the wrong
  // amount of Coins, so it is rejected outright rather than guessed at.
  const quantity = decoded?.quantity;
  if (!Number.isInteger(quantity) || quantity !== 1) {
    throw createValidationError(
      422,
      "PURCHASE_QUANTITY_INVALID",
      `Unexpected or missing transaction quantity: ${quantity}`
    );
  }

  const appAccountToken = decoded?.appAccountToken;
  if (!appAccountToken || typeof appAccountToken !== "string") {
    throw createValidationError(
      422,
      "PURCHASE_ACCOUNT_TOKEN_MISSING",
      "The verified transaction is missing appAccountToken (required for account binding)"
    );
  }

  // A present revocationDate/revocationReason means Apple has already
  // refunded or revoked this transaction — never credit it. Absence of
  // both is the only "not refunded" signal Apple provides for a one-time
  // purchase transaction.
  const refunded = decoded?.revocationDate != null || decoded?.revocationReason != null;

  return {
    transactionId: decoded?.transactionId,
    originalTransactionId: decoded?.originalTransactionId,
    productId: decodedProductId,
    quantity,
    appAccountToken,
    refunded,
    environment: decoded?.environment,
  };
}

/**
 * Fetches and independently verifies the canonical transaction info for a
 * one-time Consumable purchase from Apple via the App Store Server API
 * (Get Transaction Info) plus StoreKit 2 JWS signature verification.
 * Never trust client-submitted transaction data; this (plus the strict
 * validation in normalizeTransaction) is the only source of truth for
 * product identity/quantity/account binding/refund state.
 */
async function getVerifiedTransaction(transactionId, productId) {
  const client = getApiClient();
  const verifier = getVerifier();

  const response = await client.getTransactionInfo(transactionId);
  if (!response?.signedTransactionInfo) {
    throw createValidationError(502, "PURCHASE_LOOKUP_EMPTY", "Apple returned no transaction info");
  }

  const decoded = await verifier.verifyAndDecodeTransaction(response.signedTransactionInfo);
  return normalizeTransaction(decoded, productId);
}

module.exports = {
  isConfigured,
  getVerifiedTransaction,
};
