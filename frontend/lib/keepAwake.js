"use client";

import { useEffect } from "react";
import { registerPlugin } from "@capacitor/core";
import { getMobilePlatform, isNativeMobileApp } from "@/lib/mobileEnvironment";
import useWakeLock from "@/lib/useWakeLock";

const KeepAwake = registerPlugin("KeepAwake");

function shouldUseNativeKeepAwake() {
  return (
    typeof window !== "undefined" &&
    getMobilePlatform() === "android" &&
    isNativeMobileApp()
  );
}

async function setNativeKeepAwake(enabled) {
  try {
    if (enabled) {
      await KeepAwake.enable();
    } else {
      await KeepAwake.disable();
    }
    return true;
  } catch (error) {
    console.warn("[keep-awake] Native keep-awake call failed:", error);
    return false;
  }
}

/**
 * useKeepAwake — keeps the device screen from auto-locking (due to OS
 * inactivity timeout) while `active` is true.
 *
 * Two implementations are combined here, picked automatically:
 *  - Installed Android app (Capacitor): uses the native `KeepAwake` plugin
 *    (FLAG_KEEP_SCREEN_ON on the Activity window). This is required because
 *    the web Screen Wake Lock API is frequently unsupported/unreliable
 *    inside the Capacitor WebView, so it cannot be relied on alone for
 *    hosts broadcasting from the Play Store app.
 *  - Everything else (desktop/mobile web browsers, iOS web, etc.): uses the
 *    standard Screen Wake Lock API via `useWakeLock` (already a safe no-op
 *    where unsupported).
 *
 * Both call sites are intentionally driven by a single `active` boolean so
 * only one implementation is ever engaged at a time per platform — no
 * duplicated locks/listeners.
 *
 * Scope & limitations (do not oversell, see also useWakeLock.js):
 *  - This only prevents the automatic screen-off timer. It does not keep
 *    the camera/mic/Agora connection alive through a MANUAL power-button
 *    screen lock, and it does not survive the OS killing the app process
 *    in the background. That would require a native foreground service
 *    with a persistent notification (new permissions + new Android
 *    version), which is explicitly out of scope for this change.
 *  - Must be explicitly turned off when the stream ends, is left, or the
 *    component unmounts — this hook's cleanup does that automatically.
 *
 * @param {boolean} active - whether the lock should be held right now
 *   (e.g. true whenever the user — host or viewer — is actively joined to
 *   a live Agora session, since both roles benefit from the screen not
 *   auto-locking mid-stream).
 */
export default function useKeepAwake(active) {
  const useNative = shouldUseNativeKeepAwake();

  // Native Android branch: only mounted when running inside the installed
  // Capacitor app on Android.
  useEffect(() => {
    if (!useNative) return undefined;
    if (!active) {
      setNativeKeepAwake(false);
      return undefined;
    }

    let cancelled = false;
    setNativeKeepAwake(true).then((applied) => {
      if (cancelled && applied) setNativeKeepAwake(false);
    });

    return () => {
      cancelled = true;
      setNativeKeepAwake(false);
    };
  }, [useNative, active]);

  // Web Wake Lock API branch: only engaged when NOT using the native path,
  // so the two implementations never run concurrently.
  useWakeLock(!useNative && active);
}
