const { GoogleAuth } = require("google-auth-library");

// Server-side Google Play Developer API (Android Publisher) client used to
// validate and consume Android in-app purchases for Coins.
//
// Uses a dedicated service account (NOT the Firebase Admin one) with the
// "View financial data" + "Manage orders and subscriptions" permissions
// granted in Play Console → Users and permissions. Credentials are read
// exclusively from environment variables (never bundled in the frontend or
// the Android app) — see docs/GOOGLE_PLAY_BILLING_SETUP.md for setup.
const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";

let cachedAuthClient = null;

function getServiceAccountCredentials() {
  const clientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PLAY_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) return null;
  // Mirrors the FCM_PRIVATE_KEY convention: `\n` line endings are handled
  // automatically so the key can be pasted as a single env var line.
  const privateKey = privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;
  return { client_email: clientEmail, private_key: privateKey };
}

function getPackageName() {
  return process.env.GOOGLE_PLAY_PACKAGE_NAME || null;
}

/** Returns true when all env vars required to call the Android Publisher API are present. */
function isConfigured() {
  return Boolean(getServiceAccountCredentials() && getPackageName());
}

async function getAuthClient() {
  if (cachedAuthClient) return cachedAuthClient;
  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    throw new Error("Google Play service account credentials are not configured");
  }
  const auth = new GoogleAuth({ credentials, scopes: [ANDROID_PUBLISHER_SCOPE] });
  cachedAuthClient = await auth.getClient();
  return cachedAuthClient;
}

async function getAccessToken() {
  const client = await getAuthClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error("Failed to obtain a Google Play Developer API access token");
  }
  return token;
}

async function callAndroidPublisher(path, { method = "GET" } = {}) {
  const packageName = getPackageName();
  if (!packageName) {
    throw new Error("GOOGLE_PLAY_PACKAGE_NAME is not configured");
  }
  const token = await getAccessToken();
  const url = `${API_BASE}/applications/${encodeURIComponent(packageName)}${path}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = new Error(body?.error?.message || `Android Publisher API error (HTTP ${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body || {};
}

const PURCHASE_STATES = new Set(["PURCHASED", "PENDING", "CANCELLED"]);
const CONSUMPTION_STATES = new Set(["CONSUMPTION_STATE_YET_TO_BE_CONSUMED", "CONSUMPTION_STATE_CONSUMED"]);

function createValidationError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Strictly validates and normalizes a raw `ProductPurchaseV2` response
 * (purchases.productsv2.getproductpurchasev2) into the shape the controller
 * relies on. Never trusts client-submitted data — this is the only source
 * of truth for purchase/product/account state.
 *
 * ProductPurchaseV2 (relevant fields, per the official Android Publisher v3
 * discovery schema): {
 *   purchaseStateContext: { purchaseState: "PURCHASED" | "PENDING" | "CANCELLED" | "PURCHASE_STATE_UNSPECIFIED" },
 *   productLineItem: [{
 *     productId: string,
 *     productOfferDetails: {
 *       quantity: number,
 *       refundableQuantity: number,
 *       consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED" | "CONSUMPTION_STATE_CONSUMED" | "CONSUMPTION_STATE_UNSPECIFIED",
 *     },
 *   }],
 *   obfuscatedExternalAccountId: string | undefined,
 *   orderId: string,
 * }
 *
 * IMPORTANT: `quantity`, `refundableQuantity` and `consumptionState` live
 * under `productLineItem[].productOfferDetails`, NOT directly on the line
 * item — reading them from the wrong level silently yields `undefined`
 * (refund/consumption checks would then never trigger). See
 * https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2
 *
 * Rejects (throws, never credits) when the line items are missing,
 * ambiguous (more than one), for a different product than requested, are
 * missing `productOfferDetails`, or carry a missing/unexpected quantity or
 * refund state — all of which would otherwise risk crediting the wrong
 * product/amount, or silently skipping the refund check. Nothing here is
 * silently defaulted to a "safe-looking" value (e.g. a missing quantity is
 * NEVER assumed to be 1); ambiguous data always fails closed.
 */
function normalizeProductPurchaseV2(raw, productId) {
  const lineItems = Array.isArray(raw?.productLineItem) ? raw.productLineItem : [];

  if (lineItems.length !== 1) {
    throw createValidationError(
      422,
      "PURCHASE_LINE_ITEMS_AMBIGUOUS",
      `Expected exactly one productLineItem, received ${lineItems.length}`
    );
  }

  const [lineItem] = lineItems;
  const lineItemProductId = lineItem?.productId;
  if (!lineItemProductId || lineItemProductId !== productId) {
    throw createValidationError(
      422,
      "PURCHASE_PRODUCT_MISMATCH",
      "productLineItem.productId does not match the requested productId"
    );
  }

  const offerDetails = lineItem?.productOfferDetails;
  if (!offerDetails || typeof offerDetails !== "object") {
    throw createValidationError(
      422,
      "PURCHASE_OFFER_DETAILS_MISSING",
      "productLineItem.productOfferDetails is missing (required for quantity/refund/consumption state)"
    );
  }

  // Our three packs are always sold as a single unit each; any other
  // quantity — including a missing one — would risk crediting the wrong
  // amount of Coins, so it is rejected outright rather than guessed at.
  const quantity = offerDetails.quantity;
  if (!Number.isInteger(quantity) || quantity !== 1) {
    throw createValidationError(
      422,
      "PURCHASE_QUANTITY_INVALID",
      `Unexpected or missing purchase quantity: ${quantity}`
    );
  }

  // A missing refundableQuantity would make the refund check in the
  // controller silently inert, so it is treated as ambiguous and rejected
  // rather than assumed non-refunded.
  const refundableQuantity = offerDetails.refundableQuantity;
  if (!Number.isInteger(refundableQuantity)) {
    throw createValidationError(
      422,
      "PURCHASE_REFUND_STATE_UNKNOWN",
      `Missing or invalid productOfferDetails.refundableQuantity: ${refundableQuantity}`
    );
  }

  const rawState = raw?.purchaseStateContext?.purchaseState;
  const purchaseState = PURCHASE_STATES.has(rawState) ? rawState : "UNSPECIFIED";

  const rawConsumptionState = offerDetails.consumptionState;
  const consumptionState = CONSUMPTION_STATES.has(rawConsumptionState) ? rawConsumptionState : "UNSPECIFIED";

  return {
    purchaseState,
    obfuscatedExternalAccountId: raw?.obfuscatedExternalAccountId,
    orderId: raw?.orderId,
    productId: lineItemProductId,
    quantity,
    refundableQuantity,
    consumptionState,
  };
}

/**
 * Fetches the canonical purchase state for a one-time ("managed") product
 * purchase from Google Play via the V2 (`productsv2`) endpoint — Google's
 * documented, recommended endpoint for verifying one-time product
 * purchases. Never trust client-submitted purchase state; this (plus the
 * strict validation in normalizeProductPurchaseV2) is the only source of
 * truth for purchaseState/product identity/quantity/account binding.
 */
async function getProductPurchase(productId, purchaseToken) {
  const raw = await callAndroidPublisher(`/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`);
  return normalizeProductPurchaseV2(raw, productId);
}

/**
 * Consumes a one-time product purchase server-side. This both finalizes the
 * purchase (equivalent to acknowledgment) and allows the same product to be
 * purchased again by the same user. Must only be called AFTER coins have
 * been durably credited, so a crash between credit and consume never loses
 * the credited coins (the purchase simply stays consumable/retryable).
 */
async function consumeProductPurchase(productId, purchaseToken) {
  await callAndroidPublisher(
    `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`,
    { method: "POST" }
  );
}

module.exports = {
  isConfigured,
  getProductPurchase,
  consumeProductPurchase,
};
