"use client";

import { useEffect, useRef, useState } from "react";
import { notify } from "@/lib/notify";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function MissionLikeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m19.5 13.57-7 7a.69.69 0 0 1-1 0l-7-7a5 5 0 1 1 7-7l.5.5.5-.5a5 5 0 1 1 7 7Z" />
    </svg>
  );
}

function MissionChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function MissionLiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="15" height="12" rx="2" />
      <path d="m22 8-5 4 5 4V8Z" />
    </svg>
  );
}

function MissionGiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12v10H4V12" />
      <path d="M2 7h20v5H2z" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 10h3.2a1.8 1.8 0 1 1 0 3.6H9.5" />
    </svg>
  );
}

function BonusIcon({ done = false }) {
  if (done) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="5" />
        <path d="m8 14 1.5 8L12 20l2.5 2L16 14" />
      </svg>
    );
  }
  return <MissionGiftIcon />;
}

function getMissionIcon(id) {
  if (id === "likes_10") return <MissionLikeIcon />;
  if (id === "chat_1") return <MissionChatIcon />;
  if (id === "live_1") return <MissionLiveIcon />;
  if (id === "gift_1") return <MissionGiftIcon />;
  return <MissionGiftIcon />;
}

/**
 * DailyMissions
 *
 * Fetches GET /api/missions/today on mount and after a page visibility change.
 * Displays each mission with a progress bar, coin reward badge, and completion status.
 * Shows a bonus indicator when all missions are completed.
 */
export default function DailyMissions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchMissions = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { setLoading(false); return; }

    try {
      const res = await fetch(`${API_URL}/api/missions/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();

      setData((prev) => {
        // Fire notification if a new mission was just completed
        if (prev) {
          const prevCompletedIds = new Set(
            prev.missions.filter((pm) => pm.completed).map((pm) => pm.id)
          );
          if (json.completedCount > prev.completedCount) {
            const justDone = json.missions.find(
              (m) => m.completed && !prevCompletedIds.has(m.id)
            );
            if (justDone) {
              notify({
                icon: justDone.icon,
                title: "¡Misión completada!",
                body: `${justDone.label} · +${justDone.coins} monedas`,
              });
            }
          }
          if (json.allCompleted && !prev.allCompleted) {
            notify({
              icon: "🏆",
              title: "¡Todas las misiones completadas!",
              body: `+${json.bonusCoins} monedas de bonus`,
            });
          }
        }
        return json;
      });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchMissions();
    }

    // Refetch when user returns to the tab
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchMissions();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !data) return null;

  const { missions, completedCount, totalCount, allCompleted, bonusRewarded, bonusCoins } = data;

  return (
    <section className="dm-wrap" aria-label="Misiones diarias">
      <div className="dm-header">
        <h2 className="dm-title">Misiones de hoy</h2>
        <div className="dm-summary">
          <span className="dm-count">{completedCount}/{totalCount} completadas</span>
          {!allCompleted && (
            <span className="dm-remaining">
              Te faltan {totalCount - completedCount} {totalCount - completedCount === 1 ? "misión" : "misiones"}
            </span>
          )}
          {allCompleted && (
            <span className="dm-all-done">Todo completado</span>
          )}
        </div>
      </div>

      <div className="dm-missions">
        {missions.map((m) => {
          const pct = Math.min(100, Math.round((m.count / m.target) * 100));
          return (
            <div key={m.id} className={`dm-mission${m.completed ? " dm-done" : ""}`}>
              <div className="dm-mission-top">
                <span className="dm-icon">{getMissionIcon(m.id)}</span>
                <span className="dm-label">{m.label}</span>
                <span className="dm-reward"><CoinIcon /> +{m.coins}</span>
              </div>
              <div className="dm-bar-wrap" role="progressbar" aria-valuenow={m.count} aria-valuemax={m.target}>
                <div className="dm-bar-track">
                  <div className="dm-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="dm-bar-text">
                  {m.completed ? "✓ Completada" : `${m.count}/${m.target}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* All-missions bonus */}
      <div className={`dm-bonus${allCompleted ? " dm-bonus-done" : ""}`}>
          <span className="dm-bonus-icon"><BonusIcon done={allCompleted && bonusRewarded} /></span>
        <div className="dm-bonus-text">
          <span className="dm-bonus-label">Bonus: completa todas las misiones</span>
          {!allCompleted && <span className="dm-bonus-sub">+{bonusCoins} monedas extra al completarlas todas</span>}
          {allCompleted && bonusRewarded && <span className="dm-bonus-sub dm-bonus-claimed">¡Bonus recibido! +{bonusCoins} monedas</span>}
        </div>
        {!allCompleted && <span className="dm-bonus-coins"><CoinIcon /> +{bonusCoins}</span>}
      </div>

      <style jsx>{`
        .dm-wrap {
          background: linear-gradient(135deg, rgba(15,8,32,0.95) 0%, rgba(20,10,42,0.95) 100%);
          border: 1px solid rgba(139,92,246,0.25);
          border-radius: 16px;
          padding: 1rem 1.1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .dm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .dm-title {
          font-size: 1rem;
          font-weight: 800;
          color: #e0aaff;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .dm-summary {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.1rem;
        }

        .dm-count {
          font-size: 0.78rem;
          font-weight: 700;
          color: rgba(255,255,255,0.7);
        }

        .dm-remaining {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.42);
        }

        .dm-all-done {
          font-size: 0.75rem;
          font-weight: 700;
          color: #6ee7b7;
        }

        .dm-missions {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        .dm-mission {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(139,92,246,0.12);
          border-radius: 12px;
          padding: 0.65rem 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          transition: border-color 0.2s, background 0.2s;
        }

        .dm-mission.dm-done {
          background: rgba(110,231,183,0.06);
          border-color: rgba(110,231,183,0.28);
        }

        .dm-mission-top {
          display: flex;
          align-items: center;
          gap: 0.55rem;
        }

        .dm-icon {
          width: 18px;
          height: 18px;
          color: #d8b4fe;
          flex-shrink: 0;
          display: inline-flex;
        }
        .dm-icon :global(svg) {
          width: 18px;
          height: 18px;
        }

        .dm-label {
          flex: 1;
          font-size: 0.83rem;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
        }

        .dm-mission.dm-done .dm-label {
          color: rgba(255,255,255,0.55);
          text-decoration: line-through;
          text-decoration-color: rgba(110,231,183,0.4);
        }

        .dm-reward {
          flex-shrink: 0;
          font-size: 0.75rem;
          font-weight: 800;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: 999px;
          padding: 0.18rem 0.55rem;
          display: inline-flex;
          align-items: center;
          gap: 0.28rem;
        }
        .dm-reward :global(svg) {
          width: 14px;
          height: 14px;
        }

        .dm-bar-wrap {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .dm-bar-track {
          flex: 1;
          height: 5px;
          background: rgba(255,255,255,0.1);
          border-radius: 999px;
          overflow: hidden;
        }

        .dm-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #8b5cf6, #ec4899);
          border-radius: 999px;
          transition: width 0.4s ease;
        }

        .dm-mission.dm-done .dm-bar-fill {
          background: linear-gradient(90deg, #6ee7b7, #34d399);
        }

        .dm-bar-text {
          flex-shrink: 0;
          font-size: 0.68rem;
          font-weight: 600;
          color: rgba(255,255,255,0.45);
          min-width: 60px;
          text-align: right;
        }

        .dm-mission.dm-done .dm-bar-text {
          color: #6ee7b7;
        }

        /* Bonus row */
        .dm-bonus {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          background: rgba(251,191,36,0.05);
          border: 1px solid rgba(251,191,36,0.2);
          border-radius: 12px;
          padding: 0.6rem 0.85rem;
          transition: background 0.2s, border-color 0.2s;
        }

        .dm-bonus.dm-bonus-done {
          background: rgba(251,191,36,0.1);
          border-color: rgba(251,191,36,0.4);
        }

        .dm-bonus-icon {
          width: 18px;
          height: 18px;
          color: #fbbf24;
          flex-shrink: 0;
          display: inline-flex;
        }
        .dm-bonus-icon :global(svg) {
          width: 18px;
          height: 18px;
        }

        .dm-bonus-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }

        .dm-bonus-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: rgba(255,255,255,0.75);
        }

        .dm-bonus-sub {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.42);
        }

        .dm-bonus-sub.dm-bonus-claimed {
          color: #fbbf24;
        }

        .dm-bonus-coins {
          flex-shrink: 0;
          font-size: 0.8rem;
          font-weight: 800;
          color: #fbbf24;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        .dm-bonus-coins :global(svg) {
          width: 14px;
          height: 14px;
        }
      `}</style>
    </section>
  );
}
