"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

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

  useEffect(() => {
    const handleUpdateReady = () => setUpdateReady(true);
    window.addEventListener("meetyoulive:sw-update-ready", handleUpdateReady);
    return () => {
      window.removeEventListener("meetyoulive:sw-update-ready", handleUpdateReady);
    };
  }, []);

  if (!updateReady) return null;

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
    </div>
  );
}
