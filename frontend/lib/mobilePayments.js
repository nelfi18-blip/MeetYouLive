import { isNativeMobileApp } from "./mobileEnvironment";

export function shouldUseNativeStorePayments() {
  return isNativeMobileApp();
}
