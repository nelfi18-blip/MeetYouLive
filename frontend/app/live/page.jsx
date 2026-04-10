"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LiveCard from "@/components/LiveCard";
import FeaturedCreators from "@/components/FeaturedCreators";

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

  const trendingLives = lives.slice(0, 3);
  const restLives = lives.slice(3);

  return (
    <div className="live-page">
      {/* ── Hero banner ── */}
      <div className="live-hero">
        <div className="live-hero-glow" />
        <div className="live-hero-content">
          <div className="live-hero-badge">
            <span className="live-hero-dot" />
            EN DIRECTO AHORA
          </div>
          <h1 className="live-hero-title">
            🔴 Directos en vivo
          </h1>
          <p className="live-hero-sub">
            {loading
              ? "Cargando transmisiones…"
              : lives.length > 0
                ? `${lives.length} stream${lives.length !== 1 ? "s" : ""} activo${lives.length !== 1 ? "s" : ""} ahora mismo`
                : "No hay directos activos — vuelve pronto"}
          </p>
        </div>
        <Link href="/explore" className="live-hero-cta">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Explorar todo
        </Link>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {/* ── Trending — top 3 highlighted ── */}
      {(loading || trendingLives.length > 0) && (
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">🔥 Trending ahora</h2>
          </div>

          <div className="trending-grid">
            {loading
              ? [...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 240, borderRadius: "var(--radius)" }} />
                ))
              : trendingLives.map((live) => (
                  <LiveCard key={live._id} live={live} />
                ))}
          </div>
        </section>
      )}

      {/* ── All streams ── */}
      {!loading && restLives.length > 0 && (
        <section className="section-block">
          <div className="section-header">
            <h2 className="section-title">📡 Todos los directos</h2>
          </div>
          <div className="streams-grid">
            {restLives.map((live) => (
              <LiveCard key={live._id} live={live} />
            ))}
          </div>
        </section>
      )}

      {!loading && lives.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon-wrap">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)" }}>
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </div>
          <h3>No hay directos activos</h3>
          <p>Vuelve más tarde o explora el contenido disponible.</p>
          <Link href="/explore" className="btn btn-primary">Explorar</Link>
        </div>
      )}

      {/* ── Creator rankings / featured ── */}
      <FeaturedCreators />

      <style jsx>{`
        .live-page { display: flex; flex-direction: column; gap: 2rem; }

        /* Hero */
        .live-hero {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.75rem 1.5rem;
          border-radius: var(--radius);
          border: 1px solid rgba(224,64,251,0.22);
          background: linear-gradient(135deg, rgba(30,8,55,0.95) 0%, rgba(14,4,32,0.98) 100%);
          overflow: hidden;
          flex-wrap: wrap;
        }

        .live-hero-glow {
          position: absolute;
          top: -60px;
          left: -40px;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(224,64,251,0.18) 0%, transparent 65%);
          pointer-events: none;
        }

        .live-hero-content {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          position: relative;
          z-index: 1;
        }

        .live-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.65rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          color: #ef4444;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 999px;
          padding: 0.2rem 0.65rem;
          width: fit-content;
        }

        .live-hero-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ef4444;
          animation: heroDotPulse 1.4s infinite;
          flex-shrink: 0;
        }

        @keyframes heroDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.75); }
        }

        .live-hero-title {
          font-size: 1.6rem;
          font-weight: 900;
          background: linear-gradient(135deg, #fff 30%, #c084fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          line-height: 1.2;
        }

        .live-hero-sub {
          font-size: 0.875rem;
          color: var(--text-muted);
          margin: 0;
        }

        .live-hero-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          border: 1px solid rgba(139,92,246,0.4);
          background: rgba(139,92,246,0.1);
          color: #c4b5fd;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          position: relative;
          z-index: 1;
          flex-shrink: 0;
        }

        .live-hero-cta:hover {
          background: rgba(139,92,246,0.22);
          border-color: rgba(139,92,246,0.65);
          box-shadow: 0 0 16px rgba(139,92,246,0.25);
        }

        /* Section blocks */
        .section-block {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .section-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
        }

        /* Trending grid (3 cols desktop) */
        .trending-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
        }

        @media (min-width: 640px) {
          .trending-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 900px) {
          .trending-grid { grid-template-columns: repeat(3, 1fr); }
        }

        /* All streams grid */
        .streams-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
        }

        @media (min-width: 640px) {
          .streams-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1024px) {
          .streams-grid { grid-template-columns: repeat(3, 1fr); }
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
