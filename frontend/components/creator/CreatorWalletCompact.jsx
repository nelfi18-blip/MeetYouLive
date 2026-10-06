"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { CheckCircleIcon } from "@/components/ui/MonetizationIcons";

/**
 * Compact wallet module. The main balance already lives in the Hero, so
 * this surface only shows complementary, non-duplicated information:
 * withdrawal status and a link to the history.
 */
export default function CreatorWalletCompact({ hasPendingPayout }) {
  const { t } = useLanguage();

  return (
    <FuturisticCard className="wallet-compact" accent="green" hover={false}>
      <div className="wallet-row">
        <span className="wallet-icon"><CheckCircleIcon size={14} /></span>
        <div className="wallet-copy">
          <span className="wallet-label">{t("creatorPage.withdrawalsTitle")}</span>
          <strong className={hasPendingPayout ? "wallet-pending" : "wallet-available"}>
            {hasPendingPayout ? t("creatorPage.payoutStatusPending") : t("creatorPage.payoutStatusAvailable")}
          </strong>
        </div>
        <a href="#gifts" className="wallet-link">{t("creatorPage.viewHistory")}</a>
      </div>

      <style jsx>{`
        .wallet-compact {
          padding: 0.65rem 0.8rem;
        }
        .wallet-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .wallet-icon {
          width: 1.7rem;
          height: 1.7rem;
          border-radius: 9px;
          border: 1px solid rgba(52, 211, 153, 0.34);
          background: rgba(52, 211, 153, 0.12);
          color: #86efac;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .wallet-copy {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .wallet-label {
          font-size: 0.62rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .wallet-copy strong {
          font-size: 0.8rem;
          font-weight: 800;
        }
        .wallet-available { color: #86efac; }
        .wallet-pending { color: #c4b5fd; }
        .wallet-link {
          flex-shrink: 0;
          color: #67e8f9;
          font-size: 0.7rem;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }
        .wallet-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </FuturisticCard>
  );
}
