"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearToken, clearAllAuth, buildSwitchAccountUrl, getHomePath } from "@/lib/token";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import { isBottomNavRoute } from "@/lib/bottomNavRoutes";
import { PROFILE_UPDATED_EVENT } from "@/lib/profileSync";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function RoomsIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>; }
function VideoNavIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>; }
function StarNavIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function FeedIcon()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }

/* ── SVG icon components ─────────────────────────── */
function HomeIcon()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>; }
function ExploreIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function LiveIcon()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>; }
function ChatIcon()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>; }
function ProfileIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function MatchIcon()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>; }
function CrushIcon()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function CoinIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 010 5H9"/></svg>; }
function LogoutIcon()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function ChevronIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function BellIcon()    { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>; }
function DashboardIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>; }

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t, lang, setLang, syncFromUser } = useLanguage();
  const [coins, setCoins] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [creatorStatus, setCreatorStatus] = useState("");
  const [avatar, setAvatar] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const applyProfile = useCallback((profile) => {
    if (!profile || typeof profile !== "object") return;
    if ("username" in profile || "name" in profile) {
      setUsername(profile.username || profile.name || "");
    }
    if ("role" in profile) setRole(profile.role || "");
    if ("creatorStatus" in profile) setCreatorStatus(profile.creatorStatus || "");
    if ("avatar" in profile) setAvatar(profile.avatar || "");
    if ("coins" in profile) setCoins(profile.coins ?? 0);
    if (profile.preferredLanguage) syncFromUser(profile.preferredLanguage);
  }, [syncFromUser]);

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/me`, { headers, cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) applyProfile(d); })
      .catch(() => {});

    fetch(`${API_URL}/api/user/coins`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setCoins(d.coins); })
      .catch(() => {});
  }, [session, applyProfile]);

  useEffect(() => {
    const handleProfileUpdated = (event) => {
      applyProfile(event.detail);
    };

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    };
  }, [applyProfile]);

  // Unread notification count — fetch on mount and poll every 60s
  useEffect(() => {
    const fetchCount = () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) return;
      fetch(`${API_URL}/api/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setUnreadCount(d.count || 0); })
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);

    // Real-time bump: providers.jsx dispatches "notif:new" via socket
    const handleNew = () => setUnreadCount((c) => c + 1);
    // Reset when user visits the notifications page
    const handleReadAll = () => setUnreadCount(0);

    window.addEventListener("notif:new", handleNew);
    window.addEventListener("notif:read-all", handleReadAll);

    return () => {
      clearInterval(interval);
      window.removeEventListener("notif:new", handleNew);
      window.removeEventListener("notif:read-all", handleReadAll);
    };
  }, [session]);

  const handleLogout = () => {
    socket.disconnect();
    clearToken();
    signOut({ callbackUrl: "/login" });
  };

  const handleSwitchAccount = async () => {
    if (confirm(t("nav.switchAccountConfirm") || "¿Cambiar de cuenta? Esto cerrará tu sesión actual.")) {
      try {
        // Sign out from NextAuth first
        await signOut({ redirect: false });
        // Clear all local storage, cookies, and session storage
        clearAllAuth();
        // Use replace instead of href to prevent back button issues
        // Use shared URL builder for consistency
        window.location.replace(buildSwitchAccountUrl());
      } catch (error) {
        console.error("[handleSwitchAccount] Error during account switch:", error);
        // Fallback: force reload to login anyway
        clearAllAuth();
        window.location.replace(buildSwitchAccountUrl());
      }
    }
  };

  const displayName =
    username ||
    session?.backendUser?.username ||
    session?.backendUser?.name ||
    session?.user?.name ||
    session?.user?.email?.split("@")[0] ||
    "Usuario";
  const effectiveRole = role || session?.backendUser?.role || "";
  const effectiveCreatorStatus = creatorStatus || session?.backendUser?.creatorStatus || "";
  const shouldUseModernBottomNav = isBottomNavRoute(pathname);
  
  // Get role-aware home path
  const homePath = useMemo(() => getHomePath(effectiveRole), [effectiveRole]);
  
  // Nav link definitions with dynamic home path
  const NAV_LINK_DEFS = useMemo(() => {
    const userLinks = [
      { href: "/dashboard", label: "Inicio", icon: HomeIcon },
      { href: "/feed", label: "Feed / Descubrir", icon: FeedIcon },
      { href: "/matches", label: "Matches", icon: MatchIcon },
      { href: "/chats", label: "Chats", icon: ChatIcon },
      { href: "/live", label: "Lives", icon: LiveIcon },
      { href: "/calls", label: "Videollamadas", icon: VideoNavIcon },
      { href: "/coins", label: "Coins", icon: CoinIcon },
      { href: "/profile", label: "Mi Perfil", icon: ProfileIcon },
    ];
    if (isApprovedCreator({ role: effectiveRole, creatorStatus: effectiveCreatorStatus })) {
      return [
        { href: "/creator", label: "Dashboard", icon: DashboardIcon },
        { href: "/live", label: "Mis Lives", icon: LiveIcon },
        { href: "/live/start", label: "Programar Live", icon: VideoNavIcon },
        { href: "/chats", label: "Comunidad", icon: ChatIcon },
        { href: "/creator#earnings", label: "Ganancias", icon: CoinIcon },
        { href: "/creator#wallet", label: "Retiros", icon: DashboardIcon },
        { href: "/creator#analytics", label: "Analíticas", icon: FeedIcon },
        { href: "/settings", label: "Configuración", icon: ProfileIcon },
      ];
    }
    return userLinks;
  }, [effectiveCreatorStatus, effectiveRole]);
  
  // Display appropriate role label - hide admin/moderator from public display
  const displayRole =
    effectiveRole === "admin"
      ? t("role.admin")
      : effectiveRole === "moderator"
      ? t("role.moderator")
      : effectiveRole === "subCreator" && effectiveCreatorStatus === "approved"
      ? t("role.subCreator")
      : isApprovedCreator({ role: effectiveRole, creatorStatus: effectiveCreatorStatus })
      ? t("role.creator")
      : effectiveCreatorStatus === "pending"
      ? t("role.creator_pending")
      : t("role.member");
  const initial = displayName[0].toUpperCase();

  return (
    <>
      <nav className={`navbar${shouldUseModernBottomNav ? " navbar--bottom-route" : ""}`}>
        {/* Brand */}
        <div className="navbar-brand">
          <Link href={homePath} className="navbar-logo">
            <Image
              src="/logo.svg"
              alt="MeetYouLive"
              width={32}
              height={32}
              className="navbar-logo-img"
              priority
            />
            <span className="navbar-logo-text">MeetYou<span className="logo-accent">Live</span></span>
          </Link>
        </div>

        {/* Center nav links */}
        <div className="navbar-links">
          {NAV_LINK_DEFS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`navbar-link${active ? " active" : ""}`}
              >
                <Icon />
                <span>{link.label || t(link.key)}</span>
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

          {/* Notification bell */}
          <Link href="/notifications" className="notif-bell">
            <BellIcon />
            {unreadCount > 0 && (
              <span className="notif-bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </Link>

          <div className="navbar-user" onClick={() => setMenuOpen(!menuOpen)}>
            <div className="nav-avatar">
              {avatar
                ? <img src={avatar} alt={displayName} className="nav-avatar-img" onError={(e) => { e.target.style.display = "none"; }} />
                : initial}
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
                  <div className="dropdown-avatar">
                    {avatar
                      ? <img src={avatar} alt={displayName} className="nav-avatar-img" style={{ width: "100%", height: "100%" }} onError={(e) => { e.target.style.display = "none"; }} />
                      : initial}
                  </div>
                  <div>
                    <div className="dropdown-name">{displayName}</div>
                    <div className="dropdown-role">{displayRole}</div>
                  </div>
                </div>
                <div className="dropdown-divider" />
                <Link href="/profile" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                  <ProfileIcon /> {t("nav.myProfile")}
                </Link>
                {isApprovedCreator({ role: effectiveRole, creatorStatus: effectiveCreatorStatus }) && (
                  <Link href="/dashboard/creator" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                    <DashboardIcon /> {t("nav.creatorDashboard")}
                  </Link>
                )}
                <Link href="/coins" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                  <CoinIcon /> {t("nav.buyCoins")}
                </Link>
                <Link href="/subscription" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                  <StarNavIcon /> {t("nav.premiumSubscription")}
                </Link>
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={handleSwitchAccount}>
                  🔄 {t("nav.switchAccount") || "Cambiar cuenta"}
                </button>
                <button className="dropdown-item dropdown-logout" onClick={handleLogout}>
                  <LogoutIcon /> {t("nav.logout")}
                </button>
                <div className="dropdown-divider" />
                <div className="dropdown-langs">
                  {["es", "en", "pt"].map((code) => (
                    <button
                      key={code}
                      className={`dropdown-lang-btn${lang === code ? " active" : ""}`}
                      onClick={() => { setLang(code); setMenuOpen(false); }}
                      aria-label={t(`lang.${code}`)}
                    >
                      {t(`lang.${code}`)}
                    </button>
                  ))}
                </div>
                <div className="dropdown-divider" />
                <div className="dropdown-legal">
                  <Link href="/legal" className="dropdown-legal-link" onClick={() => setMenuOpen(false)}>Legal</Link>
                  <span className="dropdown-legal-sep">·</span>
                  <Link href="/terms" className="dropdown-legal-link" onClick={() => setMenuOpen(false)}>Términos</Link>
                  <span className="dropdown-legal-sep">·</span>
                  <Link href="/privacy" className="dropdown-legal-link" onClick={() => setMenuOpen(false)}>Privacidad</Link>
                  <span className="dropdown-legal-sep">·</span>
                  <Link href="/payments-refunds" className="dropdown-legal-link" onClick={() => setMenuOpen(false)}>Pagos</Link>
                </div>
              </div>
            </>
          )}
        </div>
      </nav>

      <style jsx>{`
        .navbar {
          position: sticky;
          top: 0;
          z-index: 200;
          background: rgba(20,12,46,0.75);
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          border-bottom: 1px solid rgba(224,64,251,0.28);
          box-shadow: 0 10px 40px rgba(4,2,12,0.5), 0 1px 0 rgba(224,64,251,0.2), inset 0 1px 0 rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          height: 64px;
          gap: 1rem;
          transition: all var(--transition-smooth);
        }

        .navbar::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(224,64,251,0.03) 50%, transparent 100%);
          pointer-events: none;
          animation: shimmer 3s ease-in-out infinite;
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
          font-size: 1.06rem;
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
          background: rgba(20,12,46,0.5);
          border: 1px solid rgba(224,64,251,0.18);
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
          transition: all var(--transition-smooth);
          position: relative;
        }

        .navbar-link::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: var(--radius-pill);
          background: rgba(255,255,255,0.05);
          opacity: 0;
          transition: opacity var(--transition-smooth);
        }

        .navbar-link:hover { 
          color: var(--text) !important; 
          background: rgba(255,255,255,0.08);
          transform: translateY(-1px);
        }
        .navbar-link:hover::before { opacity: 1; }
        .navbar-link.active {
          color: #fff !important;
          background: var(--grad-cool);
          box-shadow: var(--glow-cyan), 0 4px 12px rgba(124,58,237,0.3);
          transform: translateY(-1px);
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
          background: rgba(251,146,60,0.15);
          color: var(--accent-orange) !important;
          border: 1px solid rgba(251,146,60,0.3);
          border-radius: var(--radius-pill);
          padding: 0.32rem 0.9rem;
          font-size: 0.82rem;
          font-weight: 700;
          transition: all var(--transition-smooth);
          position: relative;
          overflow: hidden;
        }

        .coins-badge::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
          transform: translateX(-100%);
          transition: transform 0.6s;
        }

        .coins-badge:hover {
          background: rgba(251,146,60,0.2);
          border-color: rgba(251,146,60,0.5);
          box-shadow: 0 0 16px rgba(251,146,60,0.3);
          transform: translateY(-2px) scale(1.05);
        }

        .coins-badge:hover::before {
          transform: translateX(100%);
        }
        .coins-badge:hover {
          background: rgba(251,146,60,0.18);
          box-shadow: 0 0 14px rgba(251,146,60,0.3);
        }

        /* ── Notification Bell ─── */
        .notif-bell {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          color: var(--text-muted) !important;
          border: 1px solid transparent;
          transition: all var(--transition);
          flex-shrink: 0;
        }
        .notif-bell:hover {
          color: var(--text) !important;
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.08);
        }
        .notif-bell-badge {
          position: absolute;
          top: 1px;
          right: 1px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          background: var(--accent);
          color: #fff;
          font-size: 0.65rem;
          font-weight: 800;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 8px rgba(224,64,251,0.7);
          line-height: 1;
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
          overflow: hidden;
        }

        .nav-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
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
          background: rgba(20,12,46,0.88);
          border: 1px solid rgba(224,64,251,0.22);
          border-radius: var(--radius);
          padding: 0.6rem;
          min-width: 210px;
          box-shadow: var(--shadow), var(--glow-pink);
          backdrop-filter: blur(12px);
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

        .dropdown-legal {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 0.75rem 0.55rem;
          flex-wrap: wrap;
        }

        .dropdown-legal-link {
          font-size: 0.72rem;
          color: var(--text-dim, #555);
          text-decoration: none;
          transition: color 0.15s;
        }

        .dropdown-legal-link:hover { color: var(--text-muted); }

        .dropdown-legal-sep {
          font-size: 0.72rem;
          color: var(--text-dim, #444);
        }

        @media (max-width: 768px) {
          .navbar { display: none; }
          .navbar-links { display: none; }
          .navbar-username { display: none; }
        }

        @media (max-width: 1024px) {
          .navbar--bottom-route { display: none; }
        }

        @media (max-width: 480px) {
          .coins-badge { display: none; }
        }

        /* ── Language switcher ─── */
        .dropdown-langs {
          display: flex;
          gap: 0.4rem;
          padding: 0.45rem 0.75rem;
        }

        .dropdown-lang-btn {
          background: transparent;
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: 999px;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          padding: 0.25rem 0.6rem;
          text-transform: uppercase;
          transition: all 0.15s;
        }

        .dropdown-lang-btn:hover {
          background: rgba(224,64,251,0.1);
          color: var(--text);
        }

        .dropdown-lang-btn.active {
          background: rgba(224,64,251,0.2);
          border-color: rgba(224,64,251,0.55);
          color: #e040fb;
        }
      `}</style>
    </>
  );
}
