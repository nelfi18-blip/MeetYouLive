"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** Achievements that are always shown (locked or unlocked). */
const ACHIEVEMENT_ORDER = [
  "streak_3",
  "streak_7",
  "streak_14",
  "streak_30",
  "gift_first_sent",
  "top_fan_first",
  "missions_first",
  "level_5",
  "level_10",
];

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="14" height="14">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="10" height="10">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

/**
 * UserProgressCard
 *
 * Displays the user's XP level, progress bar, and achievement badges.
 * Fetches GET /api/user/progression on mount.
 */
export default function UserProgressCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newAchievement, setNewAchievement] = useState(null);
  const prevAchievementsRef = useRef(null);
  const hasFetched = useRef(false);

  const fetchProgression = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/user/progression`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();

      // Detect newly unlocked achievements for animation
      if (prevAchievementsRef.current) {
        const prevUnlocked = new Set(
          prevAchievementsRef.current
            .filter((a) => a.unlocked)
            .map((a) => a.id)
        );
        const justUnlocked = json.achievements?.find(
          (a) => a.unlocked && !prevUnlocked.has(a.id)
        );
        if (justUnlocked) {
          setNewAchievement(justUnlocked);
          setTimeout(() => setNewAchievement(null), 3500);
        }
      }
      prevAchievementsRef.current = json.achievements || [];

      setData(json);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchProgression();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchProgression();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !data) return null;

  const { level, xp, progressPct, xpInLevel, xpNeededForLevel, achievements, maxLevel } = data;
  const isMaxLevel = level >= maxLevel;

  // Sort achievements by the desired display order
  const sortedAchievements = [...(achievements || [])].sort((a, b) => {
    const ia = ACHIEVEMENT_ORDER.indexOf(a.id);
    const ib = ACHIEVEMENT_ORDER.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return (
    <section className="upc-wrap" aria-label="Progresión y logros">
      {/* Achievement unlock animation overlay */}
      {newAchievement && (
        <div className="upc-achievement-toast" role="alert" aria-live="polite">
          <span className="upc-achievement-toast-icon">{newAchievement.icon}</span>
          <div className="upc-achievement-toast-body">
            <span className="upc-achievement-toast-title">¡Logro desbloqueado!</span>
            <span className="upc-achievement-toast-label">{newAchievement.label}</span>
          </div>
        </div>
      )}

      <div className="upc-header">
        <div className="upc-level-badge">
          <span className="upc-level-icon"><StarIcon /></span>
          <span className="upc-level-num">Nv. {level}</span>
        </div>
        <div className="upc-title-group">
          <h2 className="upc-title">Tu progresión</h2>
          {!isMaxLevel && (
            <span className="upc-xp-label">
              {xpInLevel} / {xpNeededForLevel} XP para el siguiente nivel
            </span>
          )}
          {isMaxLevel && (
            <span className="upc-xp-label upc-xp-max">¡Nivel máximo alcanzado!</span>
          )}
        </div>
        <span className="upc-total-xp">{xp} XP</span>
      </div>

      {/* XP progress bar */}
      <div className="upc-bar-wrap" role="progressbar" aria-valuenow={progressPct} aria-valuemax={100} aria-label={`Progreso nivel ${level}`}>
        <div className="upc-bar-track">
          <div className="upc-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="upc-bar-pct">{progressPct}%</span>
      </div>

      {/* Achievement badges */}
      {sortedAchievements.length > 0 && (
        <div className="upc-achievements" aria-label="Logros">
          {sortedAchievements.map((a) => (
            <div
              key={a.id}
              className={`upc-badge${a.unlocked ? " upc-badge-unlocked" : " upc-badge-locked"}`}
              title={a.unlocked ? `${a.label} — ${a.description}` : `Bloqueado: ${a.description}`}
              aria-label={a.unlocked ? `Logro: ${a.label}` : `Logro bloqueado: ${a.label}`}
            >
              <span className="upc-badge-icon">
                {a.unlocked ? a.icon : <LockIcon />}
              </span>
              <span className="upc-badge-label">{a.label}</span>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .upc-wrap {
          position: relative;
          background: linear-gradient(135deg, rgba(15,8,32,0.95) 0%, rgba(20,10,42,0.95) 100%);
          border: 1px solid rgba(139,92,246,0.22);
          border-radius: 16px;
          padding: 1rem 1.1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          overflow: hidden;
        }

        /* Achievement unlock toast */
        .upc-achievement-toast {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.55rem;
          background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(139,92,246,0.12));
          border: 1px solid rgba(251,191,36,0.4);
          border-radius: 12px;
          padding: 0.55rem 0.85rem;
          z-index: 10;
          animation: upc-slide-in 0.35s ease, upc-fade-out 0.4s ease 3.1s forwards;
          box-shadow: 0 4px 20px rgba(251,191,36,0.2);
        }
        @keyframes upc-slide-in {
          from { transform: translateY(-12px) scale(0.95); opacity: 0; }
          to   { transform: translateY(0)     scale(1);    opacity: 1; }
        }
        @keyframes upc-fade-out {
          from { opacity: 1; }
          to   { opacity: 0; pointer-events: none; }
        }

        .upc-achievement-toast-icon { font-size: 1.4rem; }
        .upc-achievement-toast-body {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .upc-achievement-toast-title {
          font-size: 0.68rem;
          font-weight: 700;
          color: #fbbf24;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .upc-achievement-toast-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: #f1f5f9;
        }

        /* Header */
        .upc-header {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        .upc-level-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(236,72,153,0.15));
          border: 1px solid rgba(139,92,246,0.35);
          border-radius: 8px;
          padding: 0.3rem 0.65rem;
          flex-shrink: 0;
        }
        .upc-level-icon {
          color: #fbbf24;
          display: inline-flex;
        }
        .upc-level-num {
          font-size: 0.82rem;
          font-weight: 900;
          color: #f1f5f9;
          white-space: nowrap;
        }

        .upc-title-group {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          flex: 1;
          min-width: 0;
        }

        .upc-title {
          font-size: 0.88rem;
          font-weight: 800;
          color: #e0aaff;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .upc-xp-label {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.42);
        }
        .upc-xp-max { color: #fbbf24; }

        .upc-total-xp {
          font-size: 0.78rem;
          font-weight: 800;
          color: rgba(255,255,255,0.55);
          flex-shrink: 0;
        }

        /* Progress bar */
        .upc-bar-wrap {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .upc-bar-track {
          flex: 1;
          height: 6px;
          background: rgba(255,255,255,0.08);
          border-radius: 999px;
          overflow: hidden;
        }

        .upc-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #8b5cf6, #ec4899);
          border-radius: 999px;
          transition: width 0.5s ease;
        }

        .upc-bar-pct {
          flex-shrink: 0;
          font-size: 0.68rem;
          font-weight: 700;
          color: rgba(255,255,255,0.4);
          min-width: 34px;
          text-align: right;
        }

        /* Achievement badges */
        .upc-achievements {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        .upc-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          border-radius: 8px;
          padding: 0.25rem 0.55rem;
          font-size: 0.72rem;
          font-weight: 700;
          transition: transform 0.15s;
          cursor: default;
        }

        .upc-badge-unlocked {
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.3);
          color: #d8b4fe;
        }
        .upc-badge-unlocked:hover { transform: scale(1.05); }

        .upc-badge-locked {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.28);
        }

        .upc-badge-icon {
          display: inline-flex;
          align-items: center;
          font-size: 0.9rem;
        }
        .upc-badge-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100px;
        }
      `}</style>
    </section>
  );
}
