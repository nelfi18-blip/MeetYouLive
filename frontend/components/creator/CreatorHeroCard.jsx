"use client";

import Image from "next/image";
import Link from "next/link";
import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import StatusBadge from "@/components/creator/StatusBadge";
import {
  ActivityIcon,
  ArrowRightIcon,
  CoinIcon,
  VideoIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

function LiveDot() {
  return (
    <span className="live-dot" aria-label="En vivo ahora">
      <span className="live-pulse" />
      En vivo
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
          font-size: 0.65rem;
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
  earningsHighlight,
  availableForPayout,
  activeLive,
  cta,
}) {
  const initial = displayName?.[0]?.toUpperCase() || "C";

  return (
    <FuturisticCard className="creator-hero" accent="pink" hover={false}>
      <PremiumSectionHeader
        eyebrow="Panel de creador"
        title={statusCopy.title}
        subtitle={statusCopy.subtitle}
        action={
          cta ? (
            <Link href={cta.href} className="btn btn-primary btn-sm hero-cta-btn">
              {cta.icon === "live" ? <VideoIcon size={14} /> : <ArrowRightIcon size={14} />}
              {cta.label}
            </Link>
          ) : null
        }
      />

      <div className="hero-body">
        <div className="hero-user">
          <div className="avatar-wrap">
            {avatar ? (
              <Image
                src={avatar}
                alt={displayName || "Creador"}
                width={46}
                height={46}
                className="avatar-img"
                unoptimized
              />
            ) : (
              <div className="avatar-placeholder">{initial}</div>
            )}
          </div>
          <div>
            <p className="name">{displayName}</p>
            <div className="badges">
              <StatusBadge status={status} />
              {activeLive ? <LiveDot /> : null}
              {creatorLevel?.current?.label ? (
                <span className="level-badge">Nivel · {creatorLevel.current.label}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="hero-earnings">
          <span className="earnings-label">Ganancias acumuladas</span>
          <strong className="earnings-value">
            <CoinIcon size={16} /> {earningsHighlight}
            <span className="earnings-unit">monedas</span>
          </strong>
          {availableForPayout !== null && availableForPayout !== undefined ? (
            <div className="payout-row">
              <WalletIcon size={12} />
              <span>
                Disponible para retiro:{" "}
                <strong className="payout-amount">
                  {Number(availableForPayout).toLocaleString("es-ES")}
                </strong>{" "}
                monedas
              </span>
            </div>
          ) : null}
          {creatorLevel?.current?.label ? (
            <span className="level-line">
              <ActivityIcon size={14} /> Nivel actual: {creatorLevel.current.label}
            </span>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .creator-hero {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .hero-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .hero-body {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.8rem;
        }
        .hero-user {
          display: flex;
          align-items: center;
          gap: 0.7rem;
        }
        .avatar-wrap {
          width: 2.9rem;
          height: 2.9rem;
          border-radius: 14px;
          border: 1px solid rgba(224, 64, 251, 0.4);
          overflow: hidden;
          flex-shrink: 0;
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
          font-size: 1.05rem;
        }
        .name {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
          color: #fff;
        }
        .badges {
          margin-top: 0.38rem;
          display: flex;
          align-items: center;
          gap: 0.34rem;
          flex-wrap: wrap;
        }
        .level-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.65rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(34, 211, 238, 0.4);
          background: rgba(34, 211, 238, 0.12);
          color: #a5f3fc;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .hero-earnings {
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(255, 255, 255, 0.03);
          padding: 0.7rem 0.8rem;
          display: flex;
          flex-direction: column;
          gap: 0.32rem;
        }
        .earnings-label {
          color: var(--text-muted);
          font-size: 0.73rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .earnings-value {
          color: #fff;
          font-size: 1.25rem;
          letter-spacing: -0.02em;
          display: inline-flex;
          align-items: baseline;
          gap: 0.35rem;
        }
        .earnings-unit {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .payout-row {
          display: inline-flex;
          align-items: center;
          gap: 0.28rem;
          color: #86efac;
          font-size: 0.76rem;
        }
        .payout-amount {
          font-weight: 800;
        }
        .level-line {
          color: #a5f3fc;
          font-size: 0.76rem;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
        }
        @media (min-width: 820px) {
          .hero-body {
            grid-template-columns: 1.2fr 1fr;
            align-items: center;
          }
        }
      `}</style>
    </FuturisticCard>
  );
}
