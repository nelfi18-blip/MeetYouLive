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
  helper,
}) {
  const iconStyle = ACCENT_ICON_STYLES[accent] || ACCENT_ICON_STYLES.purple;

  return (
    <FuturisticCard className="earnings-stat-card" accent={accent}>
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <strong className="stat-value">
        {value}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </strong>
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
          border: 1px solid ${iconStyle.border};
          background: ${iconStyle.bg};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: ${iconStyle.color};
          flex-shrink: 0;
        }
        .stat-label {
          line-height: 1.35;
        }
        .stat-value {
          font-size: clamp(1.24rem, 2.8vw, 1.68rem);
          letter-spacing: -0.03em;
          color: #fff;
          display: inline-flex;
          align-items: baseline;
          gap: 0.3rem;
        }
        .stat-unit {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.04em;
          text-transform: uppercase;
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
