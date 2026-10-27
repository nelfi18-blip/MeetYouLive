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

/**
 * Fetches the canonical purchase state for a one-time ("managed") product
 * purchase from Google Play. Never trust client-submitted purchase state —
 * this is the only source of truth for purchaseState/consumptionState.
 *
 * Response shape (relevant fields): {
 *   purchaseState: 0 (purchased) | 1 (canceled) | 2 (pending),
 *   consumptionState: 0 (yet to be consumed) | 1 (consumed),
 *   obfuscatedExternalAccountId: string | undefined,
 *   orderId: string,
 *   purchaseTimeMillis: string,
 * }
 */
async function getProductPurchase(productId, purchaseToken) {
  return callAndroidPublisher(
    `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`
  );
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
