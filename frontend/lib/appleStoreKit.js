import { registerPlugin } from "@capacitor/core";
import { isNativeMobileApp, getMobilePlatform } from "./mobileEnvironment";
import { deriveAppAccountToken } from "./appleAccountToken";

// Native bridge to StoreKit 2 for Coins consumable purchases (see
// AppleIAPPlugin.swift). iOS only — Android keeps using Google Play
// Billing (googlePlayBilling.js).
const AppleIAP = registerPlugin("AppleIAP");

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Stable App Store Connect in-app purchase product IDs for the three
// existing Coins packages. These MUST exist in App Store Connect →
// Monetization → In-App Purchases as Consumable products with these exact
// IDs, matching backend/src/controllers/coins.controller.js COIN_PACKAGES'
// appleProductId fields (same IDs as Google Play's for cross-store
// consistency). Never invent additional packages here. See
// docs/APPLE_IAP_SETUP.md.
export const COIN_PACKAGE_PRODUCT_IDS = Object.freeze({
  100: "coins_pack_100",
  250: "coins_pack_250",
  700: "coins_pack_700",
});

export function isIOSNativeBillingAvailable() {
  return isNativeMobileApp() && getMobilePlatform() === "ios";
}

function getProductIdForPackage(packageId) {
  const productId = COIN_PACKAGE_PRODUCT_IDS[packageId];
  if (!productId) {
    const error = new Error(`Unknown coin package for Apple IAP: ${packageId}`);
    error.code = "UNKNOWN_PACKAGE";
    throw error;
  }
  return productId;
}

/**
 * Fetches StoreKit's own localized price for each coin package product id,
 * so the UI never has to hardcode/guess the price shown at checkout.
 * Returns a map keyed by packageId: { [packageId]: { displayPrice, ... } }.
 */
export async function getAppleCoinPackagePrices() {
  const productIds = Object.values(COIN_PACKAGE_PRODUCT_IDS);
  const { products } = await AppleIAP.queryProducts({ productIds });
  const byProductId = Object.fromEntries((products || []).map((p) => [p.productId, p]));
  return Object.fromEntries(
    Object.entries(COIN_PACKAGE_PRODUCT_IDS).map(([packageId, productId]) => [
      packageId,
      byProductId[productId] || null,
    ])
  );
}

/**
 * Launches the native StoreKit 2 purchase sheet for a Coins package and
 * returns the resulting { productId, transactionId }. This DOES NOT credit
 * any Coins by itself — the caller must then call
 * verifyAppleCoinsPurchase() so the backend can independently validate the
 * transaction against the App Store Server API before crediting.
 *
 * `accountId` must be the authenticated backend user id (session.user.id).
 * It is deterministically converted into StoreKit's required UUID
 * `appAccountToken` (see appleAccountToken.js) and passed to the native
 * purchase call so the backend can later bind the transaction to the
 * correct account.
 */
export async function purchaseCoinPackageWithApple(packageId, accountId) {
  if (!accountId) {
    const error = new Error("accountId is required to start an Apple IAP purchase");
    error.code = "ACCOUNT_ID_MISSING";
    throw error;
  }
  const productId = getProductIdForPackage(packageId);
  const appAccountToken = deriveAppAccountToken(accountId);
  const result = await AppleIAP.purchase({ productId, appAccountToken });
  return {
    productId: result.productId || productId,
    transactionId: result.transactionId,
  };
}

/**
 * Sends an Apple IAP transaction to the backend for server-side
 * verification (App Store Server API) and Coins credit. Idempotent: safe
 * to call more than once with the same transactionId (e.g. retries,
 * restored pending transactions) — the backend never credits the same
 * transaction twice.
 *
 * On a successful (fully-credited) response, this also tells StoreKit to
 * finish the transaction (see AppleIAPPlugin.swift) so it stops being
 * re-delivered by queryPendingTransactions(). A failed/partial response
 * intentionally leaves the transaction unfinished so it is retried later
 * instead of being silently dropped.
 */
export async function verifyAppleCoinsPurchase({ productId, transactionId }, authToken) {
  const response = await fetch(`${API_URL}/api/payments/coins/apple`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ productId, transactionId }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || "Apple IAP purchase verification failed");
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  if (data?.fullyCredited !== false) {
    try {
      await AppleIAP.finishTransaction({ transactionId });
    } catch {
      // Best-effort: if finishing fails (e.g. app backgrounded mid-call),
      // the transaction simply reappears in queryPendingTransactions() on
      // the next app start, where re-verifying is a safe, idempotent no-op.
    }
  }

  return data;
}

/**
 * Recovers any Coins purchase that Apple already charged the user for but
 * that never reached (or never finished being credited by) the backend —
 * e.g. the app was killed mid-flow, or a previous verify call failed
 * before the response reached the client. Call this once on app start
 * (native iOS only). Safe to call even when there is nothing pending.
 *
 * Reads StoreKit's `Transaction.currentEntitlements`/unfinished
 * transactions via the native plugin (see AppleIAPPlugin.swift) rather
 * than re-prompting the purchase sheet.
 */
export async function restorePendingAppleCoinsPurchases(authToken) {
  const { transactions } = await AppleIAP.queryPendingTransactions();
  const knownProductIds = new Set(Object.values(COIN_PACKAGE_PRODUCT_IDS));
  const results = [];

  for (const transaction of transactions || []) {
    if (!knownProductIds.has(transaction.productId)) continue;
    try {
      const data = await verifyAppleCoinsPurchase(
        { productId: transaction.productId, transactionId: transaction.transactionId },
        authToken
      );
      results.push({ productId: transaction.productId, ok: true, data });
    } catch (error) {
      results.push({ productId: transaction.productId, ok: false, error });
    }
  }

  return results;
}
