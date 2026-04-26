"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "week",  label: "Semana" },
  { key: "alltime", label: "Todo el tiempo" },
];

const PODIUM_STYLES = [
  {
    border: "rgba(255,215,0,0.6)",
    glow: "rgba(255,215,0,0.25)",
    avatarBg: "linear-gradient(135deg,#ffd700 0%,#ff8c00 100%)",
    avatarShadow: "0 0 16px rgba(255,215,0,0.55)",
    coinColor: "#ffd700",
    medal: "🥇",
    rowBg: "rgba(255,215,0,0.06)",
  },
  {
    border: "rgba(192,192,192,0.5)",
    glow: "rgba(192,192,192,0.2)",
    avatarBg: "linear-gradient(135deg,#c0c0c0 0%,#9ca3af 100%)",
    avatarShadow: "0 0 12px rgba(192,192,192,0.4)",
    coinColor: "#c0c0c0",
    medal: "🥈",
    rowBg: "rgba(192,192,192,0.04)",
  },
  {
    border: "rgba(205,127,50,0.5)",
    glow: "rgba(205,127,50,0.2)",
    avatarBg: "linear-gradient(135deg,#cd7f32 0%,#92400e 100%)",
    avatarShadow: "0 0 12px rgba(205,127,50,0.4)",
    coinColor: "#cd7f32",
    medal: "🥉",
    rowBg: "rgba(205,127,50,0.04)",
  },
];

function getPsychologyMessage(rank, total) {
  if (!rank) return null;
  if (rank === 1) return { icon: "👑", text: "¡Eres el #1! Domina el ranking", color: "#ffd700" };
  if (rank <= 3) return { icon: "🏆", text: `¡Posición #${rank}! Estás en el podio`, color: "#ffd700" };
  if (rank <= 10) return { icon: "🔥", text: `¡Top 10! Estás en posición #${rank}`, color: "#fb923c" };
  if (rank <= 20) return { icon: "⚡", text: `Posición #${rank} — Sube al Top 10`, color: "#22d3ee" };
  if (rank <= 50) return { icon: "🎯", text: `Estás en posición #${rank}. ¡Puedes llegar al Top 20!`, color: "#a78bfa" };
  return { icon: "🚀", text: `Posición #${rank} — Envía más regalos para subir`, color: "#94a3b8" };
}

export default function RankingPage() {
  const [period, setPeriod] = useState("week");
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState(null);
  const [myStats, setMyStats] = useState(null);

  // Fetch top 100 creators
  const fetchRanking = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/rankings/creators?period=${p}&type=gifted&limit=100`
      );
      const data = res.ok ? await res.json() : [];
      setCreators(Array.isArray(data) ? data : []);
    } catch {
      setCreators([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Try to get creator's own stats for psychology messages
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    fetch(`${API_URL}/api/rankings/my-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setMyStats(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRanking(period);
  }, [period, fetchRanking]);

  // Compute my rank from the creators list
  useEffect(() => {
    if (!myStats) return;
    // myStats.rankWeek only reflects week. For today/alltime we rely on position in the list.
    if (period === "week" && myStats.rankWeek) {
      setMyRank(myStats.rankWeek);
    } else {
      setMyRank(null);
    }
  }, [period, creators, myStats]);

  const psychMsg = getPsychologyMessage(myRank, creators.length);

  return (
    <div className="ranking-page">
      {/* Header */}
      <div className="rk-header">
        <div className="rk-header-inner">
          <h1 className="rk-title">🏆 Ranking Global</h1>
          <p className="rk-subtitle">Los creadores más gifteados de la plataforma</p>
        </div>
      </div>

      {/* Period tabs */}
      <div className="rk-tabs">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`rk-tab${period === p.key ? " rk-tab-active" : ""}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* My position banner (for logged-in creators) */}
      {psychMsg && (
        <div className="rk-my-position" style={{ borderColor: `${psychMsg.color}40` }}>
          <span className="rk-my-icon">{psychMsg.icon}</span>
          <span className="rk-my-text" style={{ color: psychMsg.color }}>{psychMsg.text}</span>
          {myRank && myRank > 10 && (
            <span className="rk-my-hint">Envía más regalos para subir</span>
          )}
        </div>
      )}

      {/* Ranking list */}
      <div className="rk-list">
        {loading ? (
          [...Array(10)].map((_, i) => (
            <div key={`sk-${i}`} className="rk-skeleton" />
          ))
        ) : creators.length === 0 ? (
          <div className="rk-empty">
            <span className="rk-empty-icon">🏅</span>
            <span className="rk-empty-text">Nadie en el ranking todavía. ¡Sé el primero!</span>
          </div>
        ) : (
          creators.map((c) => {
            const idx = c.rank - 1;
            const isPodium = idx < 3;
            const style = isPodium ? PODIUM_STYLES[idx] : null;
            const displayName = c.username || c.name || "Creador";
            const initial = displayName[0].toUpperCase();
            const isMyRankRow = myRank && c.rank === myRank;

            return (
              <div
                key={String(c.userId)}
                className={`rk-row${isPodium ? " rk-podium" : ""}${isMyRankRow ? " rk-row-mine" : ""}`}
                style={isPodium ? {
                  borderColor: style.border,
                  boxShadow: `0 0 14px ${style.glow}`,
                  background: style.rowBg,
                } : {}}
              >
                {/* Rank number */}
                <div
                  className={`rk-rank${isPodium ? " rk-rank-podium" : ""}`}
                  style={isPodium ? { color: style.coinColor } : {}}
                >
                  {isPodium ? style.medal : `#${c.rank}`}
                </div>

                {/* Avatar */}
                <div
                  className="rk-avatar"
                  style={isPodium ? {
                    background: style.avatarBg,
                    boxShadow: style.avatarShadow,
                  } : {}}
                >
                  {initial}
                </div>

                {/* Info */}
                <div className="rk-info">
                  <span className="rk-name">
                    @{displayName}
                    {c.isVerifiedCreator && <span className="rk-verified">✓</span>}
                    {c.isPremium && <span className="rk-premium">⭐</span>}
                    {isMyRankRow && <span className="rk-you-badge">TÚ</span>}
                    {c.rank === 1 && <span className="rk-top1-badge">👑 #1</span>}
                  </span>
                  {c.creatorLevel && (
                    <span className="rk-level">
                      {c.creatorLevel.badge} {c.creatorLevel.label}
                    </span>
                  )}
                </div>

                {/* Score */}
                <div
                  className="rk-score"
                  style={isPodium ? { color: style.coinColor } : {}}
                >
                  🪙 {(c.totalCoins || 0).toLocaleString()}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CTA for non-creators */}
      {!myStats && (
        <div className="rk-cta-card">
          <span className="rk-cta-icon">🚀</span>
          <div className="rk-cta-text">
            <strong>¿Quieres aparecer en el ranking?</strong>
            <span>Activa tu perfil de creador y empieza a recibir regalos de tus fans</span>
          </div>
          <Link href="/creator-request" className="rk-cta-btn">Empezar</Link>
        </div>
      )}

      <style jsx>{`
        .ranking-page {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 640px;
          margin: 0 auto;
          padding-bottom: 2rem;
        }

        .rk-header {
          background: linear-gradient(135deg, rgba(30,12,60,0.9) 0%, rgba(20,12,46,0.95) 100%);
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: var(--radius);
          padding: 1.5rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .rk-header::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 0%, rgba(224,64,251,0.15) 0%, transparent 70%);
          pointer-events: none;
        }

        .rk-header-inner { position: relative; z-index: 1; }

        .rk-title {
          margin: 0 0 0.35rem;
          font-size: 1.6rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          background: linear-gradient(90deg, #ffd700, #ff8c00);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .rk-subtitle {
          margin: 0;
          font-size: 0.82rem;
          color: var(--text-muted);
        }

        .rk-tabs {
          display: flex;
          gap: 0.5rem;
          background: rgba(15,8,32,0.6);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 0.35rem;
        }

        .rk-tab {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .rk-tab:hover { color: var(--text); }

        .rk-tab-active {
          background: rgba(224,64,251,0.2);
          color: #e040fb;
          box-shadow: 0 0 10px rgba(224,64,251,0.2);
        }

        .rk-my-position {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          background: rgba(15,8,32,0.7);
          border: 1px solid;
          border-radius: var(--radius-sm);
          animation: fadeSlideIn 0.4s ease both;
        }

        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .rk-my-icon { font-size: 1.2rem; flex-shrink: 0; }

        .rk-my-text {
          flex: 1;
          font-size: 0.85rem;
          font-weight: 700;
        }

        .rk-my-hint {
          font-size: 0.72rem;
          color: var(--text-muted);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .rk-list {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .rk-skeleton {
          height: 60px;
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          animation: shimmer 1.4s infinite;
        }

        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }

        .rk-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 3rem 1rem;
          opacity: 0.6;
        }

        .rk-empty-icon { font-size: 2.5rem; }

        .rk-empty-text {
          font-size: 0.88rem;
          color: var(--text-muted);
          text-align: center;
        }

        .rk-row {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          padding: 0.6rem 0.85rem;
          background: rgba(20,12,46,0.6);
          border: 1px solid rgba(148,163,184,0.1);
          border-radius: 12px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: slideUp 0.3s ease both;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .rk-row:hover { transform: translateX(3px); }

        .rk-podium {
          border-width: 1px;
          border-style: solid;
        }

        .rk-row-mine {
          border-color: rgba(224,64,251,0.45) !important;
          box-shadow: 0 0 14px rgba(224,64,251,0.2) !important;
          background: rgba(224,64,251,0.07) !important;
        }

        .rk-rank {
          min-width: 36px;
          text-align: center;
          font-size: 0.78rem;
          font-weight: 800;
          color: var(--text-muted);
          letter-spacing: 0.02em;
          flex-shrink: 0;
        }

        .rk-rank-podium { font-size: 1.1rem; }

        .rk-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #e040fb 0%, #7c3aed 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 900;
          color: #fff;
          flex-shrink: 0;
        }

        .rk-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.12rem;
          min-width: 0;
        }

        .rk-name {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 0.25rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rk-verified {
          font-size: 0.65rem;
          color: #22d3ee;
          background: rgba(34,211,238,0.15);
          border: 1px solid rgba(34,211,238,0.35);
          border-radius: 4px;
          padding: 0.05rem 0.3rem;
        }

        .rk-premium { font-size: 0.65rem; }

        .rk-you-badge {
          font-size: 0.58rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          color: #e040fb;
          background: rgba(224,64,251,0.15);
          border: 1px solid rgba(224,64,251,0.4);
          border-radius: 100px;
          padding: 0.1rem 0.4rem;
        }

        .rk-top1-badge {
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #ffd700;
          background: rgba(255,215,0,0.12);
          border: 1px solid rgba(255,215,0,0.35);
          border-radius: 100px;
          padding: 0.1rem 0.4rem;
        }

        .rk-level {
          font-size: 0.68rem;
          color: var(--text-muted);
        }

        .rk-score {
          font-size: 0.78rem;
          font-weight: 800;
          color: var(--text-muted);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .rk-cta-card {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 1rem 1.1rem;
          background: linear-gradient(135deg, rgba(30,12,60,0.85) 0%, rgba(20,12,46,0.9) 100%);
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: var(--radius-sm);
          margin-top: 0.5rem;
        }

        .rk-cta-icon { font-size: 1.5rem; flex-shrink: 0; }

        .rk-cta-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .rk-cta-text strong {
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--text);
        }

        .rk-cta-text span {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .rk-cta-btn {
          padding: 0.5rem 1.1rem;
          background: linear-gradient(135deg, #e040fb, #7c3aed);
          color: #fff;
          font-size: 0.8rem;
          font-weight: 700;
          border-radius: var(--radius-pill);
          text-decoration: none;
          flex-shrink: 0;
          transition: opacity 0.2s;
        }

        .rk-cta-btn:hover { opacity: 0.9; }
      `}</style>
    </div>
  );
}
