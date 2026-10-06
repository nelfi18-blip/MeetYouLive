"use client";

import { useState } from "react";
import FuturisticCard from "@/components/ui/FuturisticCard";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ActivityIcon,
  CoinIcon,
  EmptyStateIcon,
  GiftIcon,
  HistoryIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

const COLLAPSED_ITEMS = 4;
const MAX_DISPLAYED_ITEMS = 12;

function formatDate(value, t) {
  if (!value) return t("creatorMonetization.noDate");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("creatorMonetization.noDate");
  return date.toLocaleDateString(t("common.locale"), {
    day: "2-digit",
    month: "short",
  });
}

function resolveType(type, t) {
  if (type === "gift") return { label: t("creatorMonetization.gift"), color: "#a5f3fc", icon: <GiftIcon size={13} /> };
  if (type === "payout") return { label: t("creatorMonetization.payout"), color: "#a5f3fc", icon: <WalletIcon size={13} /> };
  if (type === "call") return { label: t("creatorMonetization.call"), color: "#86efac", icon: <ActivityIcon size={13} /> };
  return { label: t("creatorMonetization.activity"), color: "#fbcfe8", icon: <HistoryIcon size={13} /> };
}

function resolveStatusTone(status) {
  if (status === "credited" || status === "completed") return "#86efac";
  if (status === "pending" || status === "processing") return "#c4b5fd";
  if (status === "rejected") return "#fda4af";
  return "#a5f3fc";
}

export default function MonetizationHistoryCard({ items = [] }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const visibleItems = items.slice(0, expanded ? MAX_DISPLAYED_ITEMS : COLLAPSED_ITEMS);

  return (
    <FuturisticCard className="history-card" accent="cyan" hover={false}>
      <div className="history-head">
        <span className="history-title">{t("creatorMonetization.title")}</span>
        {items.length > COLLAPSED_ITEMS ? (
          <button type="button" className="history-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t("creatorMonetization.showLess") : t("creatorMonetization.viewAll")}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="history-empty">
          <span className="empty-icon"><EmptyStateIcon size={14} /></span>
          <span>{t("creatorMonetization.emptyTitle")}</span>
        </div>
      ) : (
        <div className="history-list">
          {visibleItems.map((item, index) => {
            const type = resolveType(item.type, t);
            const statusColor = resolveStatusTone(item.status);
            return (
              <div className="history-row" key={item._id || `${item.type}-${item.createdAt}-${index}`}>
                <span className="row-icon" style={{ color: type.color }}>{type.icon}</span>
                <div className="row-copy">
                  <strong>{item.label || type.label}</strong>
                  <span className="row-date">{formatDate(item.createdAt, t)}</span>
                </div>
                <span className="row-status" style={{ color: statusColor }}>●</span>
                <span className="row-amount"><CoinIcon size={11} /> {item.amountCoins ?? 0}</span>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .history-card {
          padding: 0.8rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .history-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .history-title {
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
        }
        .history-toggle {
          background: none;
          border: none;
          color: #67e8f9;
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          padding: 0.1rem 0.2rem;
        }
        .history-empty {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.5rem 0;
          color: var(--text-muted);
          font-size: 0.78rem;
        }
        .empty-icon {
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(255, 255, 255, 0.04);
          color: #c4b5fd;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .history-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.4rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .history-row:last-child {
          border-bottom: none;
        }
        .row-icon {
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 8px;
          border: 1px solid rgba(34, 211, 238, 0.28);
          background: rgba(34, 211, 238, 0.1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .row-copy {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.02rem;
        }
        .row-copy strong {
          color: #fff;
          font-size: 0.76rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .row-date {
          color: var(--text-muted);
          font-size: 0.66rem;
        }
        .row-status {
          flex-shrink: 0;
          font-size: 0.6rem;
        }
        .row-amount {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
          color: #fde68a;
          font-size: 0.74rem;
          font-weight: 800;
        }
      `}</style>
    </FuturisticCard>
  );
}
