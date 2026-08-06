"use client";

import { useEffect } from "react";
import { registerPlugin } from "@capacitor/core";
import { getMobilePlatform, isNativeMobileApp } from "@/lib/mobileEnvironment";

const ScreenSecurity = registerPlugin("ScreenSecurity");

function shouldApplyAndroidScreenSecurity() {
  return (
    typeof window !== "undefined" &&
    getMobilePlatform() === "android" &&
    isNativeMobileApp()
  );
}

export async function setAndroidScreenCaptureProtection(enabled) {
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

export function useAndroidScreenCaptureProtection(enabled = true) {
  useEffect(() => {
    if (!enabled) {
      setAndroidScreenCaptureProtection(false);
      return undefined;
    }

    let active = true;

    setAndroidScreenCaptureProtection(true).then((applied) => {
      if (!active && applied) {
        setAndroidScreenCaptureProtection(false);
      }
    });

    return () => {
      active = false;
      setAndroidScreenCaptureProtection(false);
    };
  }, [enabled]);
}
