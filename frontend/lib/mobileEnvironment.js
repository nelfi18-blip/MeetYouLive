import { Capacitor } from "@capacitor/core";

export function isNativeMobileApp() {
  if (typeof window === "undefined") return false;

  const capacitor = window.Capacitor || Capacitor;
  const platform = typeof capacitor?.getPlatform === "function" ? capacitor.getPlatform() : "web";

  if (typeof capacitor?.isNativePlatform === "function") {
    return capacitor.isNativePlatform();
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
