"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState(null);

  // Extract the backend token from the session to use as a stable dependency.
  // Using the full `session` object would trigger re-runs every time NextAuth
  // refreshes the session reference (e.g., on window focus), causing excessive
  // /api/user/me calls and spurious 401-triggered logouts.
  const backendToken = session?.backendToken ?? null;

  useEffect(() => {
    if (status === "loading") return;

    // For Google OAuth sessions, sync the backend token to localStorage.
    // Only overwrite (never delete) an existing token – the localStorage token
    // may belong to an active email/password session.
    if (backendToken) {
      localStorage.setItem("token", backendToken);
    }

    // Both email/password and Google users need a valid token in localStorage.
    const token = localStorage.getItem("token");
    if (!token) {
      if (status === "authenticated") {
        // NextAuth session is active but there is no backend token, which
        // would cause an infinite redirect loop between /dashboard and /login.
        // Sign out of NextAuth first so the login page doesn't bounce back.
        signOut({ callbackUrl: "/login" }).catch(() => {
          router.replace("/login");
        });
      } else {
        router.replace("/login");
      }
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) {
            localStorage.removeItem("token");
            router.replace("/login");
          }
          return null;
        }
        return r.json();
      })
      .then((d) => { if (d) setUser(d); })
      .catch(() => {});
  }, [status, backendToken]);

  if (status === "loading") {
    return (
      <div className="dashboard">
        <div className="dash-welcome card" style={{ opacity: 0.5 }}>
          <div className="skeleton-avatar" />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div className="skeleton-line" style={{ width: "180px" }} />
            <div className="skeleton-line" style={{ width: "240px" }} />
          </div>
        </div>
        <style jsx>{`
          .dashboard { display: flex; flex-direction: column; gap: 1.5rem; }
          .dash-welcome {
            display: flex; align-items: center; gap: 1.25rem;
            padding: 1.75rem; flex-wrap: wrap;
          }
          .skeleton-avatar,
          .skeleton-line {
            background: linear-gradient(90deg, rgba(26,11,46,0.8) 25%, rgba(42,18,82,0.8) 50%, rgba(26,11,46,0.8) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
          }
          .skeleton-avatar {
            width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0;
          }
          .skeleton-line {
            height: 16px; border-radius: 8px;
          }
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  const displayName = user?.username || user?.name || session?.user?.name || "Usuario";

  return (
    <div className="dashboard">
      <div className="dash-welcome card">
        <div className="welcome-avatar avatar-placeholder">
          {displayName[0].toUpperCase()}
        </div>
        <div>
          <h1 className="welcome-title">¡Hola, {displayName}! 👋</h1>
          <p className="welcome-sub">Bienvenido/a de nuevo a MeetYouLive</p>
        </div>
        {user && (
          <div className="welcome-coins">
            <span className="coins-icon">💰</span>
            <span className="coins-num">{user.coins ?? 0}</span>
            <span className="coins-label">monedas</span>
          </div>
        )}
      </div>

      <div className="dash-grid">
        <Link href="/explore" className="dash-card card">
          <span className="dash-icon">🔍</span>
          <div>
            <div className="dash-card-title">Explorar</div>
            <div className="dash-card-sub">Descubre streamers en vivo</div>
          </div>
        </Link>

        <Link href="/live" className="dash-card card">
          <span className="dash-icon">🎥</span>
          <div>
            <div className="dash-card-title">Directos</div>
            <div className="dash-card-sub">Ve transmisiones en tiempo real</div>
          </div>
        </Link>

        <Link href="/chats" className="dash-card card">
          <span className="dash-icon">💬</span>
          <div>
            <div className="dash-card-title">Chats</div>
            <div className="dash-card-sub">Tus conversaciones privadas</div>
          </div>
        </Link>

        <Link href="/coins" className="dash-card card">
          <span className="dash-icon">💰</span>
          <div>
            <div className="dash-card-title">Comprar monedas</div>
            <div className="dash-card-sub">Apoya a tus streamers favoritos</div>
          </div>
        </Link>

        <Link href="/profile" className="dash-card card">
          <span className="dash-icon">👤</span>
          <div>
            <div className="dash-card-title">Mi perfil</div>
            <div className="dash-card-sub">Gestiona tu cuenta</div>
          </div>
        </Link>

        {user?.role === "creator" && (
          <Link href="/live/start" className="dash-card card">
            <span className="dash-icon">🔴</span>
            <div>
              <div className="dash-card-title">Iniciar directo</div>
              <div className="dash-card-sub">Comienza a transmitir en vivo</div>
            </div>
          </Link>
        )}
      </div>

      <style jsx>{`
        .dashboard { display: flex; flex-direction: column; gap: 1.5rem; }

        .dash-welcome {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 1.75rem;
          flex-wrap: wrap;
          background: rgba(20,8,42,0.9);
          border: 1px solid var(--border-glow);
          border-radius: var(--radius);
          backdrop-filter: blur(16px);
          box-shadow: var(--shadow);
        }

        .welcome-avatar {
          width: 60px;
          height: 60px;
          font-size: 1.5rem;
          flex-shrink: 0;
          box-shadow: var(--glow-pink);
        }

        .welcome-title {
          font-size: 1.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #F8F4FF, #FF4FD8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .welcome-sub { color: var(--text-muted); margin-top: 0.2rem; font-size: 0.9rem; font-weight: 500; }

        .welcome-coins {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(255,154,31,0.12);
          border: 1px solid rgba(255,154,31,0.3);
          border-radius: 20px;
          padding: 0.45rem 1rem;
          flex-shrink: 0;
        }

        .coins-icon { font-size: 1rem; }
        .coins-num { font-size: 1.1rem; font-weight: 800; color: #FF9A1F; }
        .coins-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }

        .dash-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1rem;
        }

        .dash-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.35rem;
          cursor: pointer;
          transition: all var(--transition);
          background: var(--grad-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
        }

        .dash-card:hover {
          transform: translateY(-3px);
          border-color: rgba(255,15,138,0.35);
          box-shadow: 0 8px 28px rgba(0,0,0,0.5), var(--glow-pink);
        }

        .dash-icon { font-size: 1.9rem; flex-shrink: 0; }

        .dash-card-title { font-weight: 700; color: var(--text); font-size: 0.95rem; }
        .dash-card-sub { color: var(--text-muted); font-size: 0.8rem; margin-top: 0.2rem; }

        @media (max-width: 480px) {
          .welcome-coins { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}

