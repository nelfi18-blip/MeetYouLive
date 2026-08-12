"use client";

import { useEffect } from "react";
import { isNativeMobileApp } from "@/lib/mobileEnvironment";

const MEETYOULIVE_CACHE_PREFIX = "meetyoulive-";

/**
 * cleanupResidualPwaState - One-way cleanup of PWA Service Workers/caches that may
 * have persisted in the Capacitor WebView from a previous version of the app that
 * registered sw.js. It only unregisters existing registrations and removes
 * MeetYouLive-prefixed caches; it never touches localStorage, cookies, session data,
 * or native Preferences, and it never re-registers sw.js afterwards.
 */
export async function cleanupResidualPwaState() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Best-effort cleanup; ignore failures so native app startup is never blocked.
  }

  try {
    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(MEETYOULIVE_CACHE_PREFIX))
          .map((name) => window.caches.delete(name))
      );
    }
  } catch {
    // Best-effort cleanup; ignore failures so native app startup is never blocked.
  }
}

/**
 * ServiceWorkerRegistration - Registers the main PWA service worker for offline support
 * This component runs once on mount and registers sw.js for caching and offline functionality
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeMobileApp()) {
      // Native apps never register the service worker, but earlier WebView
      // versions did. Clean up any residual registrations/caches so they can't
      // shadow native behavior, without re-registering sw.js afterwards.
      cleanupResidualPwaState();
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    let updateInterval;
    let cancelled = false;
    const loadController = new AbortController();
    const updateController = new AbortController();
    const stateController = new AbortController();

    const registerServiceWorker = async () => {
      try {
        if (document.readyState === "loading") {
          await new Promise((resolve) => {
            window.addEventListener("load", resolve, {
              once: true,
              signal: loadController.signal,
            });
          });
        }

        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (cancelled) return;

        updateInterval = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Fired when an updated service worker is installed; UI consumers can show a reload prompt.
              window.dispatchEvent(new Event("meetyoulive:sw-update-ready"));
            }
          }, { signal: stateController.signal });
        }, { signal: updateController.signal });
      } catch (error) {
        if (!loadController.signal.aborted && typeof window.reportError === "function") {
          window.reportError(error);
        }
      }
    };

    registerServiceWorker();

    return () => {
      cancelled = true;
      loadController.abort();
      updateController.abort();
      stateController.abort();
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    };
  }, []);

  return null; // This component doesn't render anything
}
