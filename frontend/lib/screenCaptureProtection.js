"use client";

import { useEffect } from "react";
import { registerPlugin } from "@capacitor/core";
import { getMobilePlatform, isNativeMobileApp } from "@/lib/mobileEnvironment";
import { createScreenCaptureProtectionController } from "./screenCaptureProtectionController";

const ScreenSecurity = registerPlugin("ScreenSecurity");

function shouldApplyAndroidScreenSecurity() {
  try {
    return typeof window !== "undefined" &&
      getMobilePlatform() === "android" && isNativeMobileApp();
  } catch {
    return false;
  }
}

async function applyAndroidScreenCaptureProtection(enabled) {
  if (!shouldApplyAndroidScreenSecurity()) return false;

  try {
    if (enabled) {
      await ScreenSecurity.enable();
    } else {
      await ScreenSecurity.disable();
    }
    return true;
  } catch (error) {
    console.warn("[screen-security] Android screen capture protection failed:", error);
    return false;
  }
}

const protection = createScreenCaptureProtectionController(applyAndroidScreenCaptureProtection);
let releaseExplicitProtection;

// Preserve the original imperative API as an owner, not a global override.
export async function setAndroidScreenCaptureProtection(enabled) {
  if (!shouldApplyAndroidScreenSecurity()) return false;
  if (enabled && !releaseExplicitProtection) releaseExplicitProtection = protection.acquire();
  if (!enabled) { releaseExplicitProtection?.(); releaseExplicitProtection = undefined; }
  return protection.reconcile();
}

export function useAndroidScreenCaptureProtection(enabled = true, scopeKey) {
  useEffect(() => {
    if (!shouldApplyAndroidScreenSecurity()) return undefined;
    if (enabled) return protection.acquire();
    protection.reconcile();
    return undefined;
  }, [enabled, scopeKey]);
}
