"use client";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ScreenCaptureBoundary({ capture, children }) {
  const { t } = useLanguage();
  return <>
    {!capture.ready && <div role={capture.failed ? "alert" : "status"} className="card" style={{ padding: 16 }}>
      <p>{t(capture.updateRequired ? "screenCaptureProtection.updateRequired" : capture.failed ? "screenCaptureProtection.failed" : "screenCaptureProtection.preparing")}</p>
      {capture.updateRequired && <a href="https://play.google.com/store/apps/details?id=com.meetyoulive.app" target="_blank" rel="noopener noreferrer">
        {t("screenCaptureProtection.update")}
      </a>}
      {capture.failed && !capture.updateRequired && <button type="button" style={{ minHeight: 44 }} onClick={capture.retry}>
        {t("screenCaptureProtection.retry")}
      </button>}
    </div>}
    <div aria-hidden={!capture.ready} inert={!capture.ready}
      style={capture.ready ? undefined : { visibility: "hidden", opacity: 0, pointerEvents: "none" }}>
      {children}
    </div>
  </>;
}
