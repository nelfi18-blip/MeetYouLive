"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = [
  { border: "rgba(255,215,0,0.5)", glow: "rgba(255,215,0,0.25)", label: "#ffd700" },
  { border: "rgba(192,192,192,0.5)", glow: "rgba(192,192,192,0.2)",  label: "#c0c0c0" },
  { border: "rgba(205,127,50,0.5)",  glow: "rgba(205,127,50,0.2)",  label: "#cd7f32" },
];

export default function TopGifters({ liveId }) {
  const [gifters, setGifters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!liveId) return;
    fetch(`${API_URL}/api/rankings/live/${liveId}/top-gifters`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setGifters(Array.isArray(data) ? data.slice(0, 3) : []))
      .catch(() => setGifters([]))
      .finally(() => setLoading(false));
  }, [liveId]);

  if (!loading && gifters.length === 0) return null;

  return (
    <div className="top-gifters">
      <div className="tg-header">
        <span className="tg-header-icon">👑</span>
        <span className="tg-header-title">Top Gifters</span>
      </div>

      {loading ? (
        <div className="tg-list">
          {[...Array(3)].map((_, i) => (
            <div key={`tg-skeleton-${i}`} className="tg-skeleton" />
          ))}
        </div>
      ) : (
        <div className="tg-list">
          {gifters.map((g, i) => {
            const mc = MEDAL_COLORS[i] || MEDAL_COLORS[2];
            const displayName = g.username || g.name || "Anónimo";
            return (
              <div
                key={String(g.userId)}
                className="tg-row"
                style={{
                  borderColor: mc.border,
                  boxShadow: `0 0 10px ${mc.glow}`,
                }}
              >
                <span className="tg-medal">{MEDALS[i]}</span>
                <span className="tg-name">
                  @{displayName}
                  {g.isPremium && <span className="tg-premium">⭐</span>}
                </span>
                <span className="tg-coins" style={{ color: mc.label }}>
                  🪙 {g.totalCoins}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .top-gifters {
          background: rgba(12, 6, 28, 0.85);
          border: 1px solid rgba(255, 215, 0, 0.2);
          border-radius: var(--radius-sm);
          padding: 0.7rem 0.85rem;
          margin-bottom: 0.5rem;
        }

        .tg-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.55rem;
        }

        .tg-header-icon { font-size: 0.95rem; }

        .tg-header-title {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #ffd700;
        }

        .tg-list {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .tg-skeleton {
          height: 28px;
          border-radius: 6px;
          background: rgba(255,255,255,0.05);
          animation: shimmer 1.4s infinite;
        }

        @keyframes shimmer {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        .tg-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid transparent;
          border-radius: 6px;
          padding: 0.3rem 0.55rem;
          transition: box-shadow 0.2s;
        }

        .tg-medal { font-size: 0.9rem; flex-shrink: 0; }

        .tg-name {
          flex: 1;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tg-premium {
          font-size: 0.65rem;
          margin-left: 0.25rem;
        }

        .tg-coins {
          font-size: 0.72rem;
          font-weight: 800;
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
