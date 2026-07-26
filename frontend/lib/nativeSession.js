"use client";

import { Preferences } from "@capacitor/preferences";
import { isNativeMobileApp } from "./mobileEnvironment";

const USER_TOKEN_KEY = "meetyoulive.backendToken";
const ADMIN_TOKEN_KEY = "meetyoulive.adminBackendToken";

function logNativePreferenceError(action, error) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[nativeSession] ${action} failed:`, error);
  }
}

function getKey(isAdmin = false) {
  return isAdmin ? ADMIN_TOKEN_KEY : USER_TOKEN_KEY;
}

export function persistNativeToken(token, { isAdmin = false } = {}) {
  if (!token || !isNativeMobileApp()) return;
  Preferences.set({ key: getKey(isAdmin), value: token }).catch((error) => {
    logNativePreferenceError("persist token", error);
  });
}

export function clearNativeToken({ isAdmin = false } = {}) {
  if (!isNativeMobileApp()) return;
  Preferences.remove({ key: getKey(isAdmin) }).catch((error) => {
    logNativePreferenceError("clear token", error);
  });
}

export function clearNativeTokens() {
  if (!isNativeMobileApp()) return;
  Promise.all([
    Preferences.remove({ key: USER_TOKEN_KEY }),
    Preferences.remove({ key: ADMIN_TOKEN_KEY }),
  ]).catch((error) => {
    logNativePreferenceError("clear tokens", error);
  });
}

export async function restoreNativeToken({ isAdmin = false } = {}) {
  if (!isNativeMobileApp()) return null;
  const { value } = await Preferences.get({ key: getKey(isAdmin) }).catch((error) => {
    logNativePreferenceError("restore token", error);
    return { value: null };
  });
  return value || null;
}
