import { isNativeMobileApp } from "./mobileEnvironment.js";

// Apple/Google store policies forbid steering users to an external payment
// flow (Stripe Checkout) for digital goods consumed inside the native app.
// Until native in-app purchases (Apple IAP / Google Play Billing) are
// implemented, Stripe Checkout must stay blocked inside the iOS/Android
// shells while remaining fully available on the web.
export function shouldUseNativeStorePayments() {
  return isNativeMobileApp();
}
