"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const RANK_CFG = [
  {
    rank: 1,
    medal: "👑",
    label: "#1",
    border: "rgba(255,215,0,0.65)",
    glow: "rgba(255,215,0,0.35)",
    coinColor: "#ffd700",
    avatarBg: "linear-gradient(135deg,#ffd700 0%,#ff8c00 100%)",
    avatarShadow: "0 0 14px rgba(255,215,0,0.55)",
    rowBg: "rgba(255,215,0,0.06)",
  },
  {
    rank: 2,
    medal: "🥈",
    label: "#2",
    border: "rgba(192,192,192,0.55)",
    glow: "rgba(192,192,192,0.25)",
    coinColor: "#c0c0c0",
    avatarBg: "linear-gradient(135deg,#c0c0c0 0%,#9ca3af 100%)",
    avatarShadow: "0 0 10px rgba(192,192,192,0.35)",
    rowBg: "rgba(192,192,192,0.04)",
  },
  {
    rank: 3,
    medal: "🥉",
    label: "#3",
    border: "rgba(205,127,50,0.55)",
    glow: "rgba(205,127,50,0.25)",
    coinColor: "#cd7f32",
    avatarBg: "linear-gradient(135deg,#cd7f32 0%,#92400e 100%)",
    avatarShadow: "0 0 10px rgba(205,127,50,0.35)",
    rowBg: "rgba(205,127,50,0.04)",
  },
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
        <span className="tg-header-live">LIVE</span>
      </div>

      <div className="tg-list">
        {loading
          ? [...Array(3)].map((_, i) => (
              <div key={`tg-skeleton-${i}`} className="tg-skeleton" />
            ))
          : gifters.map((g, i) => {
              const cfg = RANK_CFG[i] || RANK_CFG[2];
              const displayName = g.username || g.name || "Anónimo";
              const initial = (displayName || "?")[0].toUpperCase();
              return (
                <div
                  key={String(g.userId)}
                  className={`tg-row tg-row-${i + 1}`}
                  style={{
                    borderColor: cfg.border,
                    boxShadow: `0 0 12px ${cfg.glow}`,
                    background: cfg.rowBg,
                  }}
                >
                  <div
                    className="tg-avatar"
                    style={{
                      background: cfg.avatarBg,
                      boxShadow: cfg.avatarShadow,
                    }}
                  >
                    {initial}
                    {i === 0 && <span className="tg-crown">👑</span>}
                  </div>

                  <div className="tg-info">
                    <span className="tg-name">
                      @{displayName}
                      {g.isPremium && <span className="tg-premium-star">⭐</span>}
                    </span>
                    <span className="tg-coins" style={{ color: cfg.coinColor }}>
                      🪙 {g.totalCoins.toLocaleString()}
                    </span>
                  </div>

                  <span
                    className="tg-rank-badge"
                    style={{
                      color: cfg.coinColor,
                      borderColor: cfg.border,
                      background: `rgba(0,0,0,0.5)`,
                    }}
                  >
                    {cfg.label}
                  </span>
                </div>
              );
            })}
      </div>

      <style jsx>{`
        .top-gifters {
          background: linear-gradient(135deg, rgba(12,6,28,0.92) 0%, rgba(20,10,40,0.9) 100%);
          border: 1px solid rgba(255,215,0,0.25);
          border-radius: var(--radius-sm);
          padding: 0.8rem 0.9rem;
          margin-bottom: 0.5rem;
          box-shadow: 0 0 24px rgba(255,215,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04);
        }

        .tg-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.65rem;
        }

        .tg-header-icon { font-size: 1rem; animation: headerIconBob 2.5s ease-in-out infinite; }

        @keyframes headerIconBob {
          0%, 100% { transform: translateY(0) rotate(-5deg); }
          50%       { transform: translateY(-3px) rotate(5deg); }
        }

        .tg-header-title {
          flex: 1;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: linear-gradient(90deg, #ffd700, #ffb347);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .tg-header-live {
          font-size: 0.58rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: #fff;
          background: #ef4444;
          padding: 0.15rem 0.45rem;
          border-radius: 100px;
          animation: pulseLive 1.6s ease-in-out infinite;
        }

        @keyframes pulseLive {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%       { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }

        .tg-list {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .tg-skeleton {
          height: 44px;
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
          animation: shimmer 1.4s infinite;
        }

        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }

        .tg-row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 0.45rem 0.6rem;
          transition: box-shadow 0.25s, transform 0.25s;
          animation: slideIn 0.35s ease both;
        }

        .tg-row-1 { animation-delay: 0s; }
        .tg-row-2 { animation-delay: 0.06s; }
        .tg-row-3 { animation-delay: 0.12s; }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .tg-row:hover {
          transform: translateX(3px);
        }

        .tg-avatar {
          position: relative;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.78rem;
          font-weight: 900;
          color: #fff;
          flex-shrink: 0;
        }

        .tg-crown {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 0.7rem;
          animation: crownFloat 2s ease-in-out infinite;
        }

        @keyframes crownFloat {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50%       { transform: translateX(-50%) translateY(-2px); }
        }

        .tg-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }

        .tg-name {
          font-size: 0.76rem;
          font-weight: 700;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 0.2rem;
        }

        .tg-premium-star { font-size: 0.6rem; }

        .tg-coins {
          font-size: 0.7rem;
          font-weight: 800;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }

        .tg-rank-badge {
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.05em;
          border: 1px solid;
          border-radius: 6px;
          padding: 0.18rem 0.42rem;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
