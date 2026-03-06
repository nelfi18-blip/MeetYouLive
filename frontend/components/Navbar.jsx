"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import BottomNav from "./BottomNav";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const NAV_LINKS = [
  { href: "/dashboard", label: "Inicio", icon: "🏠" },
  { href: "/explore", label: "Explorar", icon: "🔍" },
  { href: "/live", label: "Directos", icon: "🎥" },
  { href: "/chats", label: "Chats", icon: "💬" },
  { href: "/profile", label: "Perfil", icon: "👤" },
];

function pathnameToActive(pathname) {
  if (pathname?.startsWith("/explore")) return "explore";
  if (pathname?.startsWith("/live")) return "live";
  if (pathname?.startsWith("/vr")) return "vr";
  if (pathname?.startsWith("/profile")) return "profile";
  return "dashboard";
}

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
      <BottomNav active={pathnameToActive(pathname)} />

      <style jsx>{`
        .navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(13, 13, 13, 0.9);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          height: 60px;
          gap: 1rem;
        }

        .navbar-brand { flex-shrink: 0; }

        .navbar-logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text) !important;
          letter-spacing: -0.03em;
        }

        .navbar-logo:hover { color: var(--accent) !important; }

        .navbar-logo-icon {
          width: 30px;
          height: 30px;
          background: var(--accent);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.9rem;
          color: #fff;
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
          padding: 0.45rem 0.9rem;
          border-radius: 8px;
          color: var(--text-muted) !important;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all var(--transition);
        }

        .navbar-link:hover { color: var(--text) !important; background: var(--card); }
        .navbar-link.active { color: var(--accent) !important; background: var(--accent-dim); }
        .navbar-link-icon { font-size: 1rem; }

        .navbar-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          position: relative;
          flex-shrink: 0;
        }

        .coins-badge {
          background: var(--accent-dim);
          color: var(--accent) !important;
          border: 1px solid var(--accent);
          border-radius: 20px;
          padding: 0.3rem 0.75rem;
          font-size: 0.8rem;
          font-weight: 700;
          transition: all var(--transition);
        }
        .coins-badge:hover { background: var(--accent); color: #fff !important; }

        .navbar-user {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.3rem 0.5rem;
          border-radius: 8px;
          transition: background var(--transition);
        }
        .navbar-user:hover { background: var(--card); }

        .navbar-username {
          font-size: 0.875rem;
          font-weight: 500;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .navbar-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 0.5rem;
          min-width: 180px;
          box-shadow: var(--shadow);
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 0.75rem;
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          color: var(--text-muted) !important;
          font-weight: 500;
          transition: all var(--transition);
          background: none;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
        }

        .dropdown-item:hover { background: var(--card-hover); color: var(--text) !important; }

        .dropdown-divider {
          border: none;
          border-top: 1px solid var(--border);
          margin: 0.25rem 0;
        }

        .dropdown-logout { color: var(--error) !important; }
        .dropdown-logout:hover { background: rgba(244, 67, 54, 0.1) !important; color: var(--error) !important; }


        @media (max-width: 768px) {
          .navbar-links { display: none; }
          .navbar-username { display: none; }
          .main-content { padding-bottom: 72px !important; }
        }
      `}</style>
    </>
  );
}
