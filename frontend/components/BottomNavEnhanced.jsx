"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { isApprovedCreator } from "@/lib/creatorUtils";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function BottomNavEnhanced() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newMatchesCount, setNewMatchesCount] = useState(0);
  const [showNewMatchAnimation, setShowNewMatchAnimation] = useState(false);
  
  const isActive = (path) => {
    if (path === "/feed") return pathname === "/" || pathname === "/feed";
    return pathname?.startsWith(path);
  };

  const canGoLive = session?.user && isApprovedCreator(session.user);

  // Fetch unread counts
  useEffect(() => {
    if (!session?.backendToken) return;

    const fetchCounts = async () => {
      try {
        const [chatsRes, matchesRes] = await Promise.all([
          fetch(`${API_URL}/api/chat/unread-count`, {
            headers: { Authorization: `Bearer ${session.backendToken}` }
          }),
          fetch(`${API_URL}/api/matches/new-count`, {
            headers: { Authorization: `Bearer ${session.backendToken}` }
          })
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
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [session, newMatchesCount]);

  const createMenuItems = [
    {
      icon: "📹",
      label: "Go Live",
      href: "/golive",
      color: "#ef4444",
      show: canGoLive,
    },
    {
      icon: "📷",
      label: "Upload Video",
      href: "/videos/upload",
      color: "#8b5cf6",
      show: true,
    },
    {
      icon: "📖",
      label: "Add Story",
      href: "/stories/create",
      color: "#3b82f6",
      show: true,
    },
  ];

  const toggleCreateMenu = () => {
    setShowCreateMenu(!showCreateMenu);
  };

  return (
    <>
      {/* Create Menu Overlay */}
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
              {createMenuItems.filter(item => item.show).map((item, index) => (
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
                    <div
                      className="create-menu-icon"
                      style={{ background: item.color }}
                    >
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

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav-enhanced">
        <Link href="/feed" className={`nav-item ${isActive("/feed") ? "active" : ""}`}>
          {showNewMatchAnimation && (
            <motion.div
              className="nav-pulse-animation"
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, repeat: 3 }}
            />
          )}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>Home</span>
          {newMatchesCount > 0 && (
            <span className="nav-badge" aria-label={`${newMatchesCount} new matches`}>
              {newMatchesCount > 99 ? '99+' : newMatchesCount}
            </span>
          )}
        </Link>

        <Link href="/explore" className={`nav-item ${isActive("/explore") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <span>Explore</span>
        </Link>

        {/* Create Button */}
        <button
          onClick={toggleCreateMenu}
          className={`nav-item-create ${showCreateMenu ? "active" : ""}`}
          aria-label="Create content"
          aria-expanded={showCreateMenu}
        >
          <motion.div
            className="create-btn-icon"
            animate={{ rotate: showCreateMenu ? 45 : 0 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </motion.div>
        </button>

        <Link href="/chats" className={`nav-item ${isActive("/chats") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Inbox</span>
          {unreadCount > 0 && (
            <span className="nav-badge nav-badge-pulse" aria-label={`${unreadCount} unread messages`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <Link href="/profile" className={`nav-item ${isActive("/profile") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profile</span>
        </Link>
      </nav>
    </>
  );
}
