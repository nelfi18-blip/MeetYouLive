"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const QUICK_ACTIONS = [
  { href: "/live", icon: "🎥", label: "Directos", desc: "Ver streams en vivo" },
  { href: "/explore", icon: "🔍", label: "Explorar", desc: "Descubrir creadores" },
  { href: "/coins", icon: "💰", label: "Monedas", desc: "Comprar y regalar" },
  { href: "/profile", icon: "👤", label: "Mi perfil", desc: "Editar tu cuenta" },
];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState(null);
  const [lives, setLives] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      window.location.href = "/login";
      return;
    }

    if (session?.backendToken) {
      localStorage.setItem("token", session.backendToken);
    }

    const token = localStorage.getItem("token");

    if (!token) {
      setError("No se pudo obtener el token de sesión. Por favor, inicia sesión de nuevo.");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/me`, { headers })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem("token");
          setError("Sesión expirada. Por favor, inicia sesión de nuevo.");
          return null;
        }
        return res.json();
      })
      .then((data) => { if (data) setUser(data); })
      .catch(() => setError("No se pudo cargar el perfil. Verifica tu conexión e intenta de nuevo."));

    fetch(`${API_URL}/api/user/coins`, { headers })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setCoins(data); })
      .catch(() => {});

    fetch(`${API_URL}/api/lives`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setLives(Array.isArray(data) ? data.slice(0, 4) : []))
      .catch(() => {});
  }, [session, status]);

  if (error) {
    return (
      <div className="error-state">
        <p>⚠️ {error}</p>
        <Link href="/login" className="btn btn-primary">Volver al inicio</Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Cargando…</p>
      </div>
    );
  }

  const displayName = user.username || user.name || "Usuario";
  const initial = displayName[0].toUpperCase();

  return (
    <div className="dashboard">
      {/* Welcome hero */}
      <div className="welcome-card">
        <div className="welcome-inner">
          <div className="avatar-placeholder" style={{ width: 64, height: 64, fontSize: "1.5rem" }}>
            {session?.user?.image
              ? <Image src={session.user.image} alt={displayName} width={64} height={64} style={{ borderRadius: "50%", objectFit: "cover" }} />
              : initial}
          </div>
          <div className="welcome-text">
            <h1 className="welcome-heading">¡Hola, {displayName}! 👋</h1>
            <p className="welcome-sub">{user.email}</p>
          </div>
        </div>
        <div className="welcome-stats">
          <div className="stat-pill">
            <span className="stat-icon">💰</span>
            <div>
              <div className="stat-value">{coins?.coins ?? "—"}</div>
              <div className="stat-label">Monedas</div>
            </div>
          </div>
          <div className="stat-pill">
            <span className="stat-icon">🎁</span>
            <div>
              <div className="stat-value">{coins?.earningsCoins ?? "—"}</div>
              <div className="stat-label">Ganancias</div>
            </div>
          </div>
          <Link href="/coins" className="btn btn-primary" style={{ alignSelf: "center" }}>
            + Recargar
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <section className="section">
        <h2 className="section-title">Accesos rápidos</h2>
        <div className="grid-4">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.href} href={a.href} className="action-card card">
              <span className="action-icon">{a.icon}</span>
              <div>
                <div className="action-label">{a.label}</div>
                <div className="action-desc">{a.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Live streams preview */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">🔴 En vivo ahora</h2>
          <Link href="/live" className="see-all">Ver todos →</Link>
        </div>
        {lives.length === 0 ? (
          <div className="empty-state card">
            <span style={{ fontSize: "2.5rem" }}>📡</span>
            <p>No hay directos activos en este momento.</p>
            <Link href="/explore" className="btn btn-secondary">Explorar creadores</Link>
          </div>
        ) : (
          <div className="grid-4">
            {lives.map((live) => (
              <Link key={live._id} href={`/live/${live._id}`} className="live-card card">
                <div className="live-thumb">
                  <span className="badge badge-live">LIVE</span>
                  <span className="live-icon">📺</span>
                </div>
                <div className="live-info">
                  <div className="live-title">{live.title}</div>
                  <div className="live-user">@{live.user?.username || "anónimo"}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .dashboard { display: flex; flex-direction: column; gap: 2rem; }

        /* Welcome card */
        .welcome-card {
          background: linear-gradient(135deg, var(--surface) 0%, rgba(233,30,140,0.08) 100%);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.75rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
          flex-wrap: wrap;
        }

        .welcome-inner { display: flex; align-items: center; gap: 1rem; }

        .welcome-heading {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.2rem;
        }

        .welcome-sub { color: var(--text-muted); font-size: 0.9rem; }

        .welcome-stats {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .stat-pill {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.75rem 1.1rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .stat-icon { font-size: 1.3rem; }

        .stat-value {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1;
        }

        .stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 0.2rem;
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

        /* Action cards */
        .action-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          cursor: pointer;
        }

        .action-icon { font-size: 1.75rem; flex-shrink: 0; }

        .action-label {
          font-weight: 600;
          color: var(--text);
          font-size: 0.95rem;
        }

        .action-desc {
          color: var(--text-muted);
          font-size: 0.8rem;
          margin-top: 0.1rem;
        }

        /* Live cards */
        .live-card { padding: 0; overflow: hidden; cursor: pointer; }

        .live-thumb {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          height: 110px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .live-thumb .badge { position: absolute; top: 0.5rem; left: 0.5rem; }

        .live-icon { font-size: 2.5rem; opacity: 0.5; }

        .live-info { padding: 0.75rem; }

        .live-title {
          font-weight: 600;
          color: var(--text);
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .live-user { color: var(--text-muted); font-size: 0.8rem; margin-top: 0.2rem; }

        /* States */
        .loading-state, .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 1rem;
          color: var(--text-muted);
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 2.5rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
