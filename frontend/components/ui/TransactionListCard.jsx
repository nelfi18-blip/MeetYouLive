"use client";

import Link from "next/link";
import FuturisticCard from "./FuturisticCard";
import PremiumSectionHeader from "./PremiumSectionHeader";
import NeonBadge from "./NeonBadge";
import { EmptyStateIcon } from "./MonetizationIcons";

function toDateText(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TransactionListCard({
  title,
  subtitle,
  items,
  loading,
  emptyText,
  labels,
  symbol,
  historyHref,
  actionLabel = "Ver historial",
}) {
  return (
    <FuturisticCard accent="purple" className="tlc" hover={false}>
      <PremiumSectionHeader
        title={title}
        subtitle={subtitle}
        action={historyHref ? <Link href={historyHref} className="tlc-link">{actionLabel} →</Link> : null}
      />

      {loading ? (
        <div className="tlc-state">Cargando movimientos…</div>
      ) : !items.length ? (
        <div className="tlc-empty">
          <span className="tlc-empty-icon"><EmptyStateIcon size={18} /></span>
          <span>{emptyText}</span>
        </div>
      ) : (
        <div className="tlc-list">
          {items.map((item) => {
            const info = labels[item.type] || { label: item.type, tone: "purple" };
            const sign = item.amount > 0 ? "+" : item.amount < 0 ? "-" : "";
            return (
              <div key={item._id} className="tlc-row">
                <div className="tlc-row-left">
                  <NeonBadge tone={info.tone || "purple"}>{info.label}</NeonBadge>
                  <p className="tlc-reason">{item.reason || "Movimiento"}</p>
                </div>
                <div className="tlc-row-right">
                  <span className={`tlc-amount ${item.amount >= 0 ? "is-plus" : "is-minus"}`}>
                    {sign}{Math.abs(item.amount)} {symbol}
                  </span>
                  <span className="tlc-date">{toDateText(item.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .tlc {
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .tlc-state {
          color: var(--text-muted);
          font-size: 0.88rem;
          padding: 0.9rem 0 0.4rem;
        }
        .tlc-empty {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 0.84rem;
          color: var(--text-muted);
          padding: 0.9rem 0 0.4rem;
        }
        .tlc-empty-icon {
          width: 1.8rem;
          height: 1.8rem;
          border-radius: 10px;
          border: 1px solid rgba(148,163,184,0.28);
          background: rgba(255,255,255,0.04);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #c4b5fd;
          flex-shrink: 0;
        }
        .tlc-list {
          display: flex;
          flex-direction: column;
          gap: 0.56rem;
        }
        .tlc-row {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.78rem 0.85rem;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.18);
          background: rgba(255,255,255,0.03);
        }
        .tlc-row-left {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.34rem;
        }
        .tlc-reason {
          margin: 0;
          font-size: 0.76rem;
          color: var(--text-dim);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 220px;
        }
        .tlc-row-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.16rem;
          flex-shrink: 0;
        }
        .tlc-amount {
          font-size: 0.84rem;
          font-weight: 800;
        }
        .tlc-amount.is-plus { color: #86efac; }
        .tlc-amount.is-minus { color: #fda4af; }
        .tlc-date {
          font-size: 0.72rem;
          color: var(--text-dim);
        }
        :global(.tlc-link) {
          color: #c4b5fd;
          font-size: 0.78rem;
          font-weight: 700;
          text-decoration: none;
        }
        :global(.tlc-link:hover) {
          color: #f5d0fe;
        }
        @media (max-width: 480px) {
          .tlc-row {
            flex-direction: column;
          }
          .tlc-row-right {
            align-items: flex-start;
          }
          .tlc-reason {
            max-width: 100%;
          }
        }
      `}</style>
    </FuturisticCard>
  );
}
