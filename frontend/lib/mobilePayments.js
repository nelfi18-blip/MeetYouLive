import { isNativeMobileApp } from "./mobileEnvironment";

export const MOBILE_STORE_PAYMENT_MESSAGE =
  "Las compras dentro de la app móvil deben procesarse con Apple In-App Purchase o Google Play Billing. Usa la versión web para Stripe mientras activamos los productos de tienda.";

export function shouldUseNativeStorePayments() {
  return isNativeMobileApp();
}

