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
          <h1 className="live-title">🔴 Directos en vivo</h1>
          <p className="live-sub">
            {loading ? "Cargando…" : `${lives.length} stream${lives.length !== 1 ? "s" : ""} activo${lives.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href="/explore" className="btn btn-secondary">
          🔍 Explorar todo
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="live-loading">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      )}

      {!loading && lives.length === 0 && !error && (
        <div className="empty-state card">
          <span style={{ fontSize: "3rem" }}>📡</span>
          <h3 style={{ color: "var(--text)" }}>Sin directos ahora mismo</h3>
          <p>Vuelve más tarde o explora el contenido disponible.</p>
          <Link href="/explore" className="btn btn-primary">Explorar</Link>
        </div>
      )}

      {!loading && lives.length > 0 && (
        <div className="streams-grid">
          {lives.map((live) => (
            <Link key={live._id} href={`/live/${live._id}`} className="stream-card card">
              <div className="stream-thumb">
                <span className="badge badge-live">LIVE</span>
                {live.viewers && (
                  <span className="viewer-count">👁 {live.viewers}</span>
                )}
                <span className="thumb-icon">📺</span>
              </div>
              <div className="stream-body">
                <div className="stream-user-row">
                  <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: "0.85rem" }}>
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
        .live-page { display: flex; flex-direction: column; gap: 1.5rem; }

        .live-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .live-title { font-size: 1.75rem; font-weight: 800; color: var(--text); }
        .live-sub { color: var(--text-muted); margin-top: 0.2rem; }

        /* Grid */
        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 1rem;
        }

        .stream-card { padding: 0; overflow: hidden; cursor: pointer; }

        .stream-thumb {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .stream-thumb .badge { position: absolute; top: 0.5rem; left: 0.5rem; }

        .viewer-count {
          position: absolute;
          bottom: 0.5rem;
          right: 0.5rem;
          background: rgba(0,0,0,0.65);
          color: #fff;
          font-size: 0.75rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }

        .thumb-icon { font-size: 3rem; opacity: 0.35; }

        .stream-body { padding: 0.875rem; }

        .stream-user-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }

        .stream-username { font-size: 0.8rem; color: var(--text-muted); font-weight: 500; }

        .stream-title {
          font-weight: 600;
          color: var(--text);
          font-size: 0.95rem;
          line-height: 1.3;
        }

        .stream-desc {
          color: var(--text-muted);
          font-size: 0.8rem;
          margin-top: 0.3rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Skeleton loading */
        .live-loading {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 1rem;
        }

        .skeleton-card {
          height: 220px;
          border-radius: var(--radius);
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Error / empty */
        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 3rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
