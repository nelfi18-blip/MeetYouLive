"use client";

import { useEffect } from "react";

/**
 * ServiceWorkerRegistration - Registers the main PWA service worker for offline support
 * This component runs once on mount and registers sw.js for caching and offline functionality
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Only run in browser
    if (typeof window === "undefined") return;

    // Check if service workers are supported
    if (!("serviceWorker" in navigator)) {
      console.log("Service workers are not supported in this browser");
      return;
    }

    // Register the main service worker
    const registerServiceWorker = async () => {
      try {
        // Wait for page load to avoid impacting initial page performance
        if (document.readyState === "loading") {
          await new Promise((resolve) => {
            window.addEventListener("load", resolve, { once: true });
          });
        }

        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        console.log("Service worker registered successfully:", registration.scope);

        // Check for updates periodically (every hour)
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        // Listen for updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New service worker available, could show a notification to refresh
              console.log("New service worker available, please refresh the page");
            }
          });
        });
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    registerServiceWorker();
  }, []);

  return null; // This component doesn't render anything
}
