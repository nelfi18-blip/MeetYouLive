export function getNativeGoogleLoginUrl(callbackPath = "/feed", origin = "https://meetyoulive.net") {
  const callbackUrl = new URL("/login", origin);
  callbackUrl.searchParams.set("callbackUrl", callbackPath || "/feed");

  const signInUrl = new URL("/api/auth/signin/google", origin);
  signInUrl.searchParams.set("callbackUrl", callbackUrl.toString());
  return signInUrl.toString();
}
