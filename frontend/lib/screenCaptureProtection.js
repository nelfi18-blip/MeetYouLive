"use client";

import { useEffect, useLayoutEffect, useState } from "react";
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

// Live content stays mounted (preserving media refs) but is concealed until the
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
        setResult({ scopeKey, attempt, failed: true });
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
    ready: !android || !enabled || Boolean(current && result.ready),
    failed: Boolean(android && enabled && current && result.failed),
    retry: () => setAttempt(value => value + 1),
  };
}
