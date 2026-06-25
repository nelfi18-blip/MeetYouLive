"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function PublicProfileError({ error, reset }) {
  const { t } = useLanguage();

  useEffect(() => {
    console.error("[public-profile-error]", error);
  }, [error]);

  return (
    <main className="public-profile-page">
      <section className="profile-state profile-state--error" aria-live="assertive">
        <h1>{t("publicProfile.openErrorTitle")}</h1>
        <p>{t("publicProfile.loadError")}</p>
        <div className="profile-error-actions">
          <button type="button" onClick={reset}>
            {t("publicProfile.retry")}
          </button>
          <Link href="/feed">{t("publicProfile.backToFeed")}</Link>
        </div>
      </section>

      <style jsx>{`
        .public-profile-page {
          min-height: 100vh;
          padding: 1.25rem 1rem 6rem;
          background: var(--bg, #0f0821);
          color: var(--text, #fff);
        }

        .profile-state {
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          text-align: center;
          color: var(--text-muted, #a39ec0);
        }

        .profile-state--error h1 {
          margin: 0;
          color: var(--text, #fff);
          font-size: 1.4rem;
        }

        .profile-error-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.75rem;
        }

        .profile-error-actions button,
        .profile-error-actions a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 1rem;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          color: #fff;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }
      `}</style>
    </main>
  );
}
