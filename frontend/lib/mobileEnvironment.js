import { Capacitor } from "@capacitor/core";

export function isNativeMobileApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export function getMobilePlatform() {
  if (typeof window === "undefined") return "web";
  return Capacitor.getPlatform();
}

