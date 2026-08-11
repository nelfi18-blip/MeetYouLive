import { Capacitor, registerPlugin } from "@capacitor/core";
import { getMobilePlatform, isNativeMobileApp } from "./mobileEnvironment";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
const NATIVE_GOOGLE_AUTH_PLUGIN_NAME = "NativeGoogleAuth";
const NativeGoogleAuth = registerPlugin(NATIVE_GOOGLE_AUTH_PLUGIN_NAME);

const GOOGLE_NATIVE_STAGE = Object.freeze({
  CONFIG: "config",
  // The Capacitor JS<->native bridge never recognized the plugin (it never
  // reached Android's Credential Manager at all). This is distinct from
  // CREDENTIAL_MANAGER below, which means the native call was made but the
  // Credential Manager API itself rejected/failed the request.
  BRIDGE: "bridge",
  CREDENTIAL_MANAGER: "credential_manager",
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
  const errorStatus = getSafeErrorValue(error, "status");
  return {
    stage,
    code: getSafeErrorValue(error, "code"),
    message: getSafeErrorValue(error, "message"),
    errorCode: getSafeErrorValue(error, "errorCode"),
    status: errorStatus,
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

export function isNativeGoogleSignInAvailable() {
  return isNativeMobileApp() && getMobilePlatform() === "android";
}

function ensureNativeGoogleConfigured() {
  if (!GOOGLE_WEB_CLIENT_ID) {
    const error = new Error("Google Android web client ID is not configured");
    error.code = "GOOGLE_NATIVE_CONFIG_MISSING";
    throw error;
  }
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
    ensureNativeGoogleConfigured();
  } catch (error) {
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.CONFIG, error);
    throw attachNativeGoogleStage(error, GOOGLE_NATIVE_STAGE.CONFIG);
  }

  // Detect a Capacitor bridge that never registered the native plugin (e.g. a
  // stale WebView bridge or a build where the plugin didn't load) *before*
  // calling signIn(). Without this check, Capacitor's own JS proxy throws a
  // CapacitorException with code "UNIMPLEMENTED" the moment the plugin/method
  // isn't recognized, and the catch block below used to mislabel that as a
  // "credential_manager" failure even though Credential Manager was never
  // invoked. See @capacitor/core core/src/runtime.ts + core/src/util.ts
  // (ExceptionCode.Unimplemented === "UNIMPLEMENTED").
  if (!Capacitor.isPluginAvailable(NATIVE_GOOGLE_AUTH_PLUGIN_NAME)) {
    const error = new Error("Native Google Sign-In plugin is not available on the bridge");
    error.code = "PLUGIN_UNAVAILABLE";
    logNativeGoogleStageFailure(GOOGLE_NATIVE_STAGE.BRIDGE, error);
    throw attachNativeGoogleStage(error, GOOGLE_NATIVE_STAGE.BRIDGE);
  }

  let login;
  try {
    login = await NativeGoogleAuth.signIn({ webClientId: GOOGLE_WEB_CLIENT_ID });
  } catch (error) {
    // A CapacitorException with code "UNIMPLEMENTED" here still means the
    // bridge, not Credential Manager, rejected the call (e.g. a race where
    // availability changed between the check above and this call).
    const stage = error?.code === "UNIMPLEMENTED" ? GOOGLE_NATIVE_STAGE.BRIDGE : GOOGLE_NATIVE_STAGE.CREDENTIAL_MANAGER;
    logNativeGoogleStageFailure(stage, error);
    throw attachNativeGoogleStage(error, stage);
  }

  const idToken = login?.idToken;
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
