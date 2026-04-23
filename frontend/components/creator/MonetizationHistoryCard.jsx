"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import NeonBadge from "@/components/ui/NeonBadge";
import {
  ActivityIcon,
  CoinIcon,
  EmptyStateIcon,
  GiftIcon,
  HistoryIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

const MAX_DISPLAYED_ITEMS = 12;

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function resolveType(type) {
  if (type === "gift") return { label: "Regalo", tone: "purple", icon: <GiftIcon size={14} /> };
  if (type === "payout") return { label: "Retiro", tone: "cyan", icon: <WalletIcon size={14} /> };
  if (type === "call") return { label: "Llamada", tone: "green", icon: <ActivityIcon size={14} /> };
  return { label: "Actividad", tone: "pink", icon: <HistoryIcon size={14} /> };
}

function resolveStatus(status) {
  if (status === "credited" || status === "completed") return { label: "Completado", tone: "green" };
  if (status === "pending" || status === "processing") return { label: "Pendiente", tone: "purple" };
  if (status === "rejected") return { label: "Rechazado", tone: "pink" };
  return { label: status || "Actualizado", tone: "cyan" };
}

export default function MonetizationHistoryCard({ items = [] }) {
  return (
    <FuturisticCard className="history-card" accent="cyan" hover={false}>
      <PremiumSectionHeader
        title="Historial de monetización"
        subtitle="Transparencia total de cómo y cuándo generaste ingresos."
      />

      {items.length === 0 ? (
        <div className="history-empty">
          <span className="empty-icon"><EmptyStateIcon size={15} /></span>
          <div>
            <strong>Aún no hay actividad monetizada</strong>
            <p>Cuando recibas regalos o hagas solicitudes de retiro, aparecerán aquí.</p>
          </div>
        </div>
      ) : (
        <div className="history-list">
          {items.slice(0, MAX_DISPLAYED_ITEMS).map((item, index) => {
            const type = resolveType(item.type);
            const status = resolveStatus(item.status);
            return (
              <div className="history-row" key={item._id || `${item.type}-${item.createdAt}-${index}`}>
                <div className="history-meta">
                  <span className="row-icon">{type.icon}</span>
                  <div className="row-copy">
                    <strong>{item.label || type.label}</strong>
                    <p>{formatDate(item.createdAt)}</p>
                  </div>
                </div>
                <div className="history-chips">
                  <NeonBadge tone={type.tone}>{type.label}</NeonBadge>
                  <NeonBadge tone={status.tone}>{status.label}</NeonBadge>
                  <span className="amount"><CoinIcon size={13} /> {item.amountCoins ?? 0}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .history-card {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.86rem;
        }
        .history-empty {
          border-radius: 14px;
          border: 1px dashed rgba(148, 163, 184, 0.4);
          background: rgba(255, 255, 255, 0.02);
          padding: 0.9rem;
          display: flex;
          gap: 0.55rem;
          align-items: flex-start;
        }
        .empty-icon {
          width: 1.7rem;
          height: 1.7rem;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(255, 255, 255, 0.04);
          color: #c4b5fd;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .history-empty strong {
          color: #fff;
          font-size: 0.86rem;
        }
        .history-empty p {
          margin: 0.25rem 0 0;
          color: var(--text-muted);
          font-size: 0.78rem;
          line-height: 1.45;
        }
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .history-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.7rem;
          padding: 0.7rem;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(255, 255, 255, 0.03);
        }
        .history-meta {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 0.46rem;
        }
        .row-icon {
          width: 1.8rem;
          height: 1.8rem;
          border-radius: 10px;
          border: 1px solid rgba(34, 211, 238, 0.28);
          background: rgba(34, 211, 238, 0.1);
          color: #a5f3fc;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .row-copy strong {
          color: #fff;
          font-size: 0.83rem;
          display: block;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
        }
        .row-copy p {
          margin: 0.22rem 0 0;
          color: var(--text-muted);
          font-size: 0.72rem;
        }
        .history-chips {
          display: flex;
          align-items: center;
          gap: 0.34rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .amount {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.22rem 0.58rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(250, 204, 21, 0.34);
          background: rgba(250, 204, 21, 0.12);
          color: #fde68a;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
        }
        @media (max-width: 700px) {
          .history-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .history-chips {
            justify-content: flex-start;
          }
        }
      `}</style>
    </FuturisticCard>
  );
}
