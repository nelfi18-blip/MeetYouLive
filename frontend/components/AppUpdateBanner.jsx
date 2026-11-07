"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getMobilePlatform, isNativeMobileApp } from "@/lib/mobileEnvironment";
import { ANDROID_PLAY_STORE_URL, getAndroidUpdateStatus } from "@/lib/androidUpdatePolicy";

/**
 * AppUpdateBanner - Consumes the `meetyoulive:sw-update-ready` event dispatched
 * by ServiceWorkerRegistration whenever a new deployment's service worker has
 * finished installing.
 *
 * Root cause this fixes: that event was already being dispatched (see
 * ServiceWorkerRegistration.jsx) but nothing in the app was listening for it.
 * A tab left open across a deploy — most commonly a HOST who keeps the Live
 * room open for a long, continuous broadcast — never learned a new build was
 * available and kept rendering whatever JSX/CSS had already been loaded into
 * memory before the deploy, while a VIEWER who opened the room afterwards got
 * the new bundle immediately. This produced the exact symptom of the host
 * still showing pre-modernization stage overlays after a redesign (e.g. #984)
 * had already shipped and was visible to viewers.
 *
 * The banner only prompts; it never auto-reloads. Reloading is left to the
 * user's tap so an active HOST broadcast (Agora publish/join) is never
 * interrupted automatically.
 */
export default function AppUpdateBanner() {
  const { t } = useLanguage();
  const [updateReady, setUpdateReady] = useState(false);
  const [androidUpdate, setAndroidUpdate] = useState(null);
  const [androidNoticeDismissed, setAndroidNoticeDismissed] = useState(false);

  // The Capacitor shell never registers a PWA service worker, so the
  // sw-update-ready event cannot announce a new Google Play Android release.
  // Check the installed native version against a public, non-secret manifest.
  // Only compare on Android, and only when app opens/resumes; no background
  // tracking and never an automatic restart of a broadcasting Live.
  useEffect(() => {
    if (!isNativeMobileApp() || getMobilePlatform() !== "android") return undefined;
    let active = true;
    let resumeListener;
    const check = async () => {
      try {
        const [{ App }, response] = await Promise.all([
          import("@capacitor/app"),
          fetch("/android-release.json", { cache: "no-store" }),
        ]);
        if (!response.ok) return;
        const [info, manifest] = await Promise.all([App.getInfo(), response.json()]);
        if (active) setAndroidUpdate(getAndroidUpdateStatus(info.build, manifest));
      } catch {
        // Network/Play availability failures must never obstruct the app.
      }
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    import("@capacitor/app")
      .then(({ App }) => App.addListener("resume", check))
      .then((listener) => {
        if (active) resumeListener = listener;
        else listener?.remove();
      })
      .catch(() => {});
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      resumeListener?.remove();
    };
  }, []);

  const openAndroidUpdate = async () => {
    // Preserve the running Live session in its WebView; never location.reload
    // or replace the current route when opening Google Play.
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: ANDROID_PLAY_STORE_URL });
    } catch {
      window.open(ANDROID_PLAY_STORE_URL, "_blank", "noopener,noreferrer");
    }
  };

  useEffect(() => {
    const handleUpdateReady = () => setUpdateReady(true);
    window.addEventListener("meetyoulive:sw-update-ready", handleUpdateReady);
    return () => {
      window.removeEventListener("meetyoulive:sw-update-ready", handleUpdateReady);
    };
  }, []);

  const showAndroid = Boolean(androidUpdate && (!androidNoticeDismissed || androidUpdate.required));
  if (!updateReady && !showAndroid) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        flexWrap: "wrap",
        padding: "10px 16px",
        textAlign: "center",
        fontSize: "14px",
        fontWeight: 500,
        background: "linear-gradient(135deg, #8b5cf6 0%, #e040fb 100%)",
        color: "#ffffff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {showAndroid ? (
        <>
          <span>{t(androidUpdate.required ? "appUpdateBanner.androidRequired" : "appUpdateBanner.androidAvailable")}</span>
          <button type="button" onClick={openAndroidUpdate} style={{
            background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: "999px", color: "#fff", fontWeight: 700, fontSize: 13,
            padding: "7px 14px", cursor: "pointer",
          }}>{t("appUpdateBanner.openPlayStore")}</button>
          {!androidUpdate.required && (
            <button type="button" onClick={() => setAndroidNoticeDismissed(true)}
              aria-label={t("appUpdateBanner.dismiss")} style={{
                background: "transparent", border: "none", color: "#fff", cursor: "pointer",
              }}>×</button>
          )}
        </>
      ) : (
        <>
          <span>✨ {t("appUpdateBanner.message")}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: "999px",
          color: "#ffffff",
          fontWeight: 700,
          fontSize: "13px",
          padding: "4px 14px",
          cursor: "pointer",
        }}
      >
        {t("appUpdateBanner.reload")}
      </button>
        </>
      )}
    </div>
  );
}
