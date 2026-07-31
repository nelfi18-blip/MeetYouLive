import { normalizeCallbackPath } from "./redirects.js";

const DEFAULT_APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://meetyoulive.net";

export function getNativeGoogleLoginUrl(callbackPath = "/feed", origin = DEFAULT_APP_ORIGIN) {
  const signInStartUrl = new URL("/auth/native-start", origin);
  signInStartUrl.searchParams.set("callbackUrl", normalizeCallbackPath(callbackPath));
  return signInStartUrl.toString();
}
