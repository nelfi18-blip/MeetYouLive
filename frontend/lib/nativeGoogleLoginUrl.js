import { getNativeAuthCallbackPath } from "./nativeAuthRedirect.js";

const DEFAULT_APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://meetyoulive.net";

// A plain GET to /api/auth/signin/google never reaches Google: NextAuth's GET
// "signin" action always redirects to pages.signIn ("/login") with the
// callback URL preserved, ignoring the requested provider. /auth/native-google-signin
// runs signIn("google", { callbackUrl }) client-side instead, which performs the
// CSRF-verified POST NextAuth requires to actually redirect to Google.
export const NATIVE_GOOGLE_SIGNIN_PATH = "/auth/native-google-signin";

export function getNativeGoogleLoginUrl(callbackPath = "/feed", origin = DEFAULT_APP_ORIGIN) {
  const callbackUrl = new URL(getNativeAuthCallbackPath(callbackPath), origin);

  const signInUrl = new URL(NATIVE_GOOGLE_SIGNIN_PATH, origin);
  signInUrl.searchParams.set("callbackUrl", callbackUrl.toString());
  return signInUrl.toString();
}
