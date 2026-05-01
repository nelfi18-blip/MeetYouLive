"use client";

import Link from "next/link";
import Badge from "./Badge";
import StatusBadges from "./StatusBadges";
import { computeStatusBadges } from "@/lib/statusBadges";
import { isApprovedCreator } from "@/lib/creatorUtils";

/**
 * Reusable LiveCard component for live-stream listings.
 *
 * Props:
 *  - live: { _id, title, description, viewerCount, giftsTotal, giftsCount,
 *            totalCoinsEarned, isTrending, isPrivate, entryCost, 
 *            user: { username, avatar, creatorStatus }, category, battle: { active } }
 */
export default function LiveCard({ live }) {
  if (!live || typeof live !== "object" || !live._id) return null;

  const rawUsername = live.user?.username || live.user?.name || "anónimo";
  const username = typeof rawUsername === "string" ? rawUsername : String(rawUsername);
  const initial = username.charAt(0).toUpperCase() || "?";
  const safeTitle = typeof live.title === "string" && live.title.trim() ? live.title.trim() : "Directo en vivo";
  const safeViewerCount = Number.isFinite(live.viewerCount) ? Math.max(0, live.viewerCount) : 0;
  const safeGiftsTotal = Number.isFinite(live.giftsTotal) ? Math.max(0, live.giftsTotal) : 0;
  const safeTotalCoins = Number.isFinite(live.totalCoinsEarned) ? Math.max(0, live.totalCoinsEarned) : 0;

  // Use the canonical creator check helper
  const isCreatorApproved = isApprovedCreator(live.user);
  
  // Check if live is new (created less than 10 minutes ago)
  const isNew = live.createdAt ? (Date.now() - new Date(live.createdAt).getTime()) < 10 * 60 * 1000 : false;
  
  // Check if battle mode is active
  const isBattle = live.battle?.active === true;

  const statusBadges = computeStatusBadges(
    { ...live.user, isLive: true, liveId: live._id },
    { viewerCount: safeViewerCount, giftsTotal: safeGiftsTotal },
  );

  return (
    <>
      <Link href={`/live/${live._id}`} className="live-card">
        {/* Thumbnail */}
        <div className="live-thumb">
          <div className="live-thumb-bg" />

          <div className="live-thumb-badges">
            <Badge variant="live" pulse>EN VIVO</Badge>
            {live.category && (
              <span className="live-category-tag">{live.category}</span>
            )}
            {isBattle && (
              <span className="live-vs-badge">⚔️ VS</span>
            )}
          </div>

          {/* Top tags - trending, top creator, new */}
          <div className="live-top-tags">
            {live.isTrending && (
              <span className="live-tag-trending">🔥 TRENDING</span>
            )}
            {isCreatorApproved && safeViewerCount >= 50 && (
              <span className="live-tag-top">⭐ TOP</span>
            )}
            {isNew && (
              <span className="live-tag-new">✨ NUEVO</span>
            )}
          </div>

          {live.isPrivate && (
            <span className="live-private-badge">🔒 PRIVADO</span>
          )}

          <div className="live-thumb-stats">
            {safeViewerCount >= 0 && (
              <span className="live-stat-chip">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                {safeViewerCount}
              </span>
            )}
            {safeTotalCoins > 0 && (
              <span className="live-stat-chip live-stat-coins">
                💎 {safeTotalCoins}
              </span>
            )}
          </div>

          <div className="live-thumb-play">▶</div>
        </div>

        {/* Body */}
        <div className="live-body">
          <div className="live-user-row">
            <div className="live-avatar">
              {live.user?.avatar ? (
                <img src={live.user.avatar} alt={username} className="live-avatar-img" />
              ) : (
                initial
              )}
              <span className="live-avatar-dot" />
            </div>
            <span className="live-username">@{username}</span>
            {isCreatorApproved && (
              <span className="live-creator-badge">⭐</span>
            )}
            {live.isPrivate && live.entryCost != null && (
              <span className="live-entry-cost" style={{ marginLeft: "auto" }}>🪙 {live.entryCost}</span>
            )}
          </div>
          {statusBadges.length > 0 && (
            <StatusBadges badges={statusBadges} compact />
          )}
          <div className="live-title">{safeTitle}</div>
          {live.description && (
            <div className="live-desc">{live.description}</div>
          )}
          <div className="live-join-row">
            <span className="live-join-btn">🎥 Entrar</span>
          </div>
        </div>
      </Link>

      <style jsx>{`
        .live-card {
          overflow: hidden;
          cursor: pointer;
          border: 1px solid rgba(224, 64, 251, 0.16);
          border-radius: var(--radius);
          background: linear-gradient(135deg, rgba(30,12,60,0.9) 0%, rgba(12,5,25,0.95) 100%);
          transition: transform 0.35s cubic-bezier(0.4,0,0.2,1),
                      box-shadow 0.35s cubic-bezier(0.4,0,0.2,1),
                      border-color 0.2s ease;
          display: block;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
        }

        .live-card:hover {
          border-color: rgba(139, 92, 246, 0.55);
          box-shadow: var(--shadow), 0 0 40px rgba(139, 92, 246, 0.28);
          transform: translateY(-5px);
        }

        .live-card:active {
          transform: scale(0.97) translateY(-2px);
          box-shadow: var(--shadow), 0 0 20px rgba(139, 92, 246, 0.18);
        }

        /* Thumbnail - increased height for stronger presence */
        .live-thumb {
          height: 200px;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .live-thumb-bg {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(22,12,45,0.92), rgba(35,16,70,0.96), rgba(15,8,32,1));
        }

        .live-thumb-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, rgba(139,92,246,0.15), transparent 65%);
        }

        .live-thumb-badges {
          position: absolute;
          top: 0.75rem;
          left: 0.75rem;
          z-index: 2;
          display: flex;
          gap: 0.4rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .live-category-tag {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-muted);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(8px);
        }

        .live-vs-badge {
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.05em;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.25));
          color: #fca5a5;
          border: 1px solid rgba(239,68,68,0.4);
          backdrop-filter: blur(8px);
        }

        /* Top right tags */
        .live-top-tags {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          align-items: flex-end;
        }

        .live-tag-trending {
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          padding: 0.22rem 0.65rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(239,68,68,0.3), rgba(220,38,38,0.3));
          color: #fff;
          border: 1px solid rgba(239,68,68,0.5);
          backdrop-filter: blur(10px);
          box-shadow: 0 2px 12px rgba(239,68,68,0.3);
          animation: trendingPulse 2s ease-in-out infinite;
        }

        @keyframes trendingPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 2px 12px rgba(239,68,68,0.3); }
          50% { transform: scale(1.05); box-shadow: 0 4px 20px rgba(239,68,68,0.5); }
        }

        .live-tag-top {
          font-size: 0.6rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.25));
          color: #fde68a;
          border: 1px solid rgba(251,191,36,0.4);
          backdrop-filter: blur(10px);
        }

        .live-tag-new {
          font-size: 0.6rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(124,58,237,0.25));
          color: #c4b5fd;
          border: 1px solid rgba(139,92,246,0.4);
          backdrop-filter: blur(10px);
        }

        .live-private-badge {
          position: absolute;
          bottom: 3rem;
          right: 0.75rem;
          z-index: 2;
          background: rgba(139,92,246,0.85);
          color: #fff;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 0.22rem 0.65rem;
          border-radius: 999px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(139,92,246,0.5);
        }

        .live-thumb-stats {
          position: absolute;
          bottom: 0.75rem;
          right: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          z-index: 2;
        }

        .live-stat-chip {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(6,4,17,0.85);
          color: var(--text);
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.28rem 0.7rem;
          border-radius: 999px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .live-stat-coins {
          background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(124,58,237,0.3));
          color: #c4b5fd;
          border-color: rgba(139,92,246,0.3);
        }

        .live-stat-gifts {
          color: #f9a8d4;
          border-color: rgba(244,114,182,0.2);
        }

        .live-thumb-play {
          font-size: 3rem;
          opacity: 0.1;
          position: relative;
          z-index: 1;
          color: var(--text);
        }

        /* Body */
        .live-body {
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .live-user-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .live-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.75rem;
          flex-shrink: 0;
          overflow: hidden;
          position: relative;
          border: 1.5px solid rgba(224,64,251,0.4);
        }

        .live-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }

        .live-avatar-dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ef4444;
          border: 1.5px solid rgba(12,5,25,0.95);
          animation: liveDotPulse 1.4s infinite;
        }

        @keyframes liveDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.8); }
        }

        .live-username {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .live-creator-badge {
          font-size: 0.72rem;
          line-height: 1;
          margin-left: 0.1rem;
        }

        .live-entry-cost {
          font-size: 0.7rem;
          font-weight: 700;
          color: #a78bfa;
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.28);
          border-radius: 999px;
          padding: 0.18rem 0.55rem;
          white-space: nowrap;
        }

        .live-title {
          font-weight: 700;
          color: var(--text);
          font-size: 0.95rem;
          line-height: 1.35;
        }

        .live-desc {
          color: var(--text-muted);
          font-size: 0.8rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.4;
        }

        .live-join-row {
          margin-top: 0.15rem;
        }

        .live-join-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: linear-gradient(135deg, rgba(224,64,251,0.18), rgba(139,92,246,0.18));
          border: 1px solid rgba(224,64,251,0.35);
          color: #e040fb;
          font-size: 0.75rem;
          font-weight: 800;
          padding: 0.3rem 0.85rem;
          border-radius: 999px;
          letter-spacing: 0.02em;
          transition: all 0.18s;
        }

        .live-card:hover .live-join-btn {
          background: linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3));
          border-color: rgba(224,64,251,0.6);
          box-shadow: 0 0 12px rgba(224,64,251,0.25);
        }
      `}</style>
    </>
  );
}
