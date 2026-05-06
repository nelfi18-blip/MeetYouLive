"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { getUserImage, getDisplayName } from "@/lib/imageHelpers";
import Link from "next/link";

export default function ProfileHeader({ user, isOwnProfile = false }) {
  const [activeTab, setActiveTab] = useState("feed");
  
  const avatar = getUserImage(user);
  const displayName = getDisplayName(user);
  const stats = {
    followers: user.followersCount || 0,
    following: user.followingCount || 0,
    posts: user.postsCount || 0,
    likes: user.likesCount || 0,
  };

  const tabs = [
    { id: "feed", label: "Feed", icon: "📱" },
    { id: "info", label: "Info", icon: "ℹ️" },
    { id: "reels", label: "Reels", icon: "🎬" },
  ];

  return (
    <div className="profile-header-modern">
      {/* Cover/Background */}
      <div className="profile-cover">
        <div className="profile-cover-gradient"></div>
      </div>

      {/* Profile Info */}
      <div className="profile-info-section">
        {/* Avatar */}
        <div className="profile-avatar-large">
          {avatar ? (
            <img src={avatar} alt={displayName} />
          ) : (
            <div className="profile-avatar-placeholder">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          {user.isVerified && (
            <div className="profile-verified-badge">✓</div>
          )}
          {user.isLive && (
            <div className="profile-live-indicator">LIVE</div>
          )}
        </div>

        {/* Name & Bio */}
        <div className="profile-name-section">
          <h1 className="profile-name">{displayName}</h1>
          {user.username && (
            <p className="profile-username">@{user.username}</p>
          )}
          {user.bio && (
            <p className="profile-bio">{user.bio}</p>
          )}
        </div>

        {/* Stats */}
        <div className="profile-stats-grid">
          <div className="profile-stat-item">
            <div className="profile-stat-value">
              {formatNumber(stats.followers)}
            </div>
            <div className="profile-stat-label">Followers</div>
          </div>
          <div className="profile-stat-item">
            <div className="profile-stat-value">
              {formatNumber(stats.following)}
            </div>
            <div className="profile-stat-label">Following</div>
          </div>
          <div className="profile-stat-item">
            <div className="profile-stat-value">
              {formatNumber(stats.posts)}
            </div>
            <div className="profile-stat-label">Posts</div>
          </div>
          <div className="profile-stat-item">
            <div className="profile-stat-value">
              {formatNumber(stats.likes)}
            </div>
            <div className="profile-stat-label">Likes</div>
          </div>
        </div>

        {/* Actions */}
        <div className="profile-actions">
          {isOwnProfile ? (
            <>
              <Link href="/settings" className="profile-btn profile-btn-secondary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6m-5-7l5 5 5-5m-7-5l2 2 2-2M5 19l7-7 7 7"/>
                </svg>
                Edit Profile
              </Link>
              <Link href="/settings" className="profile-btn profile-btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </Link>
            </>
          ) : (
            <>
              <button className="profile-btn profile-btn-primary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Message
              </button>
              <button className="profile-btn profile-btn-secondary">
                Follow
              </button>
              <button className="profile-btn profile-btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`profile-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="profile-tab-icon">{tab.icon}</span>
              <span className="profile-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}
