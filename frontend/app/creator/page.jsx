"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function BroadcastIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/>
      <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/>
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/>
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 21 12 17 16 21"/>
      <path d="M19 3H5v10a7 7 0 0014 0V3z"/>
      <line x1="9" y1="3" x2="9" y2="13"/><line x1="15" y1="3" x2="15" y2="13"/>
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

export default function CreatorPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [lives, setLives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    Promise.all([
      fetch(`${API_URL}/api/user/me`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/lives?mine=true`, { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(async ([userRes, livesRes]) => {
        if (userRes.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        if (!userRes.ok) throw new Error("Error al cargar datos");

        const userData = await userRes.json();

        if (userData.role !== "creator") {
          router.replace("/profile");
          return;
        }

        setUser(userData);

        if (livesRes.ok) {
          const livesData = await livesRes.json();
          setLives(livesData.lives || livesData || []);
        }
      })
      .catch(() => setError("No se pudo cargar el estudio"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="creator-page">
        <div className="skeleton" style={{ height: 120, borderRadius: "var(--radius)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: "var(--radius)" }} />
          ))}
        </div>
        <style jsx>{`.creator-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 780px; margin: 0 auto; }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--error)" }}>{error}</div>
    );
  }

  const displayName = user?.username || user?.name || "Creador";
  const initial = displayName[0].toUpperCase();

  const recentLives = lives.slice(0, 5);

  return (
    <div className="creator-page">
      {/* Hero */}
      <div className="creator-hero">
        <div className="creator-hero-bg" />
        <div className="creator-hero-content">
          <div className="creator-avatar">{initial}</div>
          <div className="creator-hero-text">
            <div className="creator-badge">🎙 Estudio del Creador</div>
            <h1 className="creator-title">Hola, <span className="creator-name">{displayName}</span></h1>
            <p className="creator-sub">Gestiona tus directos y consulta tus ganancias</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="creator-stats">
        <div className="creator-stat">
          <div className="creator-stat-icon" style={{ color: "var(--accent-orange)" }}><CoinIcon /></div>
          <div className="creator-stat-value">{user?.coins ?? 0}</div>
          <div className="creator-stat-label">Monedas</div>
        </div>
        <div className="creator-stat">
          <div className="creator-stat-icon" style={{ color: "#fbbf24" }}><TrophyIcon /></div>
          <div className="creator-stat-value">{user?.earningsCoins ?? 0}</div>
          <div className="creator-stat-label">Ganancias</div>
        </div>
        <div className="creator-stat">
          <div className="creator-stat-icon" style={{ color: "var(--accent)" }}><VideoIcon /></div>
          <div className="creator-stat-value">{lives.length}</div>
          <div className="creator-stat-label">Directos totales</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="creator-tools">
        <h2 className="section-title">Herramientas</h2>
        <div className="tools-grid">
          <Link href="/live/start" className="tool-card tool-live">
            <div className="tool-card-icon"><BroadcastIcon /></div>
            <div className="tool-card-body">
              <div className="tool-card-title">Iniciar directo</div>
              <div className="tool-card-sub">Empieza a transmitir en vivo ahora</div>
            </div>
            <span className="tool-card-arrow"><ArrowIcon /></span>
          </Link>

          <Link href="/live" className="tool-card tool-archive">
            <div className="tool-card-icon"><ChartIcon /></div>
            <div className="tool-card-body">
              <div className="tool-card-title">Ver directos</div>
              <div className="tool-card-sub">Explora los streams activos</div>
            </div>
            <span className="tool-card-arrow"><ArrowIcon /></span>
          </Link>
        </div>
      </div>

      {/* Recent lives */}
      {recentLives.length > 0 && (
        <div className="creator-recent">
          <h2 className="section-title">Directos recientes</h2>
          <div className="recent-list">
            {recentLives.map((live) => (
              <div key={live._id} className="recent-item">
                <div className="recent-item-info">
                  <div className="recent-item-title">{live.title}</div>
                  <div className="recent-item-meta">
                    {live.category && <span className="recent-item-tag">{live.category}</span>}
                    <span className="recent-item-date">
                      {new Date(live.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>
                <div className="recent-item-status">
                  {live.isLive ? (
                    <span className="badge badge-live">EN VIVO</span>
                  ) : (
                    <span className="status-ended">Finalizado</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .creator-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 780px;
          margin: 0 auto;
        }

        /* Hero */
        .creator-hero {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(22,12,45,0.95) 0%, rgba(15,8,32,0.98) 100%);
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: var(--radius);
          padding: 2rem;
          box-shadow: var(--shadow);
        }

        .creator-hero-bg {
          position: absolute;
          top: -60px; right: -40px;
          width: 260px; height: 260px;
          background: radial-gradient(circle, rgba(224,64,251,0.15), transparent 70%);
          pointer-events: none;
          border-radius: 50%;
          filter: blur(40px);
        }

        .creator-hero-content {
          position: relative;
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
        }

        .creator-avatar {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 1.7rem;
          flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(224,64,251,0.25), 0 0 20px rgba(224,64,251,0.3);
        }

        .creator-hero-text { flex: 1; }

        .creator-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--accent-2);
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.75rem;
          margin-bottom: 0.5rem;
        }

        .creator-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .creator-name {
          background: var(--grad-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .creator-sub {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }

        /* Stats */
        .creator-stats {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 1rem;
        }

        .creator-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1.5rem 1rem;
          text-align: center;
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          transition: border-color var(--transition), transform var(--transition-slow);
        }

        .creator-stat:hover {
          border-color: rgba(139,92,246,0.3);
          transform: translateY(-2px);
        }

        .creator-stat-icon {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-sm);
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.12);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .creator-stat-icon :global(svg) { width: 20px; height: 20px; }

        .creator-stat-value { font-size: 1.4rem; font-weight: 800; color: var(--text); }
        .creator-stat-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }

        /* Tools */
        .creator-tools, .creator-recent {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
        }

        .section-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 1rem;
          letter-spacing: -0.01em;
        }

        .tools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 0.75rem;
        }

        .tool-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.1rem 1.25rem;
          border-radius: var(--radius-sm);
          transition: all var(--transition);
          text-decoration: none;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.02);
        }

        .tool-live { border-color: rgba(248,113,113,0.2); }
        .tool-archive { border-color: rgba(129,140,248,0.2); }

        .tool-card:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,0.04);
        }

        .tool-live:hover { border-color: rgba(248,113,113,0.4); box-shadow: 0 0 16px rgba(248,113,113,0.15); }
        .tool-archive:hover { border-color: rgba(129,140,248,0.4); box-shadow: 0 0 16px rgba(129,140,248,0.15); }

        .tool-card-icon {
          width: 42px;
          height: 42px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: rgba(248,113,113,0.08);
          color: #f87171;
        }

        .tool-archive .tool-card-icon {
          background: rgba(129,140,248,0.08);
          color: #818cf8;
        }

        .tool-card-icon :global(svg) { width: 20px; height: 20px; }

        .tool-card-body { flex: 1; }

        .tool-card-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
        }

        .tool-card-sub {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 0.15rem;
        }

        .tool-card-arrow {
          color: var(--text-dim);
          opacity: 0;
          transition: all var(--transition);
          display: flex;
        }

        .tool-card:hover .tool-card-arrow { opacity: 1; }

        /* Recent lives */
        .recent-list { display: flex; flex-direction: column; gap: 0.5rem; }

        .recent-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.75rem 0.875rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          transition: background var(--transition);
        }

        .recent-item:hover { background: rgba(255,255,255,0.04); }

        .recent-item-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }

        .recent-item-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.2rem;
        }

        .recent-item-tag {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--accent-3);
          background: rgba(129,140,248,0.1);
          border: 1px solid rgba(129,140,248,0.2);
          border-radius: var(--radius-pill);
          padding: 0.1rem 0.5rem;
        }

        .recent-item-date {
          font-size: 0.75rem;
          color: var(--text-dim);
        }

        .recent-item-status { flex-shrink: 0; }

        .status-ended {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-dim);
        }
      `}</style>
    </div>
  );
}
