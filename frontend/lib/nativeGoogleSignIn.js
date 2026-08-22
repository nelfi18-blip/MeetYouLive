import { registerPlugin } from "@capacitor/core";
import { getMobilePlatform, isNativeMobileApp } from "./mobileEnvironment";

// Native MeetYouLive-owned replacement for @capgo/capacitor-social-login's
// Google provider. Backed by androidx.credentials.CredentialManager +
// GetSignInWithGoogleOption on Android (see MeetYouLiveGoogleAuthPlugin.java).
// Capgo remains available for other social providers.
const MeetYouLiveGoogleAuth = registerPlugin("MeetYouLiveGoogleAuth");

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

const GOOGLE_NATIVE_STAGE = Object.freeze({
  SIGN_IN: "sign_in",
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

// Keys whose values must never be surfaced in diagnostics (tokens, credentials, etc.).
const SENSITIVE_KEY_PATTERN = /token|credential|secret|password|authoriz|idtoken|accesstoken|refresh|serverauthcode/i;

// Best-effort, depth-limited sanitization so we can safely log/display
// `error.data` (or similar nested payloads) without leaking sensitive values
// or throwing on circular/unserializable structures.
function sanitizeErrorData(value, depth = 0) {
  if (value === null || value === undefined) return undefined;
  if (depth > 3) return "[truncated]";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeErrorData(item, depth + 1));
  }
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[redacted]";
        continue;
      }
      try {
        result[key] = sanitizeErrorData(value[key], depth + 1);
      } catch {
        result[key] = "[unserializable]";
      }
    }
    return result;
  }
  return undefined;
}

function getSafeNativeGoogleErrorDetails(error, stage, extra = {}) {
  const errorStatus = getSafeErrorValue(error, "status");
  return {
    stage,
    code: getSafeErrorValue(error, "code"),
    message: getSafeErrorValue(error, "message"),
    errorCode: getSafeErrorValue(error, "errorCode"),
    status: errorStatus,
    data: sanitizeErrorData(error?.data),
    ...(errorStatus === undefined && typeof extra.status === "number" ? { status: extra.status } : {}),
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

// Builds a short diagnostic label for the UI, e.g. "social_login / code=10 / DEVELOPER_ERROR",
// surfacing whatever fields the plugin/native layer actually provided instead of
// collapsing everything down to "unknown".
export function describeNativeGoogleError(error) {
  // TEMPORARY DIAGNOSTIC: when MeetYouLiveGoogleAuthPlugin.java retried the
  // sign-in after a "[16] Account reauth failed" first attempt, it attaches
  // the first attempt + clearCredentialStateAsync outcome alongside the
  // retry's own failure. Surface all three instead of only the terminal
  // retry exception. Remove once the native Google Sign-In failure is
  // root-caused.
  const firstAttemptStage = getSafeErrorValue(error?.data, "firstAttemptStage");
  if (firstAttemptStage) {
    const firstAttemptErrorType = getSafeErrorValue(error?.data, "firstAttemptErrorType");
    const firstAttemptMessage = getSafeErrorValue(error?.data, "firstAttemptMessageSanitized");
    const clearStateResult = getSafeErrorValue(error?.data, "clearStateResult") || "unknown";
    const retryStage = getSafeErrorValue(error?.data, "retryStage") || getSafeErrorValue(error?.data, "stage") || "unknown";
    const retryErrorType = getSafeErrorValue(error?.data, "retryErrorType") || getSafeErrorValue(error?.data, "errorType");
    const retryMessage = getSafeErrorValue(error?.data, "retryMessageSanitized");

    const firstLine = `first: ${[firstAttemptStage, firstAttemptErrorType, firstAttemptMessage].map((v) => (v === undefined ? "" : v)).join(" / ")}`;
    const clearLine = `clear: ${clearStateResult}`;
    const retryLine = `retry: ${[retryStage, retryErrorType, retryMessage].map((v) => (v === undefined ? "" : v)).join(" / ")}`;

    return ["Google Sign-In diagnostic", firstLine, clearLine, retryLine].join("\n");
  }

  // Prefer the granular native_google_* stage attached by
  // MeetYouLiveGoogleAuthPlugin.java (via call.reject's JSObject data) over
  // the coarser JS-level stage (sign_in/id_token/backend_*), since it points
  // to exactly where in the native flow the failure happened.
  const nativeStage = getSafeErrorValue(error?.data, "stage");
  const stage = nativeStage || getSafeErrorValue(error, "stage") || "unknown";
  const parts = [stage];

  const code = getSafeErrorValue(error, "code");
  if (code !== undefined && code !== "") {
    parts.push(`code=${code}`);
  }

  const secondary = [
    getSafeErrorValue(error?.data, "errorType"),
    getSafeErrorValue(error, "errorCode"),
    getSafeErrorValue(error, "status"),
    getSafeErrorValue(error, "message"),
  ].find((value) => value !== undefined && value !== "");
  if (secondary !== undefined && secondary !== "") {
    parts.push(String(secondary));
  }

  if (parts.length === 1) {
    parts.push("unknown");
  }

  return parts.join(" / ");
}

export function isNativeGoogleSignInAvailable() {
  return isNativeMobileApp() && getMobilePlatform() === "android";
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
  if (!GOOGLE_WEB_CLIENT_ID) {
    const error = new Error("Google Android web client ID is not configured");
    error.code = "GOOGLE_NATIVE_CONFIG_MISSING";
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.SIGN_IN, error);
    throw attachNativeGoogleStage(error, GOOGLE_NATIVE_STAGE.SIGN_IN);
  }

  let signInResult;
  try {
    signInResult = await MeetYouLiveGoogleAuth.signIn({ webClientId: GOOGLE_WEB_CLIENT_ID });
  } catch (error) {
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.SIGN_IN, error);
    throw attachNativeGoogleStage(error, GOOGLE_NATIVE_STAGE.SIGN_IN);
  }

  const idToken = signInResult?.idToken;
  if (!idToken) {
    const error = new Error("Google did not return an ID token");
    error.code = "GOOGLE_ID_TOKEN_MISSING";
    error.stage = GOOGLE_NATIVE_STAGE.ID_TOKEN;
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.ID_TOKEN, error, {
      hasResult: Boolean(signInResult),
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
