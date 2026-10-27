import { registerPlugin } from "@capacitor/core";
import { isNativeMobileApp, getMobilePlatform } from "./mobileEnvironment";

// Native bridge to Google Play Billing Library for Coins consumable
// purchases (see GooglePlayBillingPlugin.java). Android only — iOS keeps
// using the existing Stripe-blocked/"coming soon" messaging.
const GooglePlayBilling = registerPlugin("GooglePlayBilling");

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Stable Google Play in-app product IDs for the three existing Coins
// packages. These MUST exist in Play Console → Monetize → Products →
// In-app products with these exact IDs (consumable), matching
// backend/src/controllers/coins.controller.js COIN_PACKAGES. Never invent
// additional packages here — this must mirror the web/Stripe packages
// exactly. See docs/GOOGLE_PLAY_BILLING_SETUP.md.
export const COIN_PACKAGE_PRODUCT_IDS = Object.freeze({
  100: "coins_pack_100",
  250: "coins_pack_250",
  700: "coins_pack_700",
});

export function isAndroidNativeBillingAvailable() {
  return isNativeMobileApp() && getMobilePlatform() === "android";
}

function getProductIdForPackage(packageId) {
  const productId = COIN_PACKAGE_PRODUCT_IDS[packageId];
  if (!productId) {
    const error = new Error(`Unknown coin package for Google Play Billing: ${packageId}`);
    error.code = "UNKNOWN_PACKAGE";
    throw error;
  }
  return productId;
}

/**
 * Fetches Google Play's own localized price for each coin package product
 * ID, so the UI never has to hardcode/guess the price shown at checkout.
 * Returns a map keyed by packageId: { [packageId]: { formattedPrice, ... } }.
 */
export async function getGooglePlayCoinPackagePrices() {
  const productIds = Object.values(COIN_PACKAGE_PRODUCT_IDS);
  const { products } = await GooglePlayBilling.queryProducts({ productIds });
  const byProductId = Object.fromEntries((products || []).map((p) => [p.productId, p]));
  return Object.fromEntries(
    Object.entries(COIN_PACKAGE_PRODUCT_IDS).map(([packageId, productId]) => [
      packageId,
      byProductId[productId] || null,
    ])
  );
}

/**
 * Launches the native Google Play purchase sheet for a Coins package and
 * returns the resulting { productId, purchaseToken }. This DOES NOT credit
 * any Coins by itself — the caller must then call
 * verifyGooglePlayCoinsPurchase() so the backend can independently validate
 * the purchase against the Google Play Developer API before crediting.
 *
 * `accountId` must be the authenticated backend user id (session.user.id),
 * used server-side to bind the purchase to the calling account.
 */
export async function purchaseCoinPackageWithGooglePlay(packageId, accountId) {
  if (!accountId) {
    const error = new Error("accountId is required to start a Google Play purchase");
    error.code = "ACCOUNT_ID_MISSING";
    throw error;
  }
  const productId = getProductIdForPackage(packageId);
  const result = await GooglePlayBilling.purchase({ productId, accountId });
  return { productId: result.productId || productId, purchaseToken: result.purchaseToken };
}

/**
 * Sends a Google Play purchase to the backend for server-side verification
 * (Google Play Developer API) and Coins credit. Idempotent: safe to call
 * more than once with the same purchaseToken (e.g. retries, restored
 * pending purchases) — the backend never credits the same token twice.
 */
export async function verifyGooglePlayCoinsPurchase({ productId, purchaseToken }, authToken) {
  const response = await fetch(`${API_URL}/api/payments/coins/google-play`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ productId, purchaseToken }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || "Google Play purchase verification failed");
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  return data;
}

// Billing Library's client-side Purchase.PurchaseState constant for a
// completed purchase. NOTE: this is a DIFFERENT enum than the Google Play
// Developer API's ProductPurchase.purchaseState used server-side (where 0
// means purchased) — see googlePlayBilling.service.js on the backend for
// that one. Do not conflate the two.
const BILLING_CLIENT_PURCHASE_STATE_PURCHASED = 1;

/**
 * Recovers any Coins purchase that Google Play already charged the user for
 * but that never reached (or never finished being credited by) the backend
 * — e.g. the app was killed mid-flow, or a previous verify call failed
 * before the response reached the client. Call this once on app start
 * (native Android only). Safe to call even when there is nothing pending.
 */
export async function restorePendingGooglePlayCoinsPurchases(authToken) {
  const { purchases } = await GooglePlayBilling.queryPendingPurchases();
  const knownProductIds = new Set(Object.values(COIN_PACKAGE_PRODUCT_IDS));
  const results = [];

  for (const purchase of purchases || []) {
    if (purchase.purchaseState !== BILLING_CLIENT_PURCHASE_STATE_PURCHASED) continue;
    if (!knownProductIds.has(purchase.productId)) continue;
    try {
      const data = await verifyGooglePlayCoinsPurchase(
        { productId: purchase.productId, purchaseToken: purchase.purchaseToken },
        authToken
      );
      results.push({ productId: purchase.productId, ok: true, data });
    } catch (error) {
      results.push({ productId: purchase.productId, ok: false, error });
    }
  }

  return results;
}
