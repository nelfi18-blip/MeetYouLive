"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { getMobilePlatform, isNativeMobileApp } from "@/lib/mobileEnvironment";
import { createScreenCaptureProtectionController } from "./screenCaptureProtectionController";
import { applyVerifiedScreenSecurity } from "./screenSecurityContract";

let updateRequired = false;

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
    const result = await applyVerifiedScreenSecurity(ScreenSecurity, enabled);
    updateRequired = result.updateRequired;
    return result.success;
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

// Live content starts only after confirmation; an already protected Window
// is reused across room/mini-player mounts without interrupting the session. The
// bridge acknowledges protection and two UI frames have elapsed. The native
// plugin now verifies FLAG_SECURE on the UI thread before acknowledging. The
// extra frames are conservative; physical media/compositor tests remain needed.
export function useAndroidScreenCaptureGuard(enabled, scopeKey) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const android = shouldApplyAndroidScreenSecurity();
  useLayoutEffect(() => {
    if (!android) return undefined;
    if (!enabled) { protection.reconcile(); return undefined; }
    let active = true, firstFrame, secondFrame;
    const release = protection.acquire();
    protection.reconcile().then(success => {
      if (!active) return;
      if (!success) {
        setResult({ scopeKey, attempt, failed: true, updateRequired });
        return;
      }
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (active) setResult({ scopeKey, attempt, ready: true });
        });
      });
    });
    return () => {
      active = false;
      setResult(null);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      release();
    };
  }, [android, enabled, scopeKey, attempt]);
  const current = result?.scopeKey === scopeKey && result?.attempt === attempt;
  return {
    android,
    ready: !android || !enabled || protection.isProtected() || Boolean(current && result.ready),
    failed: Boolean(android && enabled && current && result.failed),
    updateRequired: Boolean(current && result.updateRequired),
    retry: () => setAttempt(value => value + 1),
  };
}
