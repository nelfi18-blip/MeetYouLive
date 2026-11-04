import { isNativeMobileApp, getMobilePlatform } from "./mobileEnvironment.js";

/**
 * Identifies which payment provider is actually processing Coins
 * purchases for the CURRENT shell, so /coins can show the correct
 * provider name instead of always claiming "Stripe integrated".
 *
 * This is display-only: it does not touch StoreKit, Google Play Billing,
 * or Stripe behavior, which is already decided independently by
 * shouldUseNativeStorePayments()/isIOSNativeBillingAvailable()/
 * isAndroidNativeBillingAvailable().
 *
 * @returns {"apple" | "google_play" | "stripe"}
 */
export function getCoinsPaymentProvider() {
  if (isNativeMobileApp()) {
    const platform = getMobilePlatform();
    if (platform === "ios") return "apple";
    if (platform === "android") return "google_play";
  }
  return "stripe";
}
