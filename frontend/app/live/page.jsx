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
      .then((data) => {
        if (!Array.isArray(data)) { setLives([]); return; }
        const sorted = [...data].sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0));
        setLives(sorted);
      })
      .catch(() => setError("No se pudo cargar la lista de directos"))
      .finally(() => setLoading(false));
  }, []);

  const featured = lives[0] ?? null;
  const popular = lives.slice(1);

  return (
    <div className="live-page">
      {/* Header */}
      <div className="live-header">
        <div>
          <h1 className="live-title">🔴 Directos en vivo</h1>
          <p className="live-sub">
            {loading
              ? "Cargando…"
              : `${lives.length} stream${lives.length !== 1 ? "s" : ""} activo${lives.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href="/explore" className="btn btn-secondary">
          🔍 Explorar todo
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Skeleton loading */}
      {loading && (
        <div className="live-loading">
          <div className="skeleton-featured" />
          <div className="skeleton-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && lives.length === 0 && !error && (
        <div className="empty-state card">
          <span style={{ fontSize: "3rem" }}>📡</span>
          <h3 style={{ color: "var(--text)" }}>Sin directos ahora mismo</h3>
          <p>Vuelve más tarde o explora el contenido disponible.</p>
          <Link href="/explore" className="btn btn-primary">Explorar</Link>
        </div>
      )}

      {/* Featured room */}
      {!loading && featured && (
        <section className="section">
          <h2 className="section-title">⭐ Sala destacada</h2>
          <Link href={`/live/${featured._id}`} className="featured-card card">
            <div className="featured-thumb">
              <span className="badge badge-live">LIVE</span>
              {featured.viewers != null && (
                <span className="featured-viewers">👁 {featured.viewers} viendo</span>
              )}
              <span className="featured-icon" aria-hidden="true">📺</span>
              <div className="featured-gradient" />
              <div className="featured-overlay">
                <div className="featured-user-row">
                  <div className="avatar-placeholder" style={{ width: 40, height: 40, fontSize: "1rem" }}>
                    {(featured.user?.username || "?")[0].toUpperCase()}
                  </div>
                  <span className="featured-username">@{featured.user?.username || "anónimo"}</span>
                </div>
                <div className="featured-title">{featured.title}</div>
                {featured.description && (
                  <div className="featured-desc">{featured.description}</div>
                )}
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Popular rooms */}
      {!loading && popular.length > 0 && (
        <section className="section">
          <h2 className="section-title">🔥 Salas populares</h2>
          <div className="streams-grid">
            {popular.map((live) => (
              <Link key={live._id} href={`/live/${live._id}`} className="stream-card card">
                <div className="stream-thumb">
                  <span className="badge badge-live">LIVE</span>
                  {live.viewers != null && (
                    <span className="viewer-count">👁 {live.viewers}</span>
                  )}
                  <span className="thumb-icon" aria-hidden="true">📺</span>
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
        </section>
      )}

      <style jsx>{`
        .live-page { display: flex; flex-direction: column; gap: 2rem; }

        .live-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .live-title { font-size: 1.75rem; font-weight: 800; color: var(--text); }
        .live-sub { color: var(--text-muted); margin-top: 0.2rem; }

        /* Section */
        .section { display: flex; flex-direction: column; gap: 1rem; }

        .section-title {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text);
        }

        /* Featured card */
        .featured-card {
          padding: 0;
          overflow: hidden;
          cursor: pointer;
          display: block;
          transition: transform var(--transition), box-shadow var(--transition);
        }

        .featured-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.35);
        }

        .featured-thumb {
          background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 50%, #16213e 100%);
          height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .featured-thumb .badge { position: absolute; top: 0.75rem; left: 0.75rem; font-size: 0.85rem; }

        .featured-viewers {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          background: rgba(0,0,0,0.7);
          color: #fff;
          font-size: 0.8rem;
          padding: 0.25rem 0.65rem;
          border-radius: 20px;
          font-weight: 600;
          backdrop-filter: blur(4px);
        }

        .featured-icon { font-size: 5rem; opacity: 0.2; }

        .featured-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%);
        }

        .featured-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 1.25rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .featured-user-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .featured-username {
          color: rgba(255,255,255,0.85);
          font-size: 0.85rem;
          font-weight: 500;
        }

        .featured-title {
          font-size: 1.4rem;
          font-weight: 800;
          color: #fff;
          line-height: 1.25;
          text-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }

        .featured-desc {
          color: rgba(255,255,255,0.65);
          font-size: 0.85rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Popular grid */
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
        .live-loading { display: flex; flex-direction: column; gap: 2rem; }

        .skeleton-featured {
          height: 300px;
          border-radius: var(--radius);
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        .skeleton-grid {
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

        @media (max-width: 640px) {
          .featured-thumb { height: 200px; }
          .featured-title { font-size: 1.1rem; }
        }
      `}</style>
    </div>
  );
}
