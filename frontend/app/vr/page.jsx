"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const VR_FEATURES = [
  { icon: "🥽", title: "Modo inmersivo", desc: "Visualiza streams en 360° con tu visor VR" },
  { icon: "🌐", title: "Entorno virtual", desc: "Únete a salas virtuales con otros espectadores" },
  { icon: "🎮", title: "Interacción en tiempo real", desc: "Reacciona y conecta dentro del stream VR" },
  { icon: "📡", title: "Baja latencia", desc: "Streaming optimizado para dispositivos VR" },
];

export default function VRPage() {
  const [lives, setLives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setLives(Array.isArray(data) ? data.slice(0, 6) : []))
      .catch(() => setError("No se pudo cargar los directos VR"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="vr-page">
      {/* Hero */}
      <div className="vr-hero">
        <div className="vr-hero-glow" />
        <div className="vr-hero-content">
          <span className="vr-badge">BETA</span>
          <h1 className="vr-title">🥽 Experiencia VR</h1>
          <p className="vr-subtitle">
            Sumérgete en streams en vivo con tecnología de realidad virtual.
            Una nueva forma de conectar con tus creadores favoritos.
          </p>
          <div className="vr-hero-actions">
            <Link href="/live" className="btn btn-primary btn-lg">
              🎥 Ver directos
            </Link>
            <Link href="/explore" className="btn btn-secondary btn-lg">
              🔍 Explorar
            </Link>
          </div>
        </div>
        <div className="vr-hero-visual">
          <div className="vr-orb">🥽</div>
        </div>
      </div>

      {/* Features */}
      <section className="section">
        <h2 className="section-title">¿Qué ofrece el modo VR?</h2>
        <div className="grid-4">
          {VR_FEATURES.map((f) => (
            <div key={f.title} className="feature-card card">
              <span className="feature-icon">{f.icon}</span>
              <div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Live streams */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">🔴 Directos disponibles en VR</h2>
          <Link href="/live" className="see-all">Ver todos →</Link>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading && (
          <div className="streams-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        )}

        {!loading && lives.length === 0 && !error && (
          <div className="empty-state card">
            <span style={{ fontSize: "3rem" }}>📡</span>
            <h3 style={{ color: "var(--text)" }}>Sin directos activos</h3>
            <p>No hay streams disponibles ahora mismo. ¡Vuelve pronto!</p>
            <Link href="/explore" className="btn btn-primary">Explorar creadores</Link>
          </div>
        )}

        {!loading && lives.length > 0 && (
          <div className="streams-grid">
            {lives.map((live) => (
              <Link key={live._id} href={`/live/${live._id}`} className="stream-card card">
                <div className="stream-thumb">
                  <span className="badge badge-live">LIVE</span>
                  <span className="vr-tag">VR</span>
                  {live.viewers && (
                    <span className="viewer-count">👁 {live.viewers}</span>
                  )}
                  <span className="thumb-icon">🥽</span>
                </div>
                <div className="stream-body">
                  <div className="stream-user-row">
                    <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: "0.85rem" }}>
                      {(live.user?.username || "?")[0].toUpperCase()}
                    </div>
                    <span className="stream-username">@{live.user?.username || "anónimo"}</span>
                  </div>
                  <div className="stream-title">{live.title}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Coming soon banner */}
      <div className="coming-soon card">
        <span style={{ fontSize: "2rem" }}>🚀</span>
        <div>
          <div className="coming-title">Más funciones VR próximamente</div>
          <div className="coming-desc">
            Estamos trabajando en salas virtuales, avatares 3D y experiencias inmersivas exclusivas.
          </div>
        </div>
      </div>

      <style jsx>{`
        .vr-page { display: flex; flex-direction: column; gap: 2rem; }

        /* Hero */
        .vr-hero {
          position: relative;
          background: linear-gradient(135deg, var(--surface) 0%, rgba(233,30,140,0.1) 50%, rgba(61,26,120,0.15) 100%);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 3rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          flex-wrap: wrap;
          overflow: hidden;
        }

        .vr-hero-glow {
          position: absolute;
          top: -100px;
          right: -100px;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(233,30,140,0.2) 0%, transparent 70%);
          pointer-events: none;
        }

        .vr-hero-content {
          position: relative;
          z-index: 1;
          max-width: 560px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .vr-badge {
          display: inline-block;
          background: var(--accent-dim);
          color: var(--accent);
          border: 1px solid var(--accent);
          border-radius: 20px;
          padding: 0.2rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          width: fit-content;
        }

        .vr-title {
          font-size: 2.5rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1.1;
        }

        .vr-subtitle {
          color: var(--text-muted);
          font-size: 1rem;
          line-height: 1.6;
        }

        .vr-hero-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }

        .vr-hero-visual {
          position: relative;
          z-index: 1;
          flex-shrink: 0;
        }

        .vr-orb {
          width: 140px;
          height: 140px;
          background: radial-gradient(circle, rgba(233,30,140,0.25) 0%, rgba(61,26,120,0.2) 100%);
          border: 2px solid rgba(233,30,140,0.3);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4rem;
          animation: float 4s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }

        /* Section */
        .section { display: flex; flex-direction: column; gap: 1rem; }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .section-title {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text);
        }

        .see-all {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--accent);
        }

        /* Feature cards */
        .feature-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .feature-icon { font-size: 1.75rem; flex-shrink: 0; }

        .feature-title {
          font-weight: 600;
          color: var(--text);
          font-size: 0.95rem;
          margin-bottom: 0.2rem;
        }

        .feature-desc { color: var(--text-muted); font-size: 0.8rem; line-height: 1.4; }

        /* Stream grid */
        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 1rem;
        }

        .stream-card { padding: 0; overflow: hidden; cursor: pointer; }

        .stream-thumb {
          background: linear-gradient(135deg, #1a0a2e 0%, #2a0a3e 100%);
          height: 140px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .stream-thumb .badge { position: absolute; top: 0.5rem; left: 0.5rem; }

        .vr-tag {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          background: rgba(61,26,120,0.85);
          color: #c084fc;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid rgba(192,132,252,0.4);
          letter-spacing: 0.05em;
        }

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

        .thumb-icon { font-size: 3rem; opacity: 0.4; }

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
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Skeleton */
        .skeleton-card {
          height: 210px;
          border-radius: var(--radius);
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Coming soon */
        .coming-soon {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          background: linear-gradient(135deg, var(--card) 0%, rgba(61,26,120,0.12) 100%);
          border-color: rgba(233,30,140,0.2);
        }

        .coming-title {
          font-weight: 700;
          color: var(--text);
          font-size: 1rem;
          margin-bottom: 0.25rem;
        }

        .coming-desc { color: var(--text-muted); font-size: 0.875rem; }

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

        @media (max-width: 768px) {
          .vr-hero { flex-direction: column; padding: 2rem 1.5rem; }
          .vr-hero-visual { align-self: center; }
          .vr-title { font-size: 1.9rem; }
        }
      `}</style>
    </div>
  );
}
