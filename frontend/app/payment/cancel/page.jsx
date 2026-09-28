"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function PaymentCancelPage() {
  const { t } = useLanguage();
  return (
    <div className="status-page">
      <div className="status-icon">❌</div>
      <h1>{t("payment.cancelTitle")}</h1>
      <p>{t("payment.cancelMessage")}</p>
      <div className="status-actions">
        <Link href="/coins" className="btn btn-primary btn-lg">
          🔄 {t("payment.tryAgain")}
        </Link>
        <Link href="/feed" className="btn btn-secondary btn-lg">
          🏠 {t("payment.goToFeed")}
        </Link>
      </div>

      <style jsx>{`
        .status-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
          gap: 1rem;
          padding: 2rem;
        }

        .status-icon {
          font-size: 5rem;
          line-height: 1;
          margin-bottom: 0.5rem;
        }

        h1 {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
        }

        p {
          color: var(--text-muted);
          font-size: 1rem;
          max-width: 380px;
        }

        .status-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 0.5rem;
        }
      `}</style>
    </div>
  );
}
