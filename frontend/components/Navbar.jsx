"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const NAV_LINKS = [
  { href: "/dashboard", label: "Inicio", icon: "🏠" },
  { href: "/explore", label: "Explorar", icon: "🔍" },
  { href: "/live", label: "Directos", icon: "🎥" },
  { href: "/chats", label: "Chats", icon: "💬" },
  { href: "/profile", label: "Perfil", icon: "👤" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [coins, setCoins] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/me`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setUsername(d.username || d.name || ""); })
      .catch(() => {});

    fetch(`${API_URL}/api/user/coins`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setCoins(d.coins); })
      .catch(() => {});
  }, [session]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    signOut({ callbackUrl: "/login" });
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">
          <Link href="/dashboard" className="navbar-logo">
            <span className="navbar-logo-icon">▶</span>
            <span>MeetYouLive</span>
          </Link>
        </div>

        <div className="navbar-links">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`navbar-link${pathname === link.href ? " active" : ""}`}
            >
              <span className="navbar-link-icon">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          ))}
        </div>

        <div className="navbar-right">
          {coins !== null && (
            <Link href="/coins" className="coins-badge">
              💰 {coins}
            </Link>
          )}
          <div className="navbar-user" onClick={() => setMenuOpen(!menuOpen)}>
            <div className="avatar-placeholder" style={{ width: 36, height: 36, fontSize: "0.95rem" }}>
              {(session?.user?.name || username || "U")[0].toUpperCase()}
            </div>
            <span className="navbar-username">{session?.user?.name || username || "Usuario"}</span>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>▾</span>
          </div>
          {menuOpen && (
            <div className="navbar-dropdown">
              <Link href="/profile" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                👤 Mi perfil
              </Link>
              <Link href="/coins" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                💰 Comprar monedas
              </Link>
              <hr className="dropdown-divider" />
              <button className="dropdown-item dropdown-logout" onClick={handleLogout}>
                🚪 Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Bottom nav for mobile */}
      <nav className="bottom-nav">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`bottom-nav-item${pathname === link.href ? " active" : ""}`}
          >
            <span>{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>

      <style jsx>{`
        .navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(11,6,19,0.88);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,15,138,0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          height: 64px;
          gap: 1rem;
        }

        .navbar-brand { flex-shrink: 0; }

        .navbar-logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--text) !important;
          letter-spacing: -0.03em;
        }

        .navbar-logo:hover { color: var(--accent-2) !important; }

        .navbar-logo-icon {
          width: 32px;
          height: 32px;
          background: var(--grad-primary);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          color: #fff;
          box-shadow: 0 0 14px rgba(255,15,138,0.5);
        }

        .navbar-links {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .navbar-link {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 1rem;
          border-radius: 10px;
          color: var(--text-muted) !important;
          font-size: 0.875rem;
          font-weight: 600;
          transition: all var(--transition);
        }

        .navbar-link:hover { color: var(--text) !important; background: rgba(255,79,216,0.08); }
        .navbar-link.active {
          color: var(--accent-2) !important;
          background: rgba(255,15,138,0.12);
          box-shadow: inset 0 0 0 1px rgba(255,15,138,0.2);
        }
        .navbar-link-icon { font-size: 1.05rem; }

        .navbar-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          position: relative;
          flex-shrink: 0;
        }

        .coins-badge {
          background: rgba(255,154,31,0.12);
          color: #FF9A1F !important;
          border: 1px solid rgba(255,154,31,0.35);
          border-radius: 20px;
          padding: 0.3rem 0.8rem;
          font-size: 0.8rem;
          font-weight: 700;
          transition: all var(--transition);
        }
        .coins-badge:hover {
          background: rgba(255,154,31,0.22);
          box-shadow: 0 0 12px rgba(255,154,31,0.4);
        }

        .navbar-user {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.3rem 0.5rem;
          border-radius: 10px;
          transition: background var(--transition);
        }
        .navbar-user:hover { background: rgba(255,79,216,0.08); }

        .navbar-username {
          font-size: 0.875rem;
          font-weight: 600;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text);
        }

        .navbar-dropdown {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          background: rgba(26,11,46,0.97);
          border: 1px solid var(--border-glow);
          border-radius: var(--radius);
          padding: 0.5rem;
          min-width: 190px;
          box-shadow: var(--shadow), var(--glow-violet);
          backdrop-filter: blur(20px);
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 0.875rem;
          border-radius: var(--radius-xs);
          font-size: 0.875rem;
          color: var(--text-muted) !important;
          font-weight: 600;
          transition: all var(--transition);
          background: none;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
        }

        .dropdown-item:hover {
          background: rgba(255,79,216,0.12);
          color: var(--text) !important;
        }

        .dropdown-divider {
          border: none;
          border-top: 1px solid var(--border);
          margin: 0.25rem 0;
        }

        .dropdown-logout { color: var(--error) !important; }
        .dropdown-logout:hover {
          background: rgba(244, 67, 54, 0.1) !important;
          color: var(--error) !important;
        }

        /* Bottom nav */
        .bottom-nav {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(11,6,19,0.94);
          backdrop-filter: blur(24px);
          border-top: 1px solid rgba(255,15,138,0.18);
          height: 64px;
          padding: 0 0.5rem;
          gap: 0;
        }

        .bottom-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          font-size: 0.62rem;
          font-weight: 600;
          gap: 0.2rem;
          color: var(--text-muted) !important;
          transition: all var(--transition);
          padding: 0.5rem;
          border-radius: var(--radius-xs);
          letter-spacing: 0.02em;
        }

        .bottom-nav-item span:first-child { font-size: 1.3rem; }

        .bottom-nav-item:hover { color: var(--accent-2) !important; }

        .bottom-nav-item.active {
          color: var(--accent-2) !important;
          text-shadow: 0 0 12px rgba(255,79,216,0.8);
        }

        .bottom-nav-item.active span:first-child {
          filter: drop-shadow(0 0 8px rgba(255,15,138,0.9));
        }

        @media (max-width: 768px) {
          .navbar-links { display: none; }
          .navbar-username { display: none; }
          .bottom-nav { display: flex; }
          .main-content { padding-bottom: 76px !important; }
        }
      `}</style>
    </>
  );
}
