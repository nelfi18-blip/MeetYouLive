"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { DEFAULT_USER_HOME_PATH, getHomePath } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [role, setRole] = useState("");
  
  // Fetch user role
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setRole(d.role || ""); })
      .catch(() => {});
  }, [session]);
  
  // Get role-aware home path
  const homePath = useMemo(
    () => (role ? getHomePath(role) : DEFAULT_USER_HOME_PATH),
    [role]
  );
  
  const isActive = (path) => {
    if (path === homePath) {
      // Home is active if we're on the home path or the root path
      return pathname === "/" || pathname === homePath;
    }
    return pathname?.startsWith(path);
  };

  return (
    <nav className="bottom-nav-modern">
      <Link href={homePath} className={`nav-item ${isActive(homePath) ? "active" : ""}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Home</span>
      </Link>

      <Link href="/matches" className={`nav-item ${isActive("/matches") ? "active" : ""}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>Match</span>
      </Link>

      <Link href="/explore" className={`nav-item ${isActive("/explore") ? "active" : ""}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
        <span>Live</span>
      </Link>

      <Link href="/chats" className={`nav-item ${isActive("/chats") ? "active" : ""}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Chat</span>
      </Link>

      <Link href="/profile" className={`nav-item ${isActive("/profile") ? "active" : ""}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Profile</span>
      </Link>
    </nav>
  );
}
