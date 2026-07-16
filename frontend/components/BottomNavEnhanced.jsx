"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { getHomePath } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const formatBadgeCount = (count) => (count > 99 ? "99+" : count);

export default function BottomNavEnhanced() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newMatchesCount, setNewMatchesCount] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [showNewMatchAnimation, setShowNewMatchAnimation] = useState(false);
  const [role, setRole] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: "Bearer " + token },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setRole(d.role || "");
      })
      .catch(() => {});
  }, [session]);

  const homePath = useMemo(() => getHomePath(role), [role]);

  const isActive = (path) => {
    if (path === homePath) return pathname === "/" || pathname === homePath;
    return pathname?.startsWith(path);
  };

  const canGoLive = session?.user && isApprovedCreator(session.user);
  const primaryLiveHref = canGoLive ? "/live/start" : "/live";

  useEffect(() => {
    if (!session?.backendToken) return;

    const fetchCounts = async () => {
      try {
        const [chatsRes, matchesRes, livesRes] = await Promise.all([
          fetch(`${API_URL}/api/chat/unread-count`, {
            headers: { Authorization: "Bearer " + session.backendToken },
          }),
          fetch(`${API_URL}/api/matches/new-count`, {
            headers: { Authorization: "Bearer " + session.backendToken },
          }),
          fetch(`${API_URL}/api/lives`, {
            headers: { Authorization: "Bearer " + session.backendToken },
          }),
        ]);

        if (chatsRes.ok) {
          const chatsData = await chatsRes.json();
          setUnreadCount(chatsData.count || 0);
        }

        if (matchesRes.ok) {
          const matchesData = await matchesRes.json();
          const newCount = matchesData.count || 0;
          if (newCount > newMatchesCount && newMatchesCount > 0) {
            setShowNewMatchAnimation(true);
            setTimeout(() => setShowNewMatchAnimation(false), 2000);
          }
          setNewMatchesCount(newCount);
        }

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
  }, [session, newMatchesCount]);

  const createMenuItems = [
    {
      icon: "🔴",
      label: canGoLive ? "Start Live" : "Live Rooms",
      href: primaryLiveHref,
      color: "#ef4444",
      show: true,
    },
    {
      icon: "👑",
      label: "Creator Center",
      href: "/creator",
      color: "#8b5cf6",
      show: true,
    },
    {
      icon: "🪙",
      label: "Coins & Gifts",
      href: "/coins",
      color: "#22d3ee",
      show: true,
    },
  ];

  const toggleCreateMenu = () => setShowCreateMenu((value) => !value);

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
              onClick={() => setShowCreateMenu(false)}
            />
            <motion.div
              className="create-menu"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ type: "spring", damping: 25 }}
            >
              {createMenuItems.filter((item) => item.show).map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link
                    href={item.href}
                    className="create-menu-item"
                    onClick={() => setShowCreateMenu(false)}
                  >
                    <div className="create-menu-icon" style={{ background: item.color }}>
                      {item.icon}
                    </div>
                    <span>{item.label}</span>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="bottom-nav-enhanced" aria-label="Premium MeetYouLive navigation">
        <Link href={homePath} className={`nav-item ${isActive(homePath) ? "active" : ""}`}>
          {showNewMatchAnimation && (
            <motion.div
              className="nav-pulse-animation"
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, repeat: 3 }}
            />
          )}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5 10.5V20h14v-9.5" />
            <path d="M9.5 20v-5h5v5" />
          </svg>
          <span className="nav-label">Hub</span>
          {newMatchesCount > 0 && (
            <span className="nav-badge" aria-label={`${newMatchesCount} new matches`}>
              {formatBadgeCount(newMatchesCount)}
            </span>
          )}
        </Link>

        <Link href="/explore" className={`nav-item ${isActive("/explore") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 4 7l8 4 8-4-8-4Z" />
            <path d="m4 12 8 4 8-4" />
            <path d="m4 17 8 4 8-4" />
          </svg>
          <span className="nav-label">Discover</span>
        </Link>

        <button
          onClick={toggleCreateMenu}
          className={`nav-item-create ${showCreateMenu ? "active" : ""}`}
          aria-label={canGoLive ? "Open live and creator actions" : "Open live rooms and creator actions"}
          aria-expanded={showCreateMenu}
        >
          {liveCount > 0 && (
            <span className="live-count-dot" aria-label={`${liveCount} active live rooms`}>
              {liveCount > 9 ? "9+" : liveCount}
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
          <span className="create-live-label">{liveCount > 0 ? "LIVE" : "GO"}</span>
        </button>

        <Link href="/chats" className={`nav-item ${isActive("/chats") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
            <path d="M8 9h8M8 13h5" />
          </svg>
          <span className="nav-label">Meet Hub</span>
          {unreadCount > 0 && (
            <span className="nav-badge nav-badge-pulse" aria-label={`${unreadCount} unread messages`}>
              {formatBadgeCount(unreadCount)}
            </span>
          )}
        </Link>

        <Link href="/profile" className={`nav-item ${isActive("/profile") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
          </svg>
          <span className="nav-label">You</span>
        </Link>
      </nav>
    </>
  );
}
