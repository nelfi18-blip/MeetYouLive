"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";

export default function ModernTopBar() {
  const { data: session } = useSession();
  const [coins, setCoins] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (session?.user) {
      setCoins(session.user.coinsBalance || 0);
    }
  }, [session]);

  if (!session) return null;

  const userAvatar = session.user?.avatar || "";
  const userInitial = session.user?.name?.[0]?.toUpperCase() || "?";

  return (
    <div className="modern-top-bar">
      <div className="modern-top-bar-left">
        <Link href="/feed">
          <Image 
            src="/logo.svg" 
            alt="MeetYouLive" 
            width={36} 
            height={36}
            className="modern-top-bar-logo"
          />
        </Link>
      </div>

      <div className="modern-top-bar-right">
        <Link href="/coins" className="top-bar-coins">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <text x="12" y="16" fontSize="12" textAnchor="middle" fill="#0f0821" fontWeight="bold">$</text>
          </svg>
          <span>{coins.toLocaleString()}</span>
        </Link>

        <Link href="/notifications" className="top-bar-icon-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadNotifications > 0 && (
            <span className="notification-badge">{unreadNotifications}</span>
          )}
        </Link>

        <Link href="/profile">
          {userAvatar ? (
            <img 
              src={userAvatar} 
              alt="Profile" 
              className="top-bar-avatar"
            />
          ) : (
            <div className="top-bar-avatar" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #e040fb, #8b5cf6)',
              fontWeight: 700,
              fontSize: '1.1rem'
            }}>
              {userInitial}
            </div>
          )}
        </Link>
      </div>
    </div>
  );
}
