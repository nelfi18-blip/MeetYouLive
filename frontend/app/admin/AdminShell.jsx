"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { clearAdminToken, clearAllAuth, buildSwitchAccountUrl, getToken } from "@/lib/token";

const NAV_SECTIONS = [
  {
    title: "Inicio",
    items: [
      { href: "/admin", label: "Dashboard", icon: "⊞", exact: true, roles: ["admin"] },
    ],
  },
  {
    title: "Usuarios y comunidad",
    items: [
      { href: "/admin/users", label: "Usuarios", icon: "👥", roles: ["admin", "moderator", "support"] },
      { href: "/admin/creators", label: "Creadores", icon: "🎬", roles: ["admin", "creator_manager"] },
      { href: "/admin/agencies", label: "Agencias", icon: "🏢", roles: ["admin"] },
      { href: "/admin/reports", label: "Reportes", icon: "🚨", roles: ["admin", "moderator", "content_reviewer"] },
    ],
  },
  {
    title: "Contenido y actividad",
    items: [
      { href: "/admin/lives", label: "Lives", icon: "📡", roles: ["admin", "moderator"] },
      { href: "/admin/analytics", label: "Analíticas", icon: "📊", roles: ["admin"] },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { href: "/admin/transactions", label: "Transacciones", icon: "💰", roles: ["admin"] },
      { href: "/admin/revenue", label: "Ingresos", icon: "📈", roles: ["admin", "finance"] },
      { href: "/admin/withdrawals", label: "Solicitudes de retiro", icon: "💵", roles: ["admin", "finance"] },
      // Keep the existing visual route to avoid changing route/API behavior in this UI-only task.
      { href: "/admin/payouts", label: "Historial de retiros", icon: "💸", roles: ["admin", "finance"] },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/admin/settings", label: "Configuración", icon: "⚙️", roles: ["admin"] },
    ],
  },
];

function getSafeNonAdminRedirect() {
  try {
    return getToken() ? "/feed" : "/login";
  } catch {
    return "/login";
  }
}

export default function AdminShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adminUser, setAdminUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") return;
    const token = localStorage.getItem("admin_token");
    if (!token) {
      clearAdminToken();
      router.replace(getSafeNonAdminRedirect());
      return;
    }
    try {
      const raw = localStorage.getItem("admin_user");
      if (raw) {
        const user = JSON.parse(raw);
        setAdminUser(user);
        setUserRole(user.role || "admin");
      }
    } catch {
      // ignore
    }
  }, [pathname, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024) return;
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleLogout = () => {
    clearAdminToken();
    window.location.href = "/admin/login";
  };

  const handleSwitchAccount = async () => {
    // Admin panel uses hardcoded Spanish labels as it's internal-only and separate from main app i18n
    if (confirm("¿Cambiar a cuenta de usuario/creador? Esto cerrará tu sesión de administrador.")) {
      try {
        await signOut({ redirect: false });
        clearAllAuth();
        window.location.replace(buildSwitchAccountUrl());
      } catch (error) {
        console.error("[handleSwitchAccount] Error during account switch:", error);
        clearAllAuth();
        window.location.replace(buildSwitchAccountUrl());
      }
    }
  };

  const isActive = (item) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  const navSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(item => !item.roles || item.roles.includes(userRole)),
  })).filter((section) => section.items.length > 0);

  // /admin/login doesn't use this layout
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="admin-shell">
      <div
        className={`sidebar-overlay${sidebarOpen ? " sidebar-overlay--open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

        {/* Sidebar */}
        <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`} aria-label="Admin navigation">
          <div className="sidebar-logo">
            <Image src="/logo.svg" alt="MeetYouLive logo" width={26} height={26} className="logo-icon" />
            <span className="logo-text">MeetYouLive Admin</span>
          </div>

        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div className="nav-section" key={section.title}>
              <div className="nav-section-title">{section.title}</div>
              <div className="nav-section-items">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item${isActive(item) ? " nav-item--active" : ""}`}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={isActive(item) ? "page" : undefined}
                  >
                    <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                    <span className="nav-label">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {adminUser && (
            <div className="admin-info">
              <div className="admin-avatar">{(adminUser.name || adminUser.username || "A")[0].toUpperCase()}</div>
              <div className="admin-meta">
                <div className="admin-name">{adminUser.name || adminUser.username}</div>
                {/* Note: Admin panel uses hardcoded labels as it's separate from main app i18n */}
                <div className="admin-role">
                  {userRole === "moderator" && "Moderador"}
                  {userRole === "admin" && "Administrador"}
                  {userRole === "support" && "Soporte"}
                  {userRole === "creator_manager" && "Gestor de Creadores"}
                  {userRole === "finance" && "Finanzas"}
                  {userRole === "content_reviewer" && "Revisor de Contenido"}
                </div>
              </div>
            </div>
          )}
          <button className="switch-account-btn" onClick={handleSwitchAccount}>
            🔄 Cambiar cuenta
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            ⏻ Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="admin-main">
        {/* Top bar */}
        <header className="topbar">
          <button
            className="topbar-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="topbar-title">MeetYouLive Admin</span>
          <button className="topbar-user-btn" onClick={handleLogout} aria-label="Menú de usuario">
            {(adminUser?.name || adminUser?.username || "A")[0].toUpperCase()}
          </button>
        </header>

        <div className="admin-content">{children}</div>
      </div>

      <style jsx>{`
        :root {
          --admin-sidebar-width: 220px;
        }

        /* ── Shell ── */
        .admin-shell {
          display: flex;
          flex-direction: row;
          min-height: 100vh;
          width: 100%;
          max-width: 100%;
          background: #0f1117;
          color: #e2e8f0;
          font-family: inherit;
          overflow-x: hidden;
          position: relative;
        }

        /* ── Overlay ── */
        .sidebar-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 40;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s ease;
        }

        .sidebar-overlay--open {
          opacity: 1;
          pointer-events: auto;
        }

        /* ── Sidebar ── */
        .sidebar {
          width: var(--admin-sidebar-width);
          min-width: var(--admin-sidebar-width);
          flex-shrink: 0;
          background: #161b27;
          border-right: 1px solid #1e2535;
          display: flex;
          flex-direction: column;
          /* Mobile: hidden off-screen as fixed overlay */
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          height: 100%;
          z-index: 50;
          transform: translateX(-100%);
          transition: transform 0.28s ease;
          overflow-x: hidden;
        }

        /* On very small screens cap sidebar at 85vw */
        @media (max-width: 400px) {
          .sidebar {
            width: min(85vw, var(--admin-sidebar-width));
            min-width: 0;
          }
        }

        /* Desktop: sidebar becomes sticky in the flex flow */
        @media (min-width: 1024px) {
          .sidebar {
            position: sticky;
            top: 0;
            height: 100vh;
            transform: none;
            flex-shrink: 0;
          }
          .sidebar-overlay {
            display: none;
          }
        }

        .sidebar--open {
          transform: translateX(0);
        }

        /* ── Logo ── */
        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 1.2rem 1rem 0.95rem;
          border-bottom: 1px solid #1e2535;
          flex-shrink: 0;
        }

        :global(.logo-icon) {
          filter: drop-shadow(0 0 8px rgba(224,64,251,0.45));
          flex-shrink: 0;
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
          min-height: 0;
          padding: 0.85rem 0.75rem;
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .nav-section {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .nav-section-title {
          padding: 0 0.6rem;
          color: #64748b;
          font-size: 0.67rem;
          font-weight: 800;
          letter-spacing: 0.11em;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .nav-section-items {
          display: flex;
          flex-direction: column;
          gap: 0.18rem;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          min-height: 44px;
          padding: 0.7rem 0.65rem;
          font-size: 0.88rem;
          font-weight: 650;
          color: #aab5c4;
          text-decoration: none;
          border-radius: 14px;
          transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.15s;
          border-left: 3px solid transparent;
          width: 100%;
          box-sizing: border-box;
          flex-shrink: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .nav-item:hover {
          background: rgba(167, 139, 250, 0.08);
          color: #e2e8f0;
        }

        .nav-item--active {
          background: linear-gradient(90deg, rgba(167, 139, 250, 0.22), rgba(167, 139, 250, 0.08));
          color: #f8fafc;
          border-left-color: #a78bfa;
          box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.22), 0 12px 28px rgba(0, 0, 0, 0.18);
        }

        .nav-icon {
          width: 1.55rem;
          height: 1.55rem;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(248, 250, 252, 0.06);
          font-size: 0.98rem;
          line-height: 1;
          flex-shrink: 0;
        }

        .nav-item--active .nav-icon {
          background: rgba(167, 139, 250, 0.18);
        }

        .nav-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ── Footer ── */
        .sidebar-footer {
          padding: 1rem 1.25rem;
          border-top: 1px solid #1e2535;
          background: linear-gradient(180deg, rgba(22, 27, 39, 0.92), #161b27);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex-shrink: 0;
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

        .admin-role { font-size: 0.75rem; color: #64748b; }

        .switch-account-btn {
          width: 100%;
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
          text-align: left;
        }

        .switch-account-btn:hover { background: rgba(59, 130, 246, 0.16); }

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

        .logout-btn:hover { background: rgba(239, 68, 68, 0.16); }

        /* ── Main content ── */
        .admin-main {
          flex: 1 1 0; /* flex-basis:0 lets flex-grow own the width */
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
        }

        /* ── Topbar (mobile only) ── */
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: #161b27;
          border-bottom: 1px solid #1e2535;
          position: sticky;
          top: 0;
          z-index: 30;
          flex-shrink: 0;
        }

        .topbar-menu-btn {
          background: none;
          border: none;
          color: #e2e8f0;
          font-size: 1.3rem;
          cursor: pointer;
          line-height: 1;
          padding: 0.25rem;
          flex-shrink: 0;
        }

        .topbar-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #a78bfa;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: center;
          flex: 1;
        }

        .topbar-user-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid #2d3748;
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          color: #fff;
          font-weight: 700;
          font-size: 0.82rem;
          cursor: pointer;
          flex-shrink: 0;
        }

        @media (min-width: 1024px) {
          .topbar {
            padding: 0.85rem 1.5rem;
          }
          .topbar-menu-btn {
            visibility: hidden;
            pointer-events: none;
          }
          .topbar-title {
            font-size: 1rem;
          }
        }

        /* ── Page content ── */
        .admin-content {
          flex: 1;
          width: 100%;
          padding: 1.5rem;
          overflow-x: hidden;
          box-sizing: border-box;
        }

        @media (max-width: 1023px) {
          .admin-content { padding: 1rem 0.75rem calc(1.5rem + env(safe-area-inset-bottom, 0px)); }
        }

        @media (max-width: 400px) {
          .admin-content { padding: 0.75rem 0.5rem; }
        }
      `}</style>
    </div>
  );
}
