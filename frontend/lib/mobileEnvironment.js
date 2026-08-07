import { Capacitor } from "@capacitor/core";

export function isNativeMobileApp() {
  if (typeof window === "undefined") return false;

  const capacitor = window.Capacitor || Capacitor;
  let platform = "web";
  try {
    platform = typeof capacitor?.getPlatform === "function" ? capacitor.getPlatform() : "web";
  } catch {
    platform = "web";
  }

  if (typeof capacitor?.isNativePlatform === "function") {
    try {
      // Use Capacitor's official native signal, limited to the mobile platforms
      // supported by this app.
      if (capacitor.isNativePlatform() && (platform === "ios" || platform === "android")) {
        return true;
      }
    } catch {
      // Fall through to bridge detection so a native API failure cannot break
      // hydration or click handlers in the Android shell.
    }
  }

  if (platform !== "ios" && platform !== "android") return false;

  // Fallback for older Capacitor runtimes without isNativePlatform(): require
  // the native bridge so regular mobile browsers are not treated as the app.
  return (
    typeof capacitor?.nativePromise === "function" ||
    typeof capacitor?.nativeCallback === "function"
  );
}

export function getMobilePlatform() {
  if (typeof window === "undefined") return "web";
  return Capacitor.getPlatform();
}
