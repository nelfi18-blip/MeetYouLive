"use client";

import Image from "next/image";
import Link from "next/link";
import FuturisticCard from "@/components/ui/FuturisticCard";
import StatusBadge from "@/components/creator/StatusBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ActivityIcon,
  ArrowRightIcon,
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

export default function CreatorHeroCard({
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

  return (
    <FuturisticCard className="creator-hero" accent="pink" hover={false}>
      <div className="hero-glow" aria-hidden="true" />

      <div className="hero-identity">
        <div className="avatar-ring-wrap">
          {activeLive ? <span className="avatar-live-ring" aria-hidden="true" /> : null}
          <div className="avatar-wrap">
            {avatar ? (
              <Image
                src={avatar}
                alt={displayName || t("creatorHeroCard.creatorAlt")}
                width={44}
                height={44}
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
            {creatorLevel?.current?.label ? <span className="crown" aria-hidden="true">👑</span> : null}
          </p>
          <div className="badges">
            <StatusBadge status={status} />
            {creatorLevel?.current?.label ? (
              <span className="level-chip">{creatorLevel.current.label}</span>
            ) : null}
            {activeLive ? <LiveDot /> : null}
          </div>
        </div>
      </div>

      <p className="tagline">{statusCopy.subtitle}</p>

      <div className="hero-actions">
        {cta ? (
          <Link href={cta.href} className="btn btn-primary btn-sm hero-cta-btn">
            {cta.icon === "live" ? <VideoIcon size={14} /> : <ArrowRightIcon size={14} />}
            {cta.label}
          </Link>
        ) : null}
        {secondaryCta ? (
          <Link href={secondaryCta.href} className="btn btn-secondary btn-sm hero-cta-btn">
            <ActivityIcon size={14} />
            {secondaryCta.label}
          </Link>
        ) : null}
      </div>

      {availableForPayout !== null && availableForPayout !== undefined ? (
        <div className="hero-balance">
          <div className="hero-balance-copy">
            <span className="hero-balance-icon"><WalletIcon size={15} /></span>
            <div>
              <span className="hero-balance-label">{t("creatorPage.availableBalance")}</span>
              <strong className="hero-balance-value">
                {Number(availableForPayout).toLocaleString(t("common.locale"))}
                <span className="hero-balance-unit">{t("common.coins")}</span>
              </strong>
            </div>
          </div>
          {onRequestPayout ? (
            <button
              type="button"
              className="hero-balance-cta"
              onClick={onRequestPayout}
              disabled={payoutDisabled}
            >
              {t("creatorPage.withdraw")}
              <ArrowRightIcon size={12} />
            </button>
          ) : null}
        </div>
      ) : null}
      {payoutNote ? <p className="hero-balance-note">{payoutNote}</p> : null}

      <style jsx>{`
        .creator-hero {
          padding: 0.95rem 1rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          isolation: isolate;
        }
        .hero-glow {
          position: absolute;
          inset: -40% -10% auto -10%;
          height: 160%;
          background: radial-gradient(60% 60% at 20% 10%, rgba(168, 85, 247, 0.28), transparent 70%),
            radial-gradient(50% 50% at 90% 0%, rgba(34, 211, 238, 0.18), transparent 70%);
          pointer-events: none;
          z-index: -1;
        }
        .hero-identity {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }
        .avatar-ring-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .avatar-wrap {
          width: 2.75rem;
          height: 2.75rem;
          border-radius: 14px;
          border: 1px solid rgba(224, 64, 251, 0.4);
          overflow: hidden;
        }
        .avatar-live-ring {
          position: absolute;
          inset: -3px;
          border-radius: 16px;
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
          font-size: 1rem;
        }
        .identity-copy {
          min-width: 0;
          flex: 1;
        }
        .greeting {
          margin: 0;
          font-size: 1.02rem;
          font-weight: 800;
          color: #fff;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          line-height: 1.25;
        }
        .crown {
          font-size: 0.92rem;
          line-height: 1;
        }
        .badges {
          margin-top: 0.3rem;
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
        .hero-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .hero-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .hero-balance {
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(255, 255, 255, 0.04);
          padding: 0.6rem 0.7rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
        }
        .hero-balance-copy {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
        }
        .hero-balance-icon {
          width: 1.9rem;
          height: 1.9rem;
          border-radius: 10px;
          border: 1px solid rgba(52, 211, 153, 0.38);
          background: rgba(52, 211, 153, 0.12);
          color: #86efac;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .hero-balance-label {
          display: block;
          color: var(--text-muted);
          font-size: 0.66rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .hero-balance-value {
          display: flex;
          align-items: baseline;
          gap: 0.3rem;
          color: #fff;
          font-size: 1.22rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.3;
        }
        .hero-balance-unit {
          font-size: 0.64rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .hero-balance-cta {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(224, 64, 251, 0.5);
          background: linear-gradient(90deg, #e040fb, #a855f7);
          color: #fff;
          font-size: 0.74rem;
          font-weight: 800;
          padding: 0.45rem 0.85rem;
          cursor: pointer;
        }
        .hero-balance-cta:hover:not(:disabled) {
          filter: brightness(1.08);
        }
        .hero-balance-cta:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .hero-balance-note {
          margin: -0.15rem 0 0;
          color: var(--text-muted);
          font-size: 0.72rem;
          line-height: 1.4;
        }
      `}</style>
    </FuturisticCard>
  );
}
