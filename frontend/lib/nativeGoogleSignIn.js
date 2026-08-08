"use client";

import { SocialLogin } from "@capgo/capacitor-social-login";
import { getMobilePlatform, isNativeMobileApp } from "./mobileEnvironment";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

let googleInitializePromise = null;

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
    return body?.message || "No se pudo iniciar sesión con Google.";
  } catch {
    return "No se pudo iniciar sesión con Google.";
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

  await ensureNativeGoogleInitialized();
  const login = await SocialLogin.login({
    provider: "google",
    options: {
      scopes: ["email", "profile"],
    },
  });

  const idToken = login?.result?.idToken;
  if (!idToken) {
    const error = new Error("Google did not return an ID token");
    error.code = "GOOGLE_ID_TOKEN_MISSING";
    throw error;
  }

  const response = await fetch(`${API_URL}/api/auth/google-native`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const error = new Error(await parseErrorResponse(response));
    error.status = response.status;
    throw error;
  }

  return response.json();
}
