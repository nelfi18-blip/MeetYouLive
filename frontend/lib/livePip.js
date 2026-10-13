"use client";

import { useEffect } from "react";
import { registerPlugin } from "@capacitor/core";
import { getMobilePlatform, isNativeMobileApp } from "@/lib/mobileEnvironment";

const LivePip = registerPlugin("LivePip");

function shouldUseNativeLivePip() {
  return (
    typeof window !== "undefined" &&
    getMobilePlatform() === "android" &&
    isNativeMobileApp()
  );
}

async function setNativeLivePipActive(active) {
  try {
    await LivePip.setActive({ active });
  } catch (error) {
    console.warn("[live-pip] Native LivePip.setActive call failed:", error);
  }
}

/**
 * useLivePip — tells the native Android shell (MainActivity) whether the
 * CURRENT Live room has an active Agora session (host or viewer), so that
 * pressing Home / switching apps enters Picture-in-Picture instead of just
 * sending the WebView to the background like any other screen.
 *
 * Architecture (see frontend/android/app/src/main/java/com/meetyoulive/app/
 * LivePipPlugin.java and MainActivity#onUserLeaveHint for the native half):
 *  - This hook only flips a boolean flag read by the Activity at the exact
 *    moment the user leaves the app. It never starts, joins, or duplicates
 *    an Agora session — the SAME client/tracks already created by the Agora
 *    join effect in live/[id]/page.jsx keep running untouched.
 *  - Entering PiP resizes the Activity window; Android pauses the Activity
 *    (onPause) but does NOT stop it while the floating PiP window stays on
 *    screen, so the WebView (and the Agora Web SDK tracks running inside
 *    it) keep executing exactly as before — no re-join, no re-publish.
 *  - Returning from PiP to full screen (tapping the PiP window, or Android
 *    restoring the Activity) resumes the SAME WebView/page instance — same
 *    room, same session, nothing to "come back" to beyond the OS resizing
 *    the window back.
 *  - Only wired for Android (`shouldUseNativeLivePip`): iOS Capacitor has no
 *    equivalent here (iOS Live PiP would need AVPictureInPictureController
 *    wired to a native AVSampleBufferDisplayLayer, not a WebView, and is out
 *    of scope for this Android-only fix). Desktop/mobile web browsers are
 *    also no-ops — this hook never touches `document` and never calls the
 *    (unrelated) browser Document Picture-in-Picture API.
 *
 * KNOWN LIMITATION (documented, not solved by this hook): PiP only keeps the
 * EXISTING session visible and running while Android still schedules the
 * Activity/WebView normally (i.e. while the floating PiP window is open).
 * If the user fully backgrounds the app WITHOUT PiP (e.g. unsupported OEM,
 * PiP denied by device policy, or the user swipes PiP away), Android may
 * eventually throttle or suspend the WebView's camera/mic tracks — this is
 * a platform constraint of WebView + Agora Web SDK, not something any
 * Capacitor plugin can override without migrating the Live publish path to
 * Agora's Native Android SDK running in a real camera/microphone
 * foreground service. See the Agora join effect in live/[id]/page.jsx
 * (recoverHostTracks/scheduleHostTrackRecovery) for the existing recovery
 * path that re-creates the host's local tracks when the app returns to the
 * foreground after such a suspension, instead of silently ending the Live.
 *
 * @param {boolean} active - true whenever this Live room page has a
 *   connected Agora session right now (host OR viewer) — pass the existing
 *   `agoraJoined` state as-is, no new tracking needed.
 */
export default function useLivePip(active) {
  const useNative = shouldUseNativeLivePip();

  useEffect(() => {
    if (!useNative) return undefined;
    if (!active) {
      setNativeLivePipActive(false);
      return undefined;
    }

    let cancelled = false;
    setNativeLivePipActive(true).then(() => {
      if (cancelled) setNativeLivePipActive(false);
    });

    return () => {
      cancelled = true;
      setNativeLivePipActive(false);
    };
  }, [useNative, active]);
}
