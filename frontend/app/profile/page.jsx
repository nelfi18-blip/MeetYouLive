"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProfilePage() {
  const { data: session } = useSession();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar perfil");
        return r.json();
      })
      .then((d) => setUser(d))
      .catch(() => setError("No se pudo cargar el perfil"))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    signOut({ callbackUrl: "/login" });
  };

  const displayName = user?.username || user?.name || session?.user?.name || "Usuario";
  const initial = displayName[0].toUpperCase();

  return (
    <div className="profile-page">
      {loading && (
        <div className="skeleton-wrap">
          <div className="skeleton-avatar" />
          <div className="skeleton-line" style={{ width: "160px" }} />
          <div className="skeleton-line" style={{ width: "120px" }} />
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {!loading && user && (
        <>
          <div className="profile-card card">
            <div className="profile-avatar avatar-placeholder">{initial}</div>
            <div className="profile-info">
              <h1 className="profile-name">{displayName}</h1>
              {user.username && <p className="profile-handle">@{user.username}</p>}
              <p className="profile-email">{user.email}</p>
              <span className={`profile-role badge ${user.role === "creator" ? "badge-accent" : "badge-muted"}`}>
                {user.role === "creator" ? "🎥 Creador" : user.role === "admin" ? "🛡 Admin" : "👤 Usuario"}
              </span>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card card">
              <span className="stat-icon">💰</span>
              <div className="stat-value">{user.coins ?? 0}</div>
              <div className="stat-label">Monedas</div>
            </div>
            {user.role === "creator" && (
              <div className="stat-card card">
                <span className="stat-icon">🏆</span>
                <div className="stat-value">{user.earningsCoins ?? 0}</div>
                <div className="stat-label">Ganancias</div>
              </div>
            )}
            <div className="stat-card card">
              <span className="stat-icon">📅</span>
              <div className="stat-value">
                {new Date(user.createdAt).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}
              </div>
              <div className="stat-label">Miembro desde</div>
            </div>
          </div>

          <div className="actions card">
            <h2 className="actions-title">Acciones rápidas</h2>
            <div className="actions-list">
              <Link href="/coins" className="action-item">
                <span>💰</span>
                <span>Comprar monedas</span>
              </Link>
              <Link href="/explore" className="action-item">
                <span>🔍</span>
                <span>Explorar directos</span>
              </Link>
              <Link href="/chats" className="action-item">
                <span>💬</span>
                <span>Mis chats</span>
              </Link>
              <button className="action-item action-logout" onClick={handleLogout}>
                <span>🚪</span>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .profile-page { display: flex; flex-direction: column; gap: 1.5rem; max-width: 560px; margin: 0 auto; }

        /* Card */
        .profile-card {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 2rem;
          flex-wrap: wrap;
        }

        .profile-avatar {
          width: 72px;
          height: 72px;
          font-size: 1.75rem;
          flex-shrink: 0;
        }

        .profile-info { display: flex; flex-direction: column; gap: 0.3rem; }

        .profile-name { font-size: 1.4rem; font-weight: 800; color: var(--text); }
        .profile-handle { color: var(--text-muted); font-size: 0.9rem; }
        .profile-email { color: var(--text-muted); font-size: 0.85rem; }

        .badge {
          display: inline-block;
          padding: 0.2rem 0.6rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          width: fit-content;
        }
        .badge-accent { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); }
        .badge-muted { background: var(--card-hover); color: var(--text-muted); border: 1px solid var(--border); }

        /* Stats */
        .stats-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 1rem; }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          padding: 1.25rem;
          text-align: center;
        }

        .stat-icon { font-size: 1.5rem; }
        .stat-value { font-size: 1.25rem; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }

        /* Actions */
        .actions { padding: 1.5rem; }
        .actions-title { font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 1rem; }
        .actions-list { display: flex; flex-direction: column; gap: 0.25rem; }

        .action-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 0.875rem;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 500;
          transition: all var(--transition);
          background: none;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
        }

        .action-item:hover { background: var(--card-hover); color: var(--text); }
        .action-logout { color: var(--error) !important; }
        .action-logout:hover { background: rgba(244,67,54,0.1) !important; color: var(--error) !important; }

        /* Skeleton */
        .skeleton-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem; }
        .skeleton-avatar {
          width: 72px; height: 72px; border-radius: 50%;
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        .skeleton-line {
          height: 16px; border-radius: 8px;
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Error */
        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

