"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const NAV_LINKS = [
  { href: "/dashboard", label: "Inicio",    icon: HomeIcon    },
  { href: "/explore",   label: "Explorar",  icon: ExploreIcon },
  { href: "/live",      label: "Directos",  icon: LiveIcon    },
  { href: "/chats",     label: "Chats",     icon: ChatIcon    },
  { href: "/profile",   label: "Perfil",    icon: ProfileIcon },
];

/* ── SVG icon components ─────────────────────────── */
function HomeIcon()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>; }
function ExploreIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function LiveIcon()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>; }
function ChatIcon()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>; }
function ProfileIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function CoinIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/></svg>; }
function LogoutIcon()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function ChevronIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }

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
    clearToken();
    signOut({ callbackUrl: "/login" });
  };

  const displayName = session?.user?.name || username || "Usuario";
  const initial = displayName[0].toUpperCase();

  return (
    <>
      <nav className="navbar">
        {/* Brand */}
        <div className="navbar-brand">
          <Link href="/dashboard" className="navbar-logo">
            <Image
              src="/logo.svg"
              alt="MeetYouLive"
              width={38}
              height={38}
              className="navbar-logo-img"
              priority
            />
            <span className="navbar-logo-text">Meet You<span className="logo-accent">Live</span></span>
          </Link>
        </div>

        {/* Center nav links */}
        <div className="navbar-links">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`navbar-link${active ? " active" : ""}`}
              >
                <Icon />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right section */}
        <div className="navbar-right">
          {coins !== null && (
            <Link href="/coins" className="coins-badge">
              <CoinIcon />
              <span>{coins}</span>
            </Link>
          )}

          <div className="navbar-user" onClick={() => setMenuOpen(!menuOpen)}>
            <div className="nav-avatar">
              {initial}
            </div>
            <span className="navbar-username">{displayName}</span>
            <span className={`nav-chevron${menuOpen ? " open" : ""}`}>
              <ChevronIcon />
            </span>
          </div>

          {menuOpen && (
            <>
              <div className="navbar-overlay" onClick={() => setMenuOpen(false)} />
              <div className="navbar-dropdown">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">{initial}</div>
                  <div>
                    <div className="dropdown-name">{displayName}</div>
                    <div className="dropdown-role">Miembro</div>
                  </div>
                </div>
                <div className="dropdown-divider" />
                <Link href="/profile" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                  <ProfileIcon /> Mi perfil
                </Link>
                <Link href="/coins" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                  <CoinIcon /> Comprar monedas
                </Link>
                <div className="dropdown-divider" />
                <button className="dropdown-item dropdown-logout" onClick={handleLogout}>
                  <LogoutIcon /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Bottom nav for mobile */}
      <nav className="bottom-nav">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`bottom-nav-item${active ? " active" : ""}`}
            >
              <Icon />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <style jsx>{`
        .navbar {
          position: sticky;
          top: 0;
          z-index: 200;
          background: rgba(6,4,17,0.82);
          backdrop-filter: blur(24px) saturate(1.8);
          -webkit-backdrop-filter: blur(24px) saturate(1.8);
          border-bottom: 1px solid rgba(139,92,246,0.12);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          height: 64px;
          gap: 1rem;
        }

        /* ── Brand ─────────────── */
        .navbar-brand { flex-shrink: 0; }

        .navbar-logo {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          color: var(--text) !important;
          transition: opacity var(--transition);
        }
        .navbar-logo:hover { opacity: 0.85; }

        .navbar-logo-img {
          filter: drop-shadow(0 0 8px rgba(224,64,251,0.5));
          flex-shrink: 0;
        }

        .navbar-logo-text {
          font-size: 1.1rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--text);
        }

        .logo-accent {
          font-style: italic;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Nav Links ────────── */
        .navbar-links {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: var(--radius-pill);
          padding: 0.3rem;
        }

        .navbar-link {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.42rem 1rem;
          border-radius: var(--radius-pill);
          color: var(--text-muted) !important;
          font-size: 0.82rem;
          font-weight: 600;
          transition: all var(--transition);
        }

        .navbar-link:hover { color: var(--text) !important; background: rgba(255,255,255,0.06); }
        .navbar-link.active {
          color: #fff !important;
          background: var(--grad-primary);
          box-shadow: 0 2px 12px rgba(224,64,251,0.4);
        }

        /* ── Right section ─────── */
        .navbar-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          position: relative;
          flex-shrink: 0;
        }

        .coins-badge {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(251,146,60,0.1);
          color: var(--accent-orange) !important;
          border: 1px solid rgba(251,146,60,0.25);
          border-radius: var(--radius-pill);
          padding: 0.32rem 0.9rem;
          font-size: 0.82rem;
          font-weight: 700;
          transition: all var(--transition);
        }
        .coins-badge:hover {
          background: rgba(251,146,60,0.18);
          box-shadow: 0 0 14px rgba(251,146,60,0.3);
        }

        .navbar-user {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.3rem 0.65rem 0.3rem 0.3rem;
          border-radius: var(--radius-pill);
          border: 1px solid transparent;
          transition: all var(--transition);
        }
        .navbar-user:hover {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.08);
        }

        .nav-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.9rem;
          flex-shrink: 0;
          box-shadow: 0 0 0 2px rgba(224,64,251,0.35);
        }

        .navbar-username {
          font-size: 0.84rem;
          font-weight: 600;
          max-width: 110px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text);
        }

        .nav-chevron {
          color: var(--text-muted);
          transition: transform var(--transition);
          display: flex;
        }
        .nav-chevron.open { transform: rotate(180deg); }

        /* ── Dropdown ─────────── */
        .navbar-overlay {
          position: fixed;
          inset: 0;
          z-index: 150;
        }

        .navbar-dropdown {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          z-index: 200;
          background: rgba(12,6,28,0.97);
          border: 1px solid rgba(139,92,246,0.25);
          border-radius: var(--radius);
          padding: 0.6rem;
          min-width: 210px;
          box-shadow: var(--shadow), 0 0 40px rgba(139,92,246,0.15);
          backdrop-filter: blur(24px);
          animation: dropdown-in 0.18s ease;
        }

        @keyframes dropdown-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .dropdown-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 0.75rem 0.8rem;
        }

        .dropdown-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.95rem;
          flex-shrink: 0;
        }

        .dropdown-name {
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text);
        }
        .dropdown-role {
          font-size: 0.72rem;
          color: var(--text-muted);
          margin-top: 0.1rem;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 0.65rem;
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
          background: rgba(139,92,246,0.1);
          color: var(--text) !important;
        }

        .dropdown-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(139,92,246,0.2), transparent);
          margin: 0.4rem 0.5rem;
          border: none;
        }

        .dropdown-logout { color: var(--error) !important; }
        .dropdown-logout:hover {
          background: rgba(248,113,113,0.08) !important;
          color: var(--error) !important;
        }

        /* ── Bottom nav ────────── */
        .bottom-nav {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 200;
          background: rgba(6,4,17,0.94);
          backdrop-filter: blur(24px) saturate(1.8);
          -webkit-backdrop-filter: blur(24px) saturate(1.8);
          border-top: 1px solid rgba(139,92,246,0.12);
          height: 64px;
          padding: 0 0.25rem;
        }

        .bottom-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          font-size: 0.58rem;
          font-weight: 700;
          gap: 0.25rem;
          color: var(--text-muted) !important;
          transition: all var(--transition);
          padding: 0.5rem 0.25rem;
          border-radius: var(--radius-xs);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .bottom-nav-item:hover { color: var(--text) !important; }

        .bottom-nav-item.active {
          color: #fff !important;
        }
        .bottom-nav-item.active :global(svg) {
          filter: drop-shadow(0 0 6px rgba(224,64,251,0.9));
          stroke: var(--accent);
        }

        @media (max-width: 768px) {
          .navbar-links { display: none; }
          .navbar-username { display: none; }
          .bottom-nav { display: flex; }
        }

        @media (max-width: 480px) {
          .coins-badge { display: none; }
        }
      `}</style>
    </>
  );
}
