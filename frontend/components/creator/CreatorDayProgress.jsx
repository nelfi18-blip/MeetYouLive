"use client";

import { useEffect, useState } from "react";
import FuturisticCard from "@/components/ui/FuturisticCard";
import NeonBadge from "@/components/ui/NeonBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CoinIcon,
  GiftIcon,
  HistoryIcon,
  ShieldIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

const CONSISTENCY_PERIOD_DAYS = 30;
const WEEKLY_GOAL_DAYS = 5;
const STREAK_DOTS = 10;
const COLLAPSED_ITEMS = 4;
const MAX_DISPLAYED_ITEMS = 12;

function ConsistencyDots({ activeDays, totalDays }) {
  const ratio = totalDays > 0 ? activeDays / totalDays : 0;
  const filledDots = Math.round(ratio * STREAK_DOTS);
  return (
    <div className="streak-dots">
      {Array.from({ length: STREAK_DOTS }, (_, i) => (
        <span key={i} className={`dot${i < filledDots ? " dot-on" : ""}`} />
      ))}
      <style jsx>{`
        .streak-dots { display: flex; gap: 0.18rem; align-items: center; }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.2);
          border: 1px solid rgba(139, 92, 246, 0.3);
        }
        .dot-on {
          background: linear-gradient(135deg, #a855f7, #22d3ee);
          border-color: rgba(168, 85, 247, 0.5);
          box-shadow: 0 0 5px rgba(168, 85, 247, 0.5);
        }
      `}</style>
    </div>
  );
}

function formatDate(value, t) {
  if (!value) return t("creatorMonetization.noDate");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("creatorMonetization.noDate");
  return date.toLocaleDateString(t("common.locale"), { day: "2-digit", month: "short" });
}

function resolveType(type, t) {
  if (type === "gift") return { label: t("creatorMonetization.gift"), color: "#a5f3fc", icon: <GiftIcon size={13} /> };
  if (type === "payout") return { label: t("creatorMonetization.payout"), color: "#a5f3fc", icon: <WalletIcon size={13} /> };
  return { label: t("creatorMonetization.activity"), color: "#fbcfe8", icon: <HistoryIcon size={13} /> };
}

function resolveStatusTone(status) {
  if (status === "credited" || status === "completed") return "#86efac";
  if (status === "pending" || status === "processing") return "#c4b5fd";
  if (status === "rejected") return "#fda4af";
  return "#a5f3fc";
}

/**
 * Single composed surface for "Tu dia / Tu progreso": level progress,
 * weekly consistency, the latest real event, and an inline expandable
 * history. Replaces what used to be two consecutive blocks
 * (Progreso + Actividad reciente).
 */
export default function CreatorDayProgress({ creatorLevel, consistencyDays, items = [] }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  // "Ver historial" (CreatorWalletCompact) and the action launcher's "Gifts
  // received" tile both link to "#gifts". Since the detailed history list
  // here is collapsed by default, navigating to that anchor must also
  // auto-expand it - otherwise the link would scroll to a near-empty view
  // instead of revealing real history, same hash-listening pattern used by
  // CreatorCenterNav.
  useEffect(() => {
    const syncFromHash = () => {
      if (window.location.hash === "#gifts") setExpanded(true);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const progress = Math.max(0, Math.min(100, Number(creatorLevel?.progressPercent || 0)));
  const hasLevelData = Boolean(creatorLevel?.current?.label);
  const activeDays = Number(consistencyDays) || 0;
  const weeklyProgress = Math.min(activeDays, WEEKLY_GOAL_DAYS);
  const weeklyPercent = Math.round((weeklyProgress / WEEKLY_GOAL_DAYS) * 100);
  const isOnTrack = weeklyProgress >= WEEKLY_GOAL_DAYS;

  const lastItem = items[0] || null;
  const visibleItems = items.slice(0, expanded ? MAX_DISPLAYED_ITEMS : 0);

  return (
    <FuturisticCard className="day-card" accent="purple" hover={false}>
      <div className="day-head">
        <span className="day-title">{t("creatorProgress.title")}</span>
        {hasLevelData ? (
          <NeonBadge tone="purple">
            <ShieldIcon size={11} /> {creatorLevel.current.label}
          </NeonBadge>
        ) : (
          <NeonBadge tone="cyan">{t("creatorProgress.roadmap")}</NeonBadge>
        )}
      </div>

      {hasLevelData ? (
        <>
          <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-copy">
            {creatorLevel?.next?.label
              ? t("creatorProgress.pointsToNext")
                .replace("{points}", creatorLevel.pointsToNext || 0)
                .replace("{label}", creatorLevel.next.label)
              : t("creatorProgress.maxLevel")}
          </p>
        </>
      ) : (
        <p className="progress-copy">{t("creatorProgress.roadmapText")}</p>
      )}

      <div className="weekly-row">
        <ConsistencyDots activeDays={activeDays} totalDays={CONSISTENCY_PERIOD_DAYS} />
        <div className="weekly-bar">
          <div className="weekly-fill" style={{ width: `${weeklyPercent}%` }} />
        </div>
        <NeonBadge tone={isOnTrack ? "green" : "purple"} className="weekly-badge">
          {isOnTrack
            ? t("creatorProgress.onStreak")
            : t("creatorProgress.weeklyDays").replace("{current}", weeklyProgress).replace("{total}", WEEKLY_GOAL_DAYS)}
        </NeonBadge>
      </div>

      <span id="gifts" className="anchor-target" aria-hidden="true" />
      <div className="activity-row">
        {lastItem ? (
          (() => {
            const type = resolveType(lastItem.type, t);
            const statusColor = resolveStatusTone(lastItem.status);
            return (
              <div className="last-event">
                <span className="row-icon" style={{ color: type.color }}>{type.icon}</span>
                <div className="row-copy">
                  <strong>{lastItem.label || type.label}</strong>
                  <span className="row-date">{formatDate(lastItem.createdAt, t)}</span>
                </div>
                <span className="row-status" style={{ color: statusColor }}>●</span>
                <span className="row-amount"><CoinIcon size={11} /> {lastItem.amountCoins ?? 0}</span>
              </div>
            );
          })()
        ) : (
          <span className="no-activity">{t("creatorMonetization.emptyTitle")}</span>
        )}
        {items.length > 0 ? (
          <button type="button" className="history-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t("creatorMonetization.showLess") : t("creatorMonetization.viewAll")}
          </button>
        ) : null}
      </div>

      {expanded && visibleItems.length > 0 ? (
        <div className="history-list">
          {visibleItems.slice(1).map((item, index) => {
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
      ) : null}

      <style jsx>{`
        .day-card {
          padding: 0.85rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .day-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .day-title {
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
        }
        .progress-track {
          width: 100%;
          border-radius: 999px;
          height: 0.4rem;
          border: 1px solid rgba(139, 92, 246, 0.4);
          background: rgba(139, 92, 246, 0.1);
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #a855f7, #22d3ee);
          transition: width var(--transition-slow);
        }
        .progress-copy {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.74rem;
          line-height: 1.4;
        }
        .weekly-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding-top: 0.3rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          flex-wrap: wrap;
        }
        .weekly-bar {
          flex: 1;
          min-width: 60px;
          height: 0.35rem;
          border-radius: 999px;
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.3);
          overflow: hidden;
        }
        .weekly-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #a855f7, #22d3ee);
          transition: width var(--transition-slow);
        }
        .anchor-target {
          display: block;
          height: 0;
          width: 0;
        }
        .activity-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding-top: 0.35rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .no-activity {
          flex: 1;
          color: var(--text-muted);
          font-size: 0.76rem;
        }
        .last-event {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }
        .history-toggle {
          flex-shrink: 0;
          background: none;
          border: none;
          color: #67e8f9;
          font-size: 0.7rem;
          font-weight: 700;
          cursor: pointer;
          padding: 0.1rem 0.2rem;
        }
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .history-row,
        .last-event {
          position: relative;
        }
        .history-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .history-row:last-child {
          border-bottom: none;
        }
        .row-icon {
          width: 1.45rem;
          height: 1.45rem;
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
          font-size: 0.75rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .row-date {
          color: var(--text-muted);
          font-size: 0.64rem;
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
          font-size: 0.72rem;
          font-weight: 800;
        }
      `}</style>
    </FuturisticCard>
  );
}
