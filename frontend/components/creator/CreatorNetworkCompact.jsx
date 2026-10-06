"use client";

import Link from "next/link";
import FuturisticCard from "@/components/ui/FuturisticCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { ActivityIcon, ClockIcon, CoinIcon, UsersIcon } from "@/components/ui/MonetizationIcons";

/**
 * Compact network/agency widget. When the network has no real activity yet
 * it collapses to "icon + title + summary + CTA" instead of a 2x2 grid of
 * zeros. When there is real data, it shows compact inline stats.
 */
export default function CreatorNetworkCompact({ agencyData, agencyCopied, agencyCopyError, onCopyLink }) {
  const { t } = useLanguage();

  if (!agencyData) return null;

  const subCreatorsCount = agencyData.agencyProfile?.subCreatorsCount || 0;
  const agencyEarningsCoins = agencyData.agencyEarningsCoins || 0;
  const totalAgencyGeneratedCoins = agencyData.totalAgencyGeneratedCoins || 0;
  const pendingCount = agencyData.counts?.pending || 0;
  const hasActivity = subCreatorsCount > 0 || agencyEarningsCoins > 0 || totalAgencyGeneratedCoins > 0 || pendingCount > 0;
  const agencyCode = agencyData.agencyProfile?.agencyCode;

  return (
    <FuturisticCard className="network-card" accent="cyan" hover={false}>
      <div className="network-head">
        <span className="network-icon"><UsersIcon size={15} /></span>
        <div className="network-copy">
          <span className="network-title">{t("creatorPage.agencyTitle")}</span>
          <span className="network-summary">
            {hasActivity
              ? t("creatorPage.networkMembersCount").replace("{count}", subCreatorsCount)
              : t("creatorPage.inviteAgencyTitle")}
          </span>
        </div>
        <Link href="/agency" className="network-cta">{t("creatorPage.viewFullPanel")}</Link>
      </div>

      {hasActivity ? (
        <div className="network-stats">
          <div className="network-stat">
            <span className="stat-icon"><UsersIcon size={12} /></span>
            <strong>{subCreatorsCount}</strong>
          </div>
          <div className="network-stat">
            <span className="stat-icon"><CoinIcon size={12} /></span>
            <strong className="green">{agencyEarningsCoins}</strong>
          </div>
          <div className="network-stat">
            <span className="stat-icon"><ActivityIcon size={12} /></span>
            <strong className="purple">{totalAgencyGeneratedCoins}</strong>
          </div>
          <div className="network-stat">
            <span className="stat-icon"><ClockIcon size={12} /></span>
            <strong>{pendingCount}</strong>
          </div>
        </div>
      ) : null}

      {agencyCode ? (
        <div className="invite-row">
          <div className="invite-url">
            {typeof window !== "undefined"
              ? `${window.location.origin}/register?creatorInvite=${agencyCode}`
              : `/register?creatorInvite=${agencyCode}`}
          </div>
          <button
            className={`copy-btn${agencyCopied ? " copied" : agencyCopyError ? " error" : ""}`}
            onClick={onCopyLink}
          >
            {agencyCopied
              ? t("creatorPage.copied")
              : agencyCopyError
                ? t("creatorPage.copyError")
                : t("creatorPage.copyLink")}
          </button>
          <Link href="/agency" className="manage-btn">
            {t("creatorPage.manageNetwork")}
          </Link>
        </div>
      ) : (
        <Link href="/agency" className="activate-btn">
          {t("creatorPage.activateAgency")}
        </Link>
      )}

      <style jsx>{`
        .network-card {
          padding: 0.8rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .network-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .network-icon {
          width: 1.9rem;
          height: 1.9rem;
          border-radius: 10px;
          border: 1px solid rgba(34, 211, 238, 0.35);
          background: rgba(34, 211, 238, 0.12);
          color: #a5f3fc;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .network-copy {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
        }
        .network-title {
          color: #fff;
          font-size: 0.92rem;
          font-weight: 800;
          line-height: 1.25;
        }
        .network-summary {
          color: var(--text-muted);
          font-size: 0.68rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .network-cta {
          flex-shrink: 0;
          max-width: 40%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #67e8f9;
          font-size: 0.66rem;
          font-weight: 700;
          text-decoration: none;
        }
        .network-cta:hover {
          text-decoration: underline;
        }
        .network-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.35rem;
        }
        .network-stat {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 9px;
          padding: 0.3rem 0.2rem;
        }
        .stat-icon {
          color: #c4b5fd;
          display: inline-flex;
        }
        .network-stat strong {
          font-size: 0.74rem;
          font-weight: 800;
          color: #e2e8f0;
        }
        .green { color: #34d399; }
        .purple { color: #a78bfa; }
        .invite-row {
          display: flex;
          gap: 0.4rem;
          align-items: center;
          flex-wrap: wrap;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 0.45rem 0.6rem;
        }
        .invite-url {
          flex: 1 1 100px;
          min-width: 0;
          font-size: 0.66rem;
          color: #818cf8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .copy-btn {
          flex: 0 0 auto;
          background: rgba(139,92,246,0.18);
          border: 1px solid rgba(139,92,246,0.4);
          color: #c4b5fd;
          border-radius: 8px;
          padding: 0.28rem 0.55rem;
          font-size: 0.66rem;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
          transition: background 0.15s;
        }
        .copy-btn.copied {
          background: rgba(52,211,153,0.18);
          border-color: rgba(52,211,153,0.4);
          color: #6ee7b7;
        }
        .copy-btn.error {
          background: rgba(239,68,68,0.12);
          border-color: rgba(239,68,68,0.3);
          color: #fca5a5;
        }
        .copy-btn:hover { background: rgba(139,92,246,0.28); }
        .manage-btn {
          flex: 0 0 auto;
          background: rgba(34,211,238,0.12);
          border: 1px solid rgba(34,211,238,0.3);
          color: #67e8f9;
          border-radius: 8px;
          padding: 0.28rem 0.55rem;
          font-size: 0.66rem;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }
        .manage-btn:hover { background: rgba(34,211,238,0.2); }
        .activate-btn {
          align-self: flex-start;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(34, 211, 238, 0.4);
          background: rgba(34, 211, 238, 0.12);
          color: #67e8f9;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.4rem 0.75rem;
          text-decoration: none;
        }
        .activate-btn:hover {
          background: rgba(34, 211, 238, 0.2);
        }
        @media (max-width: 380px) {
          .network-head {
            flex-wrap: wrap;
          }
          .network-cta {
            max-width: 100%;
            flex-basis: 100%;
            text-align: left;
          }
        }
      `}</style>
    </FuturisticCard>
  );
}
