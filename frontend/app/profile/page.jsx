"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;

    if (session?.backendToken) {
      localStorage.setItem("token", session.backendToken);
    }

    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/api/user/me`, { headers }).then((res) => {
        if (!res.ok) {
          localStorage.removeItem("token");
          router.push("/login");
          return null;
        }
        return res.json();
      }),
      fetch(`${API_URL}/api/user/coins`, { headers }).then((res) =>
        res.ok ? res.json() : null
      ),
    ])
      .then(([userData, coinsData]) => {
        if (userData) setUser(userData);
        if (coinsData) setCoins(coinsData);
      })
      .catch(() => setError("No se pudo cargar el perfil"))
      .finally(() => setLoading(false));
  }, [session, status]);

  if (loading || status === "loading") {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Cargando perfil…</p>
        <style jsx>{`
          .loading-state {
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
        `}</style>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="error-state">
        <span style={{ fontSize: "3rem" }}>⚠️</span>
        <p>{error || "No se pudo cargar el perfil"}</p>
        <Link href="/login" className="btn btn-primary">Volver al inicio</Link>
        <style jsx>{`
          .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 0.75rem;
            text-align: center;
            color: var(--text-muted);
          }
        `}</style>
      </div>
    );
  }

  const displayName = user.username || user.name || "Usuario";
  const initial = displayName[0].toUpperCase();
  const avatarSrc = user.avatar || session?.user?.image || null;

  return (
    <div className="profile-page">
      {/* Header card */}
      <div className="profile-hero card">
        <div className="avatar-wrap">
          {avatarSrc ? (
            <Image
              src={avatarSrc}
              alt={displayName}
              width={80}
              height={80}
              className="avatar-img"
            />
          ) : (
            <div className="avatar-placeholder" style={{ width: 80, height: 80, fontSize: "1.75rem" }}>
              {initial}
            </div>
          )}
        </div>
        <div className="profile-names">
          <h1 className="profile-display">{displayName}</h1>
          {user.username && user.name && (
            <p className="profile-name">{user.name}</p>
          )}
          <p className="profile-email">{user.email}</p>
          <span className="role-badge">{user.role || "user"}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card card">
          <div className="stat-value">{coins?.coins ?? 0}</div>
          <div className="stat-label">💰 Monedas</div>
        </div>
        <div className="stat-card card">
          <div className="stat-value">{coins?.earningsCoins ?? 0}</div>
          <div className="stat-label">🎁 Ganancias</div>
        </div>
      </div>

      {/* Actions */}
      <div className="profile-actions">
        <Link href="/coins" className="btn btn-primary">💰 Recargar monedas</Link>
        <Link href="/dashboard" className="btn btn-secondary">🏠 Ir al dashboard</Link>
      </div>

      <style jsx>{`
        .profile-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 480px;
          margin: 0 auto;
        }

        .profile-hero {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
        }

        .avatar-wrap { flex-shrink: 0; }

        .avatar-img {
          border-radius: 50%;
          object-fit: cover;
        }

        .profile-names { flex: 1; min-width: 0; }

        .profile-display {
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 0.2rem;
        }

        .profile-name {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-bottom: 0.2rem;
        }

        .profile-email {
          color: var(--text-muted);
          font-size: 0.85rem;
          word-break: break-all;
        }

        .role-badge {
          display: inline-block;
          margin-top: 0.5rem;
          background: rgba(233,30,140,0.12);
          color: var(--accent);
          border-radius: 20px;
          padding: 0.2rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        .stats-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 1.25rem;
          text-align: center;
        }

        .stat-value {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text);
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .profile-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .profile-actions .btn { flex: 1; text-align: center; }
      `}</style>
    </div>
  );
}
