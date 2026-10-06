"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowRightIcon, CoinIcon } from "@/components/ui/MonetizationIcons";

export default function BalanceCard({
  availableForPayout,
  onRequestPayout,
  payoutDisabled,
  note,
}) {
  const { t } = useLanguage();

  return (
    <FuturisticCard className="balance-card" accent="green" hover={false}>
      <div className="balance-top">
        <span className="balance-icon"><CoinIcon size={16} /></span>
        <span className="balance-title">{t("creatorPage.availableBalance")}</span>
      </div>
      <div className="balance-main">
        <div className="balance-amount">
          <strong>{Number(availableForPayout || 0).toLocaleString(t("common.locale"))}</strong>
          <span className="balance-unit">{t("common.coins")}</span>
        </div>
        <button
          type="button"
          className="balance-cta"
          onClick={onRequestPayout}
          disabled={payoutDisabled}
        >
          {t("creatorPage.withdraw")}
          <ArrowRightIcon size={13} />
        </button>
      </div>
      {note ? <p className="balance-note">{note}</p> : <p className="balance-note">{t("creatorPage.readyForPayout")}</p>}

      <style jsx>{`
        .balance-card {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .balance-top {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 700;
        }
        .balance-icon {
          width: 1.7rem;
          height: 1.7rem;
          border-radius: 10px;
          border: 1px solid rgba(52, 211, 153, 0.38);
          background: rgba(52, 211, 153, 0.12);
          color: #86efac;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .balance-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.7rem;
          flex-wrap: wrap;
        }
        .balance-amount {
          display: inline-flex;
          align-items: baseline;
          gap: 0.4rem;
        }
        .balance-amount strong {
          font-size: 2.1rem;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .balance-unit {
          font-size: 0.78rem;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .balance-cta {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(224, 64, 251, 0.5);
          background: linear-gradient(90deg, #e040fb, #a855f7);
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
          padding: 0.55rem 1.1rem;
          cursor: pointer;
        }
        .balance-cta:hover:not(:disabled) {
          filter: brightness(1.08);
        }
        .balance-cta:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .balance-note {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.78rem;
        }
      `}</style>
    </FuturisticCard>
  );
}
