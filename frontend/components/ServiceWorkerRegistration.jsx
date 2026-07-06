"use client";

import { useEffect } from "react";

/**
 * ServiceWorkerRegistration - Registers the main PWA service worker for offline support
 * This component runs once on mount and registers sw.js for caching and offline functionality
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;

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
        if (cancelled) return;

        updateInterval = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
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
