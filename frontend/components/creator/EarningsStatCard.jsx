"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";

export default function EarningsStatCard({
  label,
  value,
  icon,
  accent = "purple",
  helper,
}) {
  return (
    <FuturisticCard className="earnings-stat-card" accent={accent}>
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      {helper ? <p className="stat-helper">{helper}</p> : null}

      <style jsx>{`
        .earnings-stat-card {
          padding: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          min-height: 128px;
        }
        .stat-top {
          display: inline-flex;
          align-items: center;
          gap: 0.42rem;
          color: var(--text-muted);
          font-size: 0.77rem;
          font-weight: 700;
        }
        .stat-icon {
          width: 1.65rem;
          height: 1.65rem;
          border-radius: 10px;
          border: 1px solid rgba(196, 181, 253, 0.35);
          background: rgba(196, 181, 253, 0.1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ddd6fe;
          flex-shrink: 0;
        }
        .stat-label {
          line-height: 1.35;
        }
        .stat-value {
          font-size: clamp(1.24rem, 2.8vw, 1.68rem);
          letter-spacing: -0.03em;
          color: #fff;
        }
        .stat-helper {
          margin: 0;
          font-size: 0.74rem;
          color: var(--text-muted);
          line-height: 1.45;
        }
      `}</style>
    </FuturisticCard>
  );
}
