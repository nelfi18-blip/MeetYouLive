"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function LivePage() {
  const [lives, setLives] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar directos");
        return res.json();
      })
      .then((data) => setLives(Array.isArray(data) ? data : []))
      .catch(() => setError("No se pudo cargar la lista de directos"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="live-page">
      <div className="live-header">
        <div>
          <h1 className="page-title">Directos en vivo</h1>
          <p className="page-subtitle">
            {loading
              ? "Cargando transmisiones…"
              : `${lives.length} stream${lives.length !== 1 ? "s" : ""} activo${lives.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href="/explore" className="btn btn-secondary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Explorar todo
        </Link>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {loading && (
        <div className="streams-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 230, borderRadius: "var(--radius)" }} />
          ))}
        </div>
      )}

      {!loading && lives.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon-wrap">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)" }}>
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </div>
          <h3>Sin directos ahora mismo</h3>
          <p>Vuelve más tarde o explora el contenido disponible.</p>
          <Link href="/explore" className="btn btn-primary">Explorar</Link>
        </div>
      )}

      {!loading && lives.length > 0 && (
        <div className="streams-grid">
          {lives.map((live) => (
            <Link key={live._id} href={`/live/${live._id}`} className="stream-card">
              <div className="stream-thumb">
                <span className="badge badge-live">
                  <span className="live-dot" />
                  LIVE
                </span>
                {live.viewers != null && (
                  <span className="viewer-count">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    {live.viewers}
                  </span>
                )}
                <div className="thumb-play">▶</div>
              </div>
              <div className="stream-body">
                <div className="stream-user-row">
                  <div className="stream-avatar">
                    {(live.user?.username || "?")[0].toUpperCase()}
                  </div>
                  <span className="stream-username">@{live.user?.username || "anónimo"}</span>
                </div>
                <div className="stream-title">{live.title}</div>
                {live.description && (
                  <div className="stream-desc">{live.description}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <style jsx>{`
        .live-page { display: flex; flex-direction: column; gap: 1.75rem; }

        .live-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        /* Grid */
        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 1.25rem;
        }

        .stream-card {
          overflow: hidden;
          cursor: pointer;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--grad-card-2);
          transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition);
          display: block;
        }

        .stream-card:hover {
          border-color: rgba(139,92,246,0.4);
          box-shadow: var(--shadow), 0 0 28px rgba(139,92,246,0.2);
          transform: translateY(-4px);
        }

        .stream-thumb {
          background: linear-gradient(135deg, rgba(22,12,45,0.9), rgba(35,16,70,0.95), rgba(15,8,32,1));
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .stream-thumb::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, rgba(139,92,246,0.08), transparent 65%);
        }

        .stream-thumb .badge-live {
          position: absolute;
          top: 0.65rem;
          left: 0.65rem;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 0.25rem 0.65rem;
        }

        .live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #fff;
          animation: dot-blink 1.2s ease-in-out infinite;
        }

        @keyframes dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .viewer-count {
          position: absolute;
          bottom: 0.65rem;
          right: 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(6,4,17,0.8);
          color: var(--text);
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.22rem 0.6rem;
          border-radius: var(--radius-pill);
          z-index: 2;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .thumb-play {
          font-size: 2.5rem;
          opacity: 0.12;
          position: relative;
          z-index: 1;
          color: var(--text);
        }

        .stream-body { padding: 1rem 1.1rem; }

        .stream-user-row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin-bottom: 0.5rem;
        }

        .stream-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.75rem;
          flex-shrink: 0;
        }

        .stream-username { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }

        .stream-title {
          font-weight: 700;
          color: var(--text);
          font-size: 0.95rem;
          line-height: 1.35;
        }

        .stream-desc {
          color: var(--text-muted);
          font-size: 0.8rem;
          margin-top: 0.3rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.4;
        }

        /* Error / empty */
        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 4rem 2rem;
          text-align: center;
          border: 1px dashed rgba(139,92,246,0.2);
          border-radius: var(--radius);
          background: rgba(15,8,32,0.4);
        }

        .empty-icon-wrap {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-state h3 { color: var(--text); font-size: 1.15rem; margin: 0; }
        .empty-state p  { color: var(--text-muted); font-size: 0.875rem; margin: 0; }
      `}</style>
    </div>
  );
}
