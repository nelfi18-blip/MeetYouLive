import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeMobileApp } from "./mobileEnvironment.js";

const AppleAuth = registerPlugin("MeetYouLiveAppleAuth");

export function isNativeAppleSignInAvailable() {
  return isNativeMobileApp() && Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("MeetYouLiveAppleAuth");
}

function authError(code) {
  return Object.assign(new Error("Apple sign-in failed"), { code });
}

async function postAppleAuth(path, body) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl || new URL(apiUrl).protocol !== "https:") throw authError("APPLE_UNAVAILABLE");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${apiUrl}/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    const data = await response.json();
    if (!response.ok) throw authError(data.code || "APPLE_UNAVAILABLE");
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function signInWithNativeApple({ ageConfirmed, ref, agencyCode }) {
  if (!isNativeAppleSignInAvailable()) throw authError("APPLE_UNAVAILABLE");
  const { challengeId, nonce } = await postAppleAuth("apple-challenge", {});
  if (!/^[a-f0-9]{64}$/.test(challengeId) || !/^[a-f0-9]{64}$/.test(nonce)) {
    throw authError("APPLE_UNAVAILABLE");
  }
  const credential = await AppleAuth.signIn({ nonce, state: challengeId });
  if (!credential?.idToken) throw authError("APPLE_INVALID_TOKEN");
  const data = await postAppleAuth("apple-native", {
    challengeId,
    idToken: credential.idToken,
    name: credential.name || "",
    ageConfirmed: ageConfirmed === true,
    ...(ref ? { ref } : {}),
    ...(agencyCode ? { agencyCode } : {}),
  });
  if (!data.token || !data.user?.id) throw authError("APPLE_UNAVAILABLE");
  return data;
}

export function appleSignInErrorKey(code) {
  if (code === "APPLE_CANCELLED") return "auth.appleCancelled";
  if (code === "APPLE_ACCOUNT_CONFLICT") return "auth.appleAccountConflict";
  if (code === "APPLE_ACCOUNT_RESTRICTED") return "auth.accountBlocked";
  if (code === "APPLE_AGE_REQUIRED") return "auth.ageConfirmationRequired";
  if (code === "APPLE_EMAIL_REQUIRED") return "auth.appleEmailRequired";
  return "auth.appleError";
}
