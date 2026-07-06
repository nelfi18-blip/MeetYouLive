"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

function reportBoundaryError(error) {
  if (typeof window !== "undefined" && typeof window.reportError === "function") {
    window.reportError(error);
  }
}

export default function RouteErrorFallback({
  error,
  reset,
  titleKey = "routeError.defaultTitle",
  messageKey = "routeError.defaultMessage",
  homeHref = "/feed",
  homeLabelKey = "routeError.back",
}) {
  const { t } = useLanguage();

  useEffect(() => {
    reportBoundaryError(error);
  }, [error]);

  return (
    <main className="route-error-page">
      <section className="route-error-card" role="alert" aria-live="assertive">
        <p className="route-error-eyebrow">MeetYouLive</p>
        <h1>{t(titleKey)}</h1>
        <p>{t(messageKey)}</p>
        <div className="route-error-actions">
          <button type="button" onClick={reset}>
            {t("routeError.retry")}
          </button>
          <Link href={homeHref}>{t(homeLabelKey)}</Link>
        </div>
      </section>

      <style jsx>{`
        .route-error-page {
          min-height: 70vh;
          display: grid;
          place-items: center;
          padding: 2rem 1rem 6rem;
          background: var(--bg, #0f0821);
          color: var(--text, #fff);
        }

        .route-error-card {
          width: min(100%, 32rem);
          padding: 1.5rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 1.25rem;
          background: rgba(255, 255, 255, 0.06);
          text-align: center;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
        }

        .route-error-eyebrow {
          margin: 0 0 0.5rem;
          color: var(--accent, #ff4ecd);
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .route-error-card h1 {
          margin: 0 0 0.75rem;
          font-size: clamp(1.5rem, 4vw, 2rem);
        }

        .route-error-card p {
          color: var(--text-muted, #c8c1df);
          line-height: 1.5;
        }

        .route-error-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.75rem;
          margin-top: 1.25rem;
        }

        .route-error-actions button,
        .route-error-actions a {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 1rem;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(135deg, #ff4ecd, #7c5cff);
          color: #fff;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }
      `}</style>
    </main>
  );
}
