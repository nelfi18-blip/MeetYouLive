"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CoinIcon,
  GiftIcon,
  HistoryIcon,
  SparkIcon,
  VideoIcon,
} from "@/components/ui/MonetizationIcons";

function Tile({ href, label, icon, muted = false }) {
  return (
    <Link href={href} className={`qa-tile${muted ? " qa-muted" : ""}`}>
      <span className="qa-icon">{icon}</span>
      <span className="qa-label">{label}</span>
      <span className="qa-arrow"><ArrowRightIcon size={12} /></span>
      <style jsx>{`
        .qa-tile {
          border-radius: 12px;
          border: 1px solid rgba(224, 64, 251, 0.3);
          background: rgba(224, 64, 251, 0.12);
          color: #f5d0fe;
          text-decoration: none;
          padding: 0.72rem;
          display: flex;
          align-items: center;
          gap: 0.42rem;
          transition: border-color var(--transition), background var(--transition), transform var(--transition);
        }
        .qa-tile:hover {
          border-color: rgba(224, 64, 251, 0.52);
          background: rgba(224, 64, 251, 0.18);
          transform: translateY(-1px);
        }
        .qa-muted {
          border-color: rgba(148, 163, 184, 0.3);
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
        }
        .qa-icon {
          width: 1.55rem;
          height: 1.55rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .qa-label {
          font-size: 0.79rem;
          font-weight: 700;
          flex: 1;
        }
        .qa-arrow {
          color: inherit;
          opacity: 0.86;
          display: inline-flex;
          align-items: center;
        }
      `}</style>
    </Link>
  );
}

export default function CreatorQuickActions({
  canMonetize,
  profileHref,
  onRequestPayout,
  payoutDisabled,
}) {
  return (
    <div className="qa-grid">
      {canMonetize ? (
        <>
          <Tile href="/live/start" label="Ir en vivo" icon={<VideoIcon size={14} />} />
          <Tile href="#monetization-history" label="Ver historial" icon={<HistoryIcon size={14} />} />
          <button
            type="button"
            className="qa-btn"
            onClick={onRequestPayout}
            disabled={payoutDisabled}
          >
            <span className="qa-btn-icon"><CoinIcon size={14} /></span>
            <span>Solicitar retiro</span>
            <span className="qa-btn-right"><ArrowRightIcon size={12} /></span>
          </button>
        </>
      ) : null}

      <Tile href="/profile" label="Editar perfil de creador" icon={<SparkIcon size={14} />} muted={!canMonetize} />
      <Tile href={profileHref} label="Compartir perfil" icon={<ArrowRightIcon size={14} />} muted={!canMonetize} />
      <Tile href="/gifts" label="Ver regalos" icon={<GiftIcon size={14} />} muted={!canMonetize} />

      <style jsx>{`
        .qa-grid {
          display: grid;
          grid-template-columns: repeat(1, minmax(0, 1fr));
          gap: 0.55rem;
        }
        .qa-btn {
          border-radius: 12px;
          border: 1px solid rgba(52, 211, 153, 0.38);
          background: rgba(52, 211, 153, 0.14);
          color: #86efac;
          font-size: 0.79rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 0.42rem;
          padding: 0.72rem;
          cursor: pointer;
          text-align: left;
        }
        .qa-btn:hover:not(:disabled) {
          border-color: rgba(52, 211, 153, 0.58);
          background: rgba(52, 211, 153, 0.2);
          transform: translateY(-1px);
        }
        .qa-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .qa-btn-icon,
        .qa-btn-right {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .qa-btn-right {
          margin-left: auto;
        }
        @media (min-width: 860px) {
          .qa-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
