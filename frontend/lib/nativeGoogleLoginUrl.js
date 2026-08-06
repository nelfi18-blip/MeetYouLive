import { getNativeAuthCallbackPath } from "./nativeAuthRedirect.js";

const DEFAULT_APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://meetyoulive.net";

export function getNativeGoogleLoginUrl(callbackPath = "/feed", origin = DEFAULT_APP_ORIGIN) {
  const callbackUrl = new URL(getNativeAuthCallbackPath(callbackPath), origin);

  const signInUrl = new URL("/api/auth/signin/google", origin);
  signInUrl.searchParams.set("callbackUrl", callbackUrl.toString());
  return signInUrl.toString();
}
