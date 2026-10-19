"use client";

import { isNativeMobileApp } from "./mobileEnvironment";

/**
 * Checks whether the current environment can plausibly run the AWS Amplify
 * Face Liveness capture widget (`@aws-amplify/ui-react-liveness`), WITHOUT
 * claiming it actually works — this is only a best-effort feature detection
 * (camera API + WebRTC availability) run before we even attempt the dynamic
 * import.
 *
 * IMPORTANT: this project has NOT yet verified the Amplify Liveness widget
 * inside the Capacitor native WebView on a real iOS/Android device. Per the
 * phase-1 requirement to never claim native support without checking it, we
 * deliberately treat the native app shell as unsupported until that
 * verification happens, even though the npm package itself installs and
 * compiles fine for the web build.
 */
export function getPhotoVerificationCapability() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "SSR" };
  }

  if (isNativeMobileApp()) {
    return { supported: false, reason: "CAPACITOR_NOT_VERIFIED" };
  }

  const hasMediaDevices =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";
  if (!hasMediaDevices) {
    return { supported: false, reason: "NO_CAMERA_API" };
  }

  const isSecureContext = typeof window.isSecureContext === "boolean" ? window.isSecureContext : true;
  if (!isSecureContext) {
    return { supported: false, reason: "INSECURE_CONTEXT" };
  }

  return { supported: true, reason: "" };
}
