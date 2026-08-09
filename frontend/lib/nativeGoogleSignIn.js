import { SocialLogin } from "@capgo/capacitor-social-login";
import { getMobilePlatform, isNativeMobileApp } from "./mobileEnvironment";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

let googleInitializePromise = null;

const GOOGLE_NATIVE_STAGE = Object.freeze({
  INITIALIZE: "initialize",
  SOCIAL_LOGIN: "social_login",
  ID_TOKEN: "id_token",
  BACKEND_REQUEST: "backend_request",
  BACKEND_RESPONSE: "backend_response",
  BACKEND_JSON: "backend_json",
});

function getSafeErrorValue(error, key) {
  const value = error?.[key];
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
}

function getSafeNativeGoogleErrorDetails(error, stage, extra = {}) {
  return {
    stage,
    code: getSafeErrorValue(error, "code"),
    message: getSafeErrorValue(error, "message"),
    errorCode: getSafeErrorValue(error, "errorCode"),
    status: getSafeErrorValue(error, "status"),
    ...(typeof extra.status === "number" ? { status: extra.status } : {}),
    ...(typeof extra.hasResult === "boolean" ? { hasResult: extra.hasResult } : {}),
  };
}

function logNativeGoogleStageFailure(stage, error, extra) {
  console.error("[nativeGoogleSignIn] Native Google Sign-In stage failed:", getSafeNativeGoogleErrorDetails(error, stage, extra));
}

function attachNativeGoogleStage(error, stage) {
  if (error && typeof error === "object") {
    error.stage = stage;
  }
  return error;
}

export function isNativeGoogleSignInAvailable() {
  return isNativeMobileApp() && getMobilePlatform() === "android";
}

async function ensureNativeGoogleInitialized() {
  if (!GOOGLE_WEB_CLIENT_ID) {
    const error = new Error("Google Android web client ID is not configured");
    error.code = "GOOGLE_NATIVE_CONFIG_MISSING";
    throw error;
  }

  if (!googleInitializePromise) {
    googleInitializePromise = SocialLogin.initialize({
      google: {
        webClientId: GOOGLE_WEB_CLIENT_ID,
        mode: "online",
      },
    }).catch((error) => {
      googleInitializePromise = null;
      throw error;
    });
  }

  return googleInitializePromise;
}

async function parseErrorResponse(response) {
  try {
    const body = await response.json();
    return body?.message || "Google Sign-In failed.";
  } catch {
    return "Google Sign-In failed.";
  }
}

export async function signInWithNativeGoogle() {
  if (!isNativeGoogleSignInAvailable()) {
    const error = new Error("Native Google Sign-In is only available in the Android app");
    error.code = "GOOGLE_NATIVE_UNAVAILABLE";
    throw error;
  }
  if (!API_URL) {
    const error = new Error("NEXT_PUBLIC_API_URL is not configured");
    error.code = "API_URL_MISSING";
    throw error;
  }

  try {
    await ensureNativeGoogleInitialized();
  } catch (error) {
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.INITIALIZE, error);
    throw attachNativeGoogleStage(error, GOOGLE_NATIVE_STAGE.INITIALIZE);
  }

  let login;
  try {
    login = await SocialLogin.login({
      provider: "google",
      options: {
        scopes: ["email", "profile"],
      },
    });
  } catch (error) {
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.SOCIAL_LOGIN, error);
    throw attachNativeGoogleStage(error, GOOGLE_NATIVE_STAGE.SOCIAL_LOGIN);
  }

  const idToken = login?.result?.idToken;
  if (!idToken) {
    const error = new Error("Google did not return an ID token");
    error.code = "GOOGLE_ID_TOKEN_MISSING";
    error.stage = GOOGLE_NATIVE_STAGE.ID_TOKEN;
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.ID_TOKEN, error, {
      hasResult: Boolean(login?.result),
    });
    throw error;
  }

  let response;
  try {
    response = await fetch(`${API_URL}/api/auth/google-native`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch (error) {
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.BACKEND_REQUEST, error);
    throw attachNativeGoogleStage(error, GOOGLE_NATIVE_STAGE.BACKEND_REQUEST);
  }

  if (!response.ok) {
    const error = new Error(await parseErrorResponse(response));
    error.status = response.status;
    error.stage = GOOGLE_NATIVE_STAGE.BACKEND_RESPONSE;
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.BACKEND_RESPONSE, error);
    throw error;
  }

  try {
    return await response.json();
  } catch (error) {
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.BACKEND_JSON, error, { status: response.status });
    throw attachNativeGoogleStage(error, GOOGLE_NATIVE_STAGE.BACKEND_JSON);
  }
}
