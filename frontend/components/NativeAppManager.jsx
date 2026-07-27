"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Keyboard } from "@capacitor/keyboard";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { usePathname, useRouter } from "next/navigation";
import { isNativeMobileApp } from "@/lib/mobileEnvironment";
import { persistNativeRoute } from "@/lib/nativeSession";
import { APP_ORIGINS, getInternalAppPath, isExternalHttpUrl, isInternalAppUrl } from "@/lib/nativeUrlPolicy";

const EXIT_GUARD_PATHS = new Set(["/feed", "/profile", "/chats", "/live"]);
const EXIT_CONFIRM_PATHS = new Set(["/", "/dashboard"]);
const KNOWN_DEEP_LINK_PREFIXES = [
  "/login",
  "/feed",
  "/verify-email",
  "/reset-password",
  "/forgot-password",
  "/chats",
  "/chat",
  "/live",
  "/call",
  "/calls",
  "/coins",
  "/profile",
  "/creator",
  "/creator-center",
  "/dashboard/creator",
  "/wallet",
  "/matches",
  "/match",
  "/crush",
  "/vip",
  "/settings/notifications",
];

function logNativeError(action, error) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[NativeAppManager] ${action} failed:`, error);
  }
}

function getSafeNativePath(url) {
  try {
    const parsed = new URL(url);
    let path = "/";

    if (parsed.protocol === "meetyoulive:") {
      path = parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname || "/";
    } else if (APP_ORIGINS.has(parsed.origin)) {
      path = parsed.pathname || "/";
    }

    if (!KNOWN_DEEP_LINK_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return "/";
    }

    return `${path}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function hasOpenModal() {
  return Boolean(
    document.querySelector("dialog[open], [aria-modal='true'], .modal-overlay, .modal-backdrop, .modal-content")
  );
}

function closeTopModal() {
  if (!hasOpenModal()) return false;
  window.dispatchEvent(new CustomEvent("meetyoulive:native-back"));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return true;
}

export default function NativeAppManager() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname || "/");
  const lastExitPressRef = useRef(0);
  const [exitHint, setExitHint] = useState("");

  useEffect(() => {
    pathnameRef.current = pathname || "/";
  }, [pathname]);

  useEffect(() => {
    if (!isNativeMobileApp()) return;

    document.documentElement.classList.add("native-mobile-app");

    StatusBar.setStyle({ style: Style.Dark }).catch((error) => logNativeError("StatusBar.setStyle", error));
    StatusBar.setBackgroundColor({ color: "#0f0821" }).catch((error) => logNativeError("StatusBar.setBackgroundColor", error));
    StatusBar.setOverlaysWebView({ overlay: false }).catch((error) => logNativeError("StatusBar.setOverlaysWebView", error));
    Keyboard.setResizeMode({ mode: "body" }).catch((error) => logNativeError("Keyboard.setResizeMode", error));

    const hideSplash = window.setTimeout(() => {
      SplashScreen.hide({ fadeOutDuration: 220 }).catch((error) => logNativeError("SplashScreen.hide", error));
    }, 350);

    const appUrlListener = App.addListener("appUrlOpen", ({ url }) => {
      const safePath = getSafeNativePath(url);
      Browser.close().catch(() => {});
      router.replace(safePath);
    });

    const backListener = App.addListener("backButton", ({ canGoBack }) => {
      const currentPath = pathnameRef.current || "/";
      if (closeTopModal()) return;

      if (EXIT_GUARD_PATHS.has(currentPath)) {
        const now = Date.now();
        if (now - lastExitPressRef.current < 1800) {
          App.exitApp();
          return;
        }
        lastExitPressRef.current = now;
        setExitHint("Pulsa atrás otra vez para salir");
        return;
      }

      if (EXIT_CONFIRM_PATHS.has(currentPath)) {
        const now = Date.now();
        if (now - lastExitPressRef.current < 1800) {
          App.exitApp();
          return;
        }
        lastExitPressRef.current = now;
        setExitHint("Pulsa atrás otra vez para salir");
        return;
      }

      if (canGoBack && window.history.length > 1) {
        router.back();
        return;
      }

      router.replace("/feed");
    });

    const clickHandler = (event) => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || event.defaultPrevented) return;
      const href = anchor.href;
      if (isInternalAppUrl(href)) {
        const appPath = getInternalAppPath(href);
        if (appPath) {
          event.preventDefault();
          router.push(appPath);
        }
        return;
      }
      if (!isExternalHttpUrl(href)) return;
      event.preventDefault();
      Browser.open({ url: href, presentationStyle: "fullscreen" }).catch((error) => {
        logNativeError("Browser.open", error);
        window.location.href = href;
      });
    };

    const originalWindowOpen = window.open;
    window.open = (url, target, features) => {
      if (typeof url === "string" && isInternalAppUrl(url)) {
        const appPath = getInternalAppPath(url);
        if (appPath) {
          router.push(appPath);
          return null;
        }
      }
      if (typeof url === "string" && isExternalHttpUrl(url)) {
        Browser.open({ url, presentationStyle: "fullscreen" }).catch((error) => {
          logNativeError("Browser.open", error);
          window.location.href = url;
        });
        return null;
      }
      return originalWindowOpen.call(window, url, target, features);
    };

    document.addEventListener("click", clickHandler);

    return () => {
      clearTimeout(hideSplash);
      document.documentElement.classList.remove("native-mobile-app");
      appUrlListener.then((listener) => listener.remove()).catch((error) => logNativeError("remove appUrlOpen listener", error));
      backListener.then((listener) => listener.remove()).catch((error) => logNativeError("remove backButton listener", error));
      document.removeEventListener("click", clickHandler);
      window.open = originalWindowOpen;
    };
  }, [router]);

  useEffect(() => {
    if (!isNativeMobileApp()) return;
    const path = `${pathname || "/"}${window.location.search}${window.location.hash}`;
    persistNativeRoute(path);
  }, [pathname]);

  useEffect(() => {
    if (!isNativeMobileApp()) return;
    const timeout = setTimeout(() => setExitHint(""), 1800);
    return () => clearTimeout(timeout);
  }, [exitHint]);

  useEffect(() => {
    if (!isNativeMobileApp()) return;
    const updateStatus = async () => {
      const status = await Network.getStatus().catch((error) => {
        logNativeError("Network.getStatus", error);
        return { connected: navigator.onLine };
      });
      window.dispatchEvent(new CustomEvent("meetyoulive:native-network", { detail: status }));
    };
    updateStatus();
    const listener = Network.addListener("networkStatusChange", (status) => {
      window.dispatchEvent(new CustomEvent("meetyoulive:native-network", { detail: status }));
    });
    return () => {
      listener.then((handle) => handle.remove()).catch((error) => logNativeError("remove networkStatusChange listener", error));
    };
  }, []);

  if (!exitHint) return null;

  return (
    <div className="native-exit-hint" role="status" aria-live="polite">
      {exitHint}
    </div>
  );
}
