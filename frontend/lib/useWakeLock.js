"use client";

import { useEffect, useRef } from "react";

/**
 * useWakeLock — keeps the screen awake (no auto-dim/auto-lock) while `active`
 * is true, using the standard Screen Wake Lock API.
 *
 * Scope & limitations (by design, do not oversell):
 *  - Only prevents the OS from auto-locking the screen due to inactivity.
 *  - It CANNOT keep audio/video/Agora running if the user manually presses
 *    the hardware power button to lock the phone, nor can it survive the
 *    browser tab/app being suspended or killed by the OS in the background.
 *  - Inside the installed Android app (Capacitor/WebView) the Wake Lock API
 *    is typically unavailable or unreliable; true "continue through a locked
 *    screen" behavior there requires a native foreground service + a
 *    persistent notification, which is out of scope here (needs new Android
 *    permissions and an app rebuild) and is intentionally NOT attempted.
 *  - No-ops silently (never throws) when unsupported, e.g. iOS Safari,
 *    native WebViews, or when the document is not visible.
 *
 * @param {boolean} active - whether the lock should be held right now.
 */
export default function useWakeLock(active) {
  const lockRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    if (typeof navigator === "undefined" || !navigator.wakeLock) return undefined;

    let cancelled = false;

    const requestLock = async () => {
      try {
        if (document.visibilityState !== "visible") return;
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
        lock.addEventListener("release", () => {
          if (lockRef.current === lock) lockRef.current = null;
        });
      } catch (_err) {
        // Permission denied, unsupported, or tab hidden — fail silently.
      }
    };

    requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !lockRef.current) {
        requestLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock) lock.release().catch(() => {});
    };
  }, [active]);
}
