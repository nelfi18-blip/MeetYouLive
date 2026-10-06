"use client";

import FuturisticCard from "@/components/ui/FuturisticCard";
import NeonBadge from "@/components/ui/NeonBadge";
import { ShieldIcon } from "@/components/ui/MonetizationIcons";
import { useLanguage } from "@/contexts/LanguageContext";

const CONSISTENCY_PERIOD_DAYS = 30;
const WEEKLY_GOAL_DAYS = 5;
const STREAK_DOTS = 10;

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

export default function CreatorProgressCard({ creatorLevel, consistencyDays }) {
  const { t } = useLanguage();
  const progress = Math.max(0, Math.min(100, Number(creatorLevel?.progressPercent || 0)));
  const hasLevelData = Boolean(creatorLevel?.current?.label);
  const activeDays = Number(consistencyDays) || 0;
  const weeklyProgress = Math.min(activeDays, WEEKLY_GOAL_DAYS);
  const weeklyPercent = Math.round((weeklyProgress / WEEKLY_GOAL_DAYS) * 100);
  const isOnTrack = weeklyProgress >= WEEKLY_GOAL_DAYS;

  return (
    <FuturisticCard className="progress-card" accent="purple" hover={false}>
      <div className="progress-head">
        <span className="progress-title">{t("creatorProgress.title")}</span>
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

      <style jsx>{`
        .progress-card {
          padding: 0.8rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .progress-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .progress-title {
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
      `}</style>
    </FuturisticCard>
  );
}
