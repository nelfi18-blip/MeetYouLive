"use client";

import Image from "next/image";
import Link from "next/link";
import StatusBadge from "@/components/creator/StatusBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ArrowRightIcon,
  TrendUpIcon,
  VideoIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

function LiveDot() {
  const { t } = useLanguage();
  return (
    <span className="live-dot" aria-label={t("creatorHeroCard.liveNowAria")}>
      <span className="live-pulse" />
      {t("creatorHeroCard.live")}
      <style jsx>{`
        .live-dot {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.2rem 0.55rem 0.2rem 0.4rem;
          border-radius: var(--radius-pill);
          background: linear-gradient(90deg, rgba(224,64,251,0.22), rgba(244,114,182,0.18));
          border: 1px solid rgba(224,64,251,0.5);
          color: #f5d0fe;
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .live-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #e040fb;
          box-shadow: 0 0 6px #e040fb;
          animation: pulse-live 1.4s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes pulse-live {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
    </span>
  );
}

/**
 * Compact ring that summarizes creator level progress. It intentionally does
 * NOT duplicate the detailed weekly/activity breakdown - that lives in the
 * "Tu dia / Tu progreso" composition further down the page.
 */
function ProgressRing({ percent, label }) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const circumference = 2 * Math.PI * 15.5;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="ring-wrap" role="img" aria-label={label}>
      <svg width="40" height="40" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" className="ring-track" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          className="ring-fill"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="ring-value">{clamped}%</span>
      <style jsx>{`
        .ring-wrap {
          position: relative;
          width: 40px;
          height: 40px;
          flex-shrink: 0;
        }
        svg {
          transform: rotate(-90deg);
        }
        .ring-track {
          fill: none;
          stroke: rgba(139, 92, 246, 0.18);
          stroke-width: 3;
        }
        .ring-fill {
          fill: none;
          stroke: #a855f7;
          stroke-width: 3;
          stroke-linecap: round;
          transition: stroke-dashoffset var(--transition-slow);
        }
        .ring-value {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.56rem;
          font-weight: 800;
          color: #e9d5ff;
        }
      `}</style>
    </div>
  );
}

export default function CreatorCommandCenter({
  displayName,
  avatar,
  status,
  statusCopy,
  creatorLevel,
  availableForPayout,
  activeLive,
  cta,
  secondaryCta,
  onRequestPayout,
  payoutDisabled,
  payoutNote,
}) {
  const initial = displayName?.[0]?.toUpperCase() || "C";
  const { t } = useLanguage();
  const hasLevelData = Boolean(creatorLevel?.current?.label);
  const progressPercent = Math.max(0, Math.min(100, Number(creatorLevel?.progressPercent || 0)));

  return (
    <div className="command-center">
      <div className="command-layer command-layer-a" aria-hidden="true" />
      <div className="command-layer command-layer-b" aria-hidden="true" />

      <div className="command-top">
        <div className="identity">
          <div className="avatar-ring-wrap">
            {activeLive ? <span className="avatar-live-ring" aria-hidden="true" /> : null}
            <div className="avatar-wrap">
              {avatar ? (
                <Image
                  src={avatar}
                  alt={displayName || t("creatorHeroCard.creatorAlt")}
                  width={46}
                  height={46}
                  className="avatar-img"
                  unoptimized
                />
              ) : (
                <div className="avatar-placeholder">{initial}</div>
              )}
            </div>
          </div>

          <div className="identity-copy">
            <p className="greeting">
              {t("creatorHeroCard.greeting").replace("{name}", displayName)}
            </p>
            <div className="badges">
              <StatusBadge status={status} />
              {hasLevelData ? <span className="level-chip">{creatorLevel.current.label}</span> : null}
              {activeLive ? <LiveDot /> : null}
            </div>
          </div>

          {hasLevelData ? (
            <ProgressRing
              percent={progressPercent}
              label={t("creatorProgress.currentLevel").replace("{label}", creatorLevel.current.label)}
            />
          ) : null}
        </div>

        <p className="tagline">{statusCopy.subtitle}</p>
      </div>

      <div className="command-stage">
        {cta ? (
          <Link href={cta.href} className="live-cta">
            <span className="live-cta-icon">
              {cta.icon === "live" ? <VideoIcon size={18} /> : <ArrowRightIcon size={18} />}
            </span>
            <span className="live-cta-label">{cta.label}</span>
          </Link>
        ) : null}

        <div className="command-side">
          {availableForPayout !== null && availableForPayout !== undefined ? (
            <div className="balance-chip">
              <span className="balance-chip-icon"><WalletIcon size={14} /></span>
              <div className="balance-chip-copy">
                <span className="balance-chip-label">{t("creatorPage.availableBalance")}</span>
                <strong className="balance-chip-value">
                  {Number(availableForPayout).toLocaleString(t("common.locale"))}
                  <span className="balance-chip-unit">{t("common.coins")}</span>
                </strong>
              </div>
              {onRequestPayout ? (
                <button
                  type="button"
                  className="balance-chip-cta"
                  onClick={onRequestPayout}
                  disabled={payoutDisabled}
                >
                  {t("creatorPage.withdraw")}
                </button>
              ) : null}
            </div>
          ) : null}

          {secondaryCta ? (
            <Link href={secondaryCta.href} className="analytics-link">
              <TrendUpIcon size={13} />
              {secondaryCta.label}
            </Link>
          ) : null}
        </div>
      </div>

      {payoutNote ? <p className="payout-note">{payoutNote}</p> : null}

      <style jsx>{`
        .command-center {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          border-radius: 26px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(165deg, rgba(24, 10, 48, 0.94) 0%, rgba(8, 5, 20, 0.97) 60%, rgba(10, 16, 32, 0.96) 100%);
          padding: 1.1rem 1.1rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          box-shadow: var(--shadow), 0 0 0 1px rgba(255, 255, 255, 0.03);
        }
        .command-layer {
          position: absolute;
          pointer-events: none;
          z-index: -1;
        }
        .command-layer-a {
          inset: -55% -20% auto -30%;
          height: 150%;
          background: radial-gradient(55% 55% at 15% 10%, rgba(168, 85, 247, 0.38), transparent 70%),
            radial-gradient(45% 45% at 95% 0%, rgba(34, 211, 238, 0.22), transparent 70%);
          filter: blur(2px);
        }
        .command-layer-b {
          inset: auto -30% -60% -10%;
          height: 120%;
          background: radial-gradient(50% 50% at 30% 100%, rgba(244, 114, 182, 0.2), transparent 70%);
        }
        .command-top {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .identity {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }
        .avatar-ring-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .avatar-wrap {
          width: 2.85rem;
          height: 2.85rem;
          border-radius: 15px;
          border: 1px solid rgba(224, 64, 251, 0.4);
          overflow: hidden;
        }
        .avatar-live-ring {
          position: absolute;
          inset: -3px;
          border-radius: 17px;
          border: 2px solid #e040fb;
          box-shadow: 0 0 10px rgba(224, 64, 251, 0.6);
          pointer-events: none;
        }
        :global(.avatar-img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .avatar-placeholder {
          width: 100%;
          height: 100%;
          background: rgba(224, 64, 251, 0.15);
          color: #f5d0fe;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.02rem;
        }
        .identity-copy {
          min-width: 0;
          flex: 1;
        }
        .greeting {
          margin: 0;
          font-size: 1.04rem;
          font-weight: 800;
          color: #fff;
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .badges {
          margin-top: 0.32rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          flex-wrap: wrap;
        }
        .level-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-pill);
          background: rgba(250, 204, 21, 0.12);
          border: 1px solid rgba(250, 204, 21, 0.35);
          color: #facc15;
          font-size: 0.64rem;
          font-weight: 800;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .tagline {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.78rem;
          line-height: 1.45;
        }
        .command-stage {
          display: flex;
          align-items: stretch;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .live-cta {
          flex: 1 1 140px;
          min-width: 140px;
          position: relative;
          overflow: hidden;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border-radius: 18px;
          border: 1px solid rgba(224, 64, 251, 0.55);
          background: linear-gradient(120deg, #e040fb 0%, #a855f7 55%, #22d3ee 120%);
          color: #fff;
          font-size: 0.92rem;
          font-weight: 800;
          letter-spacing: -0.01em;
          text-decoration: none;
          padding: 0.85rem 1rem;
          box-shadow: 0 10px 28px -10px rgba(224, 64, 251, 0.65);
          transition: transform var(--transition), box-shadow var(--transition);
        }
        .live-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 34px -8px rgba(224, 64, 251, 0.75);
        }
        .live-cta-icon {
          display: inline-flex;
        }
        .command-side {
          flex: 1 1 180px;
          min-width: 180px;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .balance-chip {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(255, 255, 255, 0.045);
          padding: 0.55rem 0.65rem;
        }
        .balance-chip-icon {
          width: 1.8rem;
          height: 1.8rem;
          border-radius: 10px;
          border: 1px solid rgba(52, 211, 153, 0.38);
          background: rgba(52, 211, 153, 0.12);
          color: #86efac;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .balance-chip-copy {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .balance-chip-label {
          font-size: 0.6rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .balance-chip-value {
          display: flex;
          align-items: baseline;
          gap: 0.25rem;
          color: #fff;
          font-size: 1.02rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .balance-chip-unit {
          font-size: 0.58rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .balance-chip-cta {
          flex-shrink: 0;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          color: #e2e8f0;
          font-size: 0.68rem;
          font-weight: 800;
          padding: 0.55rem 0.75rem;
          min-height: 2.5rem;
          cursor: pointer;
        }
        .balance-chip-cta:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
        }
        .balance-chip-cta:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .analytics-link {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 0.32rem;
          color: #67e8f9;
          font-size: 0.7rem;
          font-weight: 700;
          text-decoration: none;
        }
        .analytics-link:hover {
          text-decoration: underline;
        }
        .payout-note {
          margin: -0.2rem 0 0;
          color: var(--text-muted);
          font-size: 0.72rem;
          line-height: 1.4;
        }
        @media (max-width: 420px) {
          .live-cta {
            flex-basis: 100%;
          }
          .command-side {
            flex-basis: 100%;
          }
        }
      `}</style>
    </div>
  );
}
