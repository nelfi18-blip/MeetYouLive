"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { formatBadgeCount } from "@/lib/formatUtils";
import { getHomePath } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const getBearerHeader = (token) => ["Bearer", token].join(" ");
// Treat the public root and dashboard as Home states while preserving
// the role-aware Home link returned by getHomePath().
const HOME_ACTIVE_PATHS = new Set(["/", "/dashboard"]);

const IR_MENU_ICON_PATHS = {
  live: (
    <>
      <path d="M15 10.5 21 7v10l-6-3.5" />
      <rect x="3" y="6" width="12" height="12" rx="3" />
    </>
  ),
  random: (
    <>
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="m15 15 6 6" />
      <path d="M4 4l5 5" />
    </>
  ),
  vcr: (
    <>
      <rect x="2.5" y="5" width="13" height="14" rx="3" />
      <path d="M15.5 10 21.5 7v10l-6-3" />
      <circle cx="9" cy="10.5" r="2" />
      <path d="M5.5 16a3.5 3.5 0 0 1 7 0" />
    </>
  ),
  matches: (
    <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.9 3.7 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.4 0 5.5 3.4 4.3 6.7-1.7 4.7-9.2 9.3-9.2 9.3Z" />
  ),
  earnings: (
    <>
      <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8Z" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </>
  ),
};

function IrMenuIcon({ name }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {IR_MENU_ICON_PATHS[name] || IR_MENU_ICON_PATHS.live}
    </svg>
  );
}

export default function BottomNavEnhanced() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [viewerRole, setViewerRole] = useState("");
  const [viewerCreatorStatus, setViewerCreatorStatus] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: getBearerHeader(token) },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setViewerRole(d.role || "");
          setViewerCreatorStatus(d.creatorStatus || "");
        }
      })
      .catch(() => {});
  }, [session]);

  const canGoLive = useMemo(
    () => Boolean(session?.user) && isApprovedCreator({ role: viewerRole, creatorStatus: viewerCreatorStatus }),
    [session?.user, viewerCreatorStatus, viewerRole]
  );
  const homePath = useMemo(
    () => (canGoLive ? "/creator" : getHomePath(viewerRole) || "/dashboard"),
    [canGoLive, viewerRole]
  );

  const isActive = (path) => {
    if (path === homePath) return HOME_ACTIVE_PATHS.has(pathname) || pathname === homePath;
    return pathname?.startsWith(path);
  };

  const primaryLiveHref = canGoLive ? "/live/start" : "/live";

  useEffect(() => {
    if (!session?.backendToken) return;

    const fetchCounts = async () => {
      try {
        const livesRes = await fetch(`${API_URL}/api/lives`, {
          headers: { Authorization: getBearerHeader(session.backendToken) },
        });

        if (livesRes.ok) {
          const livesData = await livesRes.json();
          setLiveCount(Array.isArray(livesData) ? livesData.length : 0);
        }
      } catch (error) {
        console.error("Error fetching navigation activity:", error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [session]);

  // Central IR menu: every entry reuses an existing route and keeps the
  // current role rules (approved creators start a live and keep the
  // earnings shortcut; viewers browse live rooms and matches).
  const createMenuItems = [
    {
      id: "live",
      icon: "live",
      label: canGoLive ? t("nav.startLive") : t("nav.liveRooms"),
      description: canGoLive ? t("nav.irMenu.startLiveDesc") : t("nav.irMenu.liveRoomsDesc"),
      href: primaryLiveHref,
      accent: "live",
      show: true,
    },
    {
      id: "random",
      icon: "random",
      label: t("nav.random"),
      description: t("nav.irMenu.randomDesc"),
      href: "/random",
      accent: "random",
      show: true,
    },
    {
      id: "vcr",
      icon: "vcr",
      label: t("nav.irMenu.vcr"),
      description: t("nav.irMenu.vcrDesc"),
      href: "/calls",
      accent: "vcr",
      show: true,
    },
    {
      id: "matches",
      icon: canGoLive ? "earnings" : "matches",
      label: canGoLive ? t("navbar.earnings") : t("nav.matches"),
      description: canGoLive ? t("nav.irMenu.earningsDesc") : t("nav.irMenu.matchesDesc"),
      href: canGoLive ? "/creator#earnings" : "/matches",
      accent: "matches",
      show: true,
    },
    {
      id: "coins",
      icon: "coins",
      label: t("nav.coinsGifts"),
      description: t("nav.irMenu.coinsGiftsDesc"),
      href: "/coins",
      accent: "coins",
      show: true,
    },
  ];

  const toggleCreateMenu = () => setShowCreateMenu((value) => !value);
  const closeCreateMenu = () => setShowCreateMenu(false);

  useEffect(() => {
    setShowCreateMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!showCreateMenu) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShowCreateMenu(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showCreateMenu]);

  return (
    <>
      <AnimatePresence>
        {showCreateMenu && (
          <>
            <motion.div
              className="create-menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCreateMenu}
              aria-hidden="true"
            />
            <motion.div
              id="ir-menu-panel"
              className="create-menu"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ir-menu-title"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
            >
              <div className="create-menu-header">
                <div className="create-menu-heading">
                  <span className="create-menu-eyebrow">{t("nav.irMenu.eyebrow")}</span>
                  <h2 id="ir-menu-title" className="create-menu-title">{t("nav.irMenu.title")}</h2>
                  <p className="create-menu-subtitle">{t("nav.irMenu.subtitle")}</p>
                </div>
                <button
                  type="button"
                  className="create-menu-close"
                  onClick={closeCreateMenu}
                  aria-label={t("nav.irMenu.close")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ul className="create-menu-list">
                {createMenuItems.filter((item) => item.show).map((item, index) => (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                  >
                    <Link
                      href={item.href}
                      className={`create-menu-item create-menu-item--${item.accent}`}
                      onClick={closeCreateMenu}
                    >
                      <span className="create-menu-icon" aria-hidden="true">
                        <IrMenuIcon name={item.icon} />
                      </span>
                      <span className="create-menu-text">
                        <span className="create-menu-label">{item.label}</span>
                        <span className="create-menu-desc">{item.description}</span>
                      </span>
                      <span className="create-menu-chevron" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="bottom-nav-enhanced" aria-label="Premium MeetYouLive navigation">
        <Link href={homePath} className={`nav-item ${isActive(homePath) ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5 10.5V20h14v-9.5" />
            <path d="M9.5 20v-5h5v5" />
          </svg>
          <span className="nav-label">{t("nav.home")}</span>
        </Link>

        <Link href="/feed" className={`nav-item ${isActive("/feed") || isActive("/explore") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 4 7l8 4 8-4-8-4Z" />
            <path d="m4 12 8 4 8-4" />
            <path d="m4 17 8 4 8-4" />
          </svg>
          <span className="nav-label">{t("nav.discover")}</span>
        </Link>

        <button
          onClick={toggleCreateMenu}
          className={`nav-item-create ${showCreateMenu ? "active" : ""}`}
          aria-label={
            liveCount > 0
              ? `${t("nav.liveRooms")} (${liveCount})`
              : canGoLive ? t("nav.openLiveCreatorActions") : t("nav.openLiveRoomActions")
          }
          aria-expanded={showCreateMenu}
          aria-controls={showCreateMenu ? "ir-menu-panel" : undefined}
        >
          {liveCount > 0 && (
            <span className="live-count-dot" aria-label={`${liveCount} active live rooms`}>
              {formatBadgeCount(liveCount)}
            </span>
          )}
          <motion.div
            className="create-btn-icon"
            animate={{ rotate: showCreateMenu ? 45 : 0, scale: showCreateMenu ? 0.94 : 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 10.5 21 7v10l-6-3.5" />
              <rect x="3" y="6" width="12" height="12" rx="3" />
            </svg>
          </motion.div>
          <span className="create-live-label" aria-live="polite">{liveCount > 0 ? t("nav.liveCtaActive") : t("nav.liveCtaInactive")}</span>
        </button>

        <Link href="/chats" className={`nav-item ${isActive("/chats") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
            <path d="M8 9h8M8 13h5" />
          </svg>
          <span className="nav-label">{t("nav.chats")}</span>
        </Link>

        <Link
          href="/profile"
          className={`nav-item ${isActive("/profile") ? "active" : ""}`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
          </svg>
          <span className="nav-label">{t("nav.profile")}</span>
        </Link>
      </nav>
    </>
  );
}
