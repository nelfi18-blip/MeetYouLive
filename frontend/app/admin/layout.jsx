"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { clearAdminToken } from "@/lib/token";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "⊞", exact: true },
  { href: "/admin/users", label: "Usuarios", icon: "👥" },
  { href: "/admin/creators", label: "Creadores", icon: "🎬" },
  { href: "/admin/lives", label: "Streams", icon: "📡" },
  { href: "/admin/transactions", label: "Transacciones", icon: "💰" },
  { href: "/admin/reports", label: "Reportes", icon: "🚨" },
  { href: "/admin/analytics", label: "Analíticas", icon: "📊" },
  { href: "/admin/settings", label: "Configuración", icon: "⚙️" },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adminUser, setAdminUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") return;
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    try {
      const raw = localStorage.getItem("admin_user");
      if (raw) setAdminUser(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [pathname, router]);

  const handleLogout = () => {
    clearAdminToken();
    window.location.href = "/admin/login";
  };

  const isActive = (item) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  // /admin/login doesn't use this layout
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="admin-shell">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`} aria-label="Admin navigation">
        <div className="sidebar-logo">
          <span className="logo-icon">🛡️</span>
          <span className="logo-text">Admin</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${isActive(item) ? " nav-item--active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          {adminUser && (
            <div className="admin-info">
              <div className="admin-avatar">{(adminUser.name || adminUser.username || "A")[0].toUpperCase()}</div>
              <div className="admin-meta">
                <div className="admin-name">{adminUser.name || adminUser.username}</div>
                <div className="admin-role">Administrador</div>
              </div>
            </div>
          )}
          <button className="logout-btn" onClick={handleLogout}>
            ⏻ Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="admin-main">
        {/* Top bar (mobile) */}
        <header className="topbar">
          <button
            className="topbar-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="topbar-title">MeetYouLive Admin</span>
        </header>

        <div className="admin-content">{children}</div>
      </div>

      <style jsx>{`
        :root {
          --admin-sidebar-width: 220px;
        }

        .admin-shell {
          display: flex;
          min-height: 100vh;
          background: #0f1117;
          color: #e2e8f0;
          font-family: inherit;
        }

        /* ── Overlay ── */
        .sidebar-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 40;
        }

        /* ── Sidebar ── */
        .sidebar {
          width: var(--admin-sidebar-width);
          flex-shrink: 0;
          background: #161b27;
          border-right: 1px solid #1e2535;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          z-index: 50;
          transform: translateX(-100%);
          transition: transform 0.25s ease;
        }

        @media (min-width: 768px) {
          .sidebar {
            transform: translateX(0);
            position: sticky;
            top: 0;
            height: 100vh;
          }
          .topbar { display: none; }
        }

        .sidebar--open {
          transform: translateX(0);
        }

        /* ── Logo ── */
        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 1.25rem 1.25rem 1rem;
          border-bottom: 1px solid #1e2535;
        }

        .logo-icon {
          font-size: 1.4rem;
        }

        .logo-text {
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #a78bfa;
          text-transform: uppercase;
        }

        /* ── Nav ── */
        .sidebar-nav {
          flex: 1;
          padding: 0.75rem 0;
          overflow-y: auto;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.6rem 1.25rem;
          font-size: 0.9rem;
          font-weight: 500;
          color: #94a3b8;
          text-decoration: none;
          border-radius: 0;
          transition: background 0.15s, color 0.15s;
          border-left: 3px solid transparent;
        }

        .nav-item:hover {
          background: rgba(167, 139, 250, 0.08);
          color: #e2e8f0;
        }

        .nav-item--active {
          background: rgba(167, 139, 250, 0.12);
          color: #a78bfa;
          border-left-color: #a78bfa;
        }

        .nav-icon {
          font-size: 1rem;
          width: 1.4rem;
          text-align: center;
          flex-shrink: 0;
        }

        /* ── Footer ── */
        .sidebar-footer {
          padding: 1rem 1.25rem;
          border-top: 1px solid #1e2535;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .admin-info {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .admin-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
          color: #fff;
          flex-shrink: 0;
        }

        .admin-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .admin-role {
          font-size: 0.75rem;
          color: #64748b;
        }

        .logout-btn {
          width: 100%;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
          text-align: left;
        }

        .logout-btn:hover {
          background: rgba(239, 68, 68, 0.16);
        }

        /* ── Main content ── */
        .admin-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        @media (min-width: 768px) {
          .admin-main {
            margin-left: var(--admin-sidebar-width);
          }
        }

        /* ── Topbar (mobile) ── */
        .topbar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: #161b27;
          border-bottom: 1px solid #1e2535;
          position: sticky;
          top: 0;
          z-index: 30;
        }

        .topbar-menu-btn {
          background: none;
          border: none;
          color: #e2e8f0;
          font-size: 1.3rem;
          cursor: pointer;
          line-height: 1;
          padding: 0.25rem;
        }

        .topbar-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #a78bfa;
        }

        /* ── Page content ── */
        .admin-content {
          flex: 1;
          padding: 1.5rem;
          overflow-x: hidden;
        }

        @media (max-width: 767px) {
          .admin-content {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
