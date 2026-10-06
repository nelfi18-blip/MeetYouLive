"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";

const ACCENT_ICON_STYLES = {
  purple: { border: "rgba(196,181,253,0.35)", bg: "rgba(196,181,253,0.1)", color: "#ddd6fe" },
  cyan:   { border: "rgba(34,211,238,0.35)",  bg: "rgba(34,211,238,0.1)",  color: "#a5f3fc" },
  pink:   { border: "rgba(244,114,182,0.38)", bg: "rgba(244,114,182,0.12)", color: "#fbcfe8" },
  orange: { border: "rgba(251,146,60,0.38)",  bg: "rgba(251,146,60,0.12)", color: "#fed7aa" },
  green:  { border: "rgba(52,211,153,0.38)",  bg: "rgba(52,211,153,0.12)", color: "#86efac" },
};

export default function EarningsStatCard({
  label,
  value,
  unit,
  icon,
  accent = "purple",
}) {
  const iconStyle = ACCENT_ICON_STYLES[accent] || ACCENT_ICON_STYLES.purple;

  return (
    <FuturisticCard className="earnings-stat-card" accent={accent}>
      <span className="stat-icon">{icon}</span>
      <div className="stat-copy">
        <strong className="stat-value">
          {value}
          {unit ? <span className="stat-unit">{unit}</span> : null}
        </strong>
        <span className="stat-label">{label}</span>
      </div>

      <style jsx>{`
        .earnings-stat-card {
          padding: 0.6rem 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .stat-icon {
          width: 1.9rem;
          height: 1.9rem;
          border-radius: 10px;
          border: 1px solid ${iconStyle.border};
          background: ${iconStyle.bg};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: ${iconStyle.color};
          flex-shrink: 0;
        }
        .stat-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.08rem;
        }
        .stat-value {
          font-size: 1rem;
          letter-spacing: -0.02em;
          color: #fff;
          display: inline-flex;
          align-items: baseline;
          gap: 0.22rem;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .stat-unit {
          font-size: 0.6rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .stat-label {
          font-size: 0.66rem;
          font-weight: 700;
          color: var(--text-muted);
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </FuturisticCard>
  );
}
