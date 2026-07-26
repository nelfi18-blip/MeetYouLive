"use client";

import { Preferences } from "@capacitor/preferences";
import { isNativeMobileApp } from "./mobileEnvironment";

const USER_TOKEN_KEY = "meetyoulive.backendToken";
const ADMIN_TOKEN_KEY = "meetyoulive.adminBackendToken";

function getKey(isAdmin = false) {
  return isAdmin ? ADMIN_TOKEN_KEY : USER_TOKEN_KEY;
}

export function persistNativeToken(token, { isAdmin = false } = {}) {
  if (!token || !isNativeMobileApp()) return;
  Preferences.set({ key: getKey(isAdmin), value: token }).catch(() => {});
}

export function clearNativeToken({ isAdmin = false } = {}) {
  if (!isNativeMobileApp()) return;
  Preferences.remove({ key: getKey(isAdmin) }).catch(() => {});
}

export function clearNativeTokens() {
  if (!isNativeMobileApp()) return;
  Promise.all([
    Preferences.remove({ key: USER_TOKEN_KEY }),
    Preferences.remove({ key: ADMIN_TOKEN_KEY }),
  ]).catch(() => {});
}

export async function restoreNativeToken({ isAdmin = false } = {}) {
  if (!isNativeMobileApp()) return null;
  const { value } = await Preferences.get({ key: getKey(isAdmin) }).catch(() => ({ value: null }));
  return value || null;
}
