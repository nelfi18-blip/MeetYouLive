"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const TABS = [
  { key: "live", label: "🔴 En Vivo" },
  { key: "today", label: "⭐ Top Hoy" },
  { key: "week", label: "📈 Esta Semana" },
];

export default function FeaturedCreators() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("live");

  useEffect(() => {
    fetch(`${API_URL}/api/rankings/featured`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const items =
    activeTab === "live"
      ? data?.liveNow || []
      : activeTab === "today"
      ? data?.topToday || []
      : data?.topWeek || [];

  const isEmpty = !loading && items.length === 0;

  return (
    <div className="fc-section">
      <div className="fc-header">
        <div>
          <h2 className="fc-title">Creadores Destacados</h2>
          <p className="fc-sub">Descubre quién está triunfando ahora mismo</p>
        </div>
      </div>

      <div className="fc-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`fc-tab${activeTab === t.key ? " fc-tab-active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="fc-grid">
          {[...Array(6)].map((_, i) => (
            <div key={`fc-skeleton-${i}`} className="fc-skeleton" />
          ))}
        </div>
      )}

      {!loading && isEmpty && (
        <div className="fc-empty">
          <span className="fc-empty-icon">🌙</span>
          <p>
            {activeTab === "live"
              ? "No hay directos activos ahora mismo"
              : "Sin datos aún para este período"}
          </p>
        </div>
      )}

      {!loading && !isEmpty && (
        <div className="fc-grid">
          {items.map((item, i) => {
            if (activeTab === "live") {
              const live = item;
              const name = live.user?.username || live.user?.name || "Creador";
              return (
                <Link key={live._id} href={`/live/${live._id}`} className="fc-card fc-card-live">
                  {i < 3 && (
                    <span className="fc-rank-badge">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                    </span>
                  )}
                  <div className="fc-avatar">{name[0].toUpperCase()}</div>
                  <div className="fc-card-body">
                    <span className="fc-creator-name">@{name}</span>
                    {live.user?.isVerifiedCreator && (
                      <span className="fc-verified">✓</span>
                    )}
                    <p className="fc-card-title">{live.title}</p>
                    <div className="fc-meta">
                      <span className="fc-live-dot" />
                      <span className="fc-stat">👁 {live.viewerCount ?? 0}</span>
                      {live.isPrivate && (
                        <span className="fc-private">🔒 {live.entryCost} 🪙</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            }

            // top today / top week
            const creator = item;
            const name = creator.username || creator.name || "Creador";
            return (
              <div key={String(creator.userId)} className="fc-card fc-card-creator">
                {i < 3 && (
                  <span className="fc-rank-badge">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                  </span>
                )}
                <div className={`fc-avatar${creator.isPremium ? " fc-avatar-premium" : ""}`}>
                  {name[0].toUpperCase()}
                </div>
                <div className="fc-card-body">
                  <div className="fc-creator-row">
                    <span className="fc-creator-name">@{name}</span>
                    {creator.isPremium && <span className="fc-premium-badge">⭐</span>}
                    {creator.isVerifiedCreator && <span className="fc-verified">✓</span>}
                  </div>
                  <div className="fc-meta">
                    <span className="fc-coins">🪙 {creator.totalCoins} monedas</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .fc-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .fc-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
        }

        .fc-title {
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
        }

        .fc-sub {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin: 0.2rem 0 0;
        }

        .fc-tabs {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .fc-tab {
          padding: 0.35rem 0.9rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(139,92,246,0.25);
          background: rgba(139,92,246,0.06);
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s;
        }

        .fc-tab:hover {
          border-color: rgba(139,92,246,0.5);
          color: var(--text);
        }

        .fc-tab-active {
          border-color: rgba(224,64,251,0.6);
          background: rgba(224,64,251,0.12);
          color: #e040fb;
          box-shadow: 0 0 12px rgba(224,64,251,0.2);
        }

        .fc-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }

        @media (min-width: 480px) {
          .fc-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (min-width: 900px) {
          .fc-grid { grid-template-columns: repeat(3, 1fr); }
        }

        .fc-skeleton {
          height: 80px;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.04);
          animation: fcShimmer 1.4s infinite;
        }

        @keyframes fcShimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }

        .fc-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 2.5rem 1rem;
          color: var(--text-muted);
          font-size: 0.875rem;
          border: 1px dashed rgba(139,92,246,0.18);
          border-radius: var(--radius);
          background: rgba(15,8,32,0.35);
        }

        .fc-empty-icon { font-size: 2rem; }
        .fc-empty p { margin: 0; }

        .fc-card {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 0.9rem;
          border-radius: var(--radius-sm);
          background: rgba(15,8,32,0.6);
          border: 1px solid rgba(139,92,246,0.18);
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .fc-card-live {
          text-decoration: none;
          color: inherit;
        }

        .fc-card-live:hover,
        .fc-card-creator:hover {
          border-color: rgba(224,64,251,0.4);
          box-shadow: 0 0 18px rgba(224,64,251,0.12);
        }

        .fc-rank-badge {
          position: absolute;
          top: -8px;
          left: -6px;
          font-size: 1rem;
          line-height: 1;
        }

        .fc-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--grad-warm);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          font-weight: 900;
          color: #fff;
          flex-shrink: 0;
        }

        .fc-avatar-premium {
          background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
          box-shadow: 0 0 10px rgba(255,215,0,0.35);
        }

        .fc-card-body {
          flex: 1;
          min-width: 0;
        }

        .fc-creator-row {
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }

        .fc-creator-name {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fc-premium-badge { font-size: 0.72rem; }

        .fc-verified {
          font-size: 0.68rem;
          background: rgba(34,211,238,0.15);
          border: 1px solid rgba(34,211,238,0.4);
          color: #22d3ee;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          flex-shrink: 0;
        }

        .fc-card-title {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 0.15rem 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fc-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.25rem;
          flex-wrap: wrap;
        }

        .fc-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ef4444;
          animation: fcPulse 1.4s infinite;
          flex-shrink: 0;
        }

        @keyframes fcPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .fc-stat,
        .fc-private,
        .fc-coins {
          font-size: 0.73rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .fc-coins { color: #a78bfa; }
      `}</style>
    </div>
  );
}
