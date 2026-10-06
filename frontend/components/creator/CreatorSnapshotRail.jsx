"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Single visual surface for "today" metrics. Unlike the previous iteration,
 * this renders ONE card containing a compact internal rail instead of four
 * independent FuturisticCards.
 */
export default function CreatorSnapshotRail({ items = [], title, subtitle }) {
  const { t } = useLanguage();

  return (
    <FuturisticCard className="snapshot-card" accent="purple" hover={false}>
      <div className="snapshot-head">
        <span className="snapshot-title">{title || t("creatorPage.todaySummaryTitle")}</span>
        {subtitle ? <span className="snapshot-subtitle">{subtitle}</span> : null}
      </div>

      <div className="snapshot-rail">
        {items.map((item, index) => (
          <div key={item.key} className={`snapshot-metric accent-${item.accent || "purple"}`}>
            <span className="metric-icon">{item.icon}</span>
            <strong className="metric-value">
              {item.value}
              {item.unit ? <span className="metric-unit">{item.unit}</span> : null}
            </strong>
            <span className="metric-label">{item.label}</span>
            {index < items.length - 1 ? <span className="metric-divider" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>

      <style jsx>{`
        .snapshot-card {
          padding: 0.85rem 0.9rem 0.95rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .snapshot-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .snapshot-title {
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
        }
        .snapshot-subtitle {
          color: var(--text-muted);
          font-size: 0.68rem;
        }
        .snapshot-rail {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0;
        }
        .snapshot-metric {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.22rem;
          padding: 0.3rem 0.25rem;
          text-align: center;
        }
        .metric-divider {
          position: absolute;
          top: 10%;
          bottom: 10%;
          right: 0;
          width: 1px;
          background: rgba(255, 255, 255, 0.08);
        }
        .metric-icon {
          width: 1.65rem;
          height: 1.65rem;
          border-radius: 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .accent-purple .metric-icon { border: 1px solid rgba(196,181,253,0.35); background: rgba(196,181,253,0.1); color: #ddd6fe; }
        .accent-cyan .metric-icon { border: 1px solid rgba(34,211,238,0.35); background: rgba(34,211,238,0.1); color: #a5f3fc; }
        .accent-pink .metric-icon { border: 1px solid rgba(244,114,182,0.38); background: rgba(244,114,182,0.12); color: #fbcfe8; }
        .accent-orange .metric-icon { border: 1px solid rgba(251,146,60,0.38); background: rgba(251,146,60,0.12); color: #fed7aa; }
        .accent-green .metric-icon { border: 1px solid rgba(52,211,153,0.38); background: rgba(52,211,153,0.12); color: #86efac; }
        .metric-value {
          display: inline-flex;
          align-items: baseline;
          gap: 0.18rem;
          color: #fff;
          font-size: 0.86rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.15;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .metric-unit {
          font-size: 0.56rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .metric-label {
          font-size: 0.58rem;
          font-weight: 700;
          color: var(--text-muted);
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        @media (max-width: 420px) {
          .snapshot-rail {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem 0;
          }
          .metric-divider {
            display: none;
          }
          .snapshot-metric:nth-child(odd)::after {
            content: "";
            position: absolute;
            top: 10%;
            bottom: 10%;
            right: 0;
            width: 1px;
            background: rgba(255, 255, 255, 0.08);
          }
        }
      `}</style>
    </FuturisticCard>
  );
}
