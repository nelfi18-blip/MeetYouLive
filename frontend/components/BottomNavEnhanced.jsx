"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { isApprovedCreator } from "@/lib/creatorUtils";

export default function BottomNavEnhanced() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  
  const isActive = (path) => {
    if (path === "/feed") return pathname === "/" || pathname === "/feed";
    return pathname?.startsWith(path);
  };

  const canGoLive = session?.user && isApprovedCreator(session.user);

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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>Home</span>
        </Link>

        <Link href="/explore" className={`nav-item ${isActive("/explore") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <span>Explore</span>
        </Link>

        {/* Create Button */}
        <button
          onClick={toggleCreateMenu}
          className={`nav-item-create ${showCreateMenu ? "active" : ""}`}
        >
          <motion.div
            className="create-btn-icon"
            animate={{ rotate: showCreateMenu ? 45 : 0 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </motion.div>
        </button>

        <Link href="/chats" className={`nav-item ${isActive("/chats") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Inbox</span>
        </Link>

        <Link href="/profile" className={`nav-item ${isActive("/profile") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profile</span>
        </Link>
      </nav>
    </>
  );
}
