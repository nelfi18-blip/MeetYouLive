"use client";

import Link from "next/link";
import Badge from "./Badge";

/**
 * Reusable LiveCard component for live-stream listings.
 *
 * Props:
 *  - live: { _id, title, description, viewerCount, giftsTotal, giftsCount,
 *            isPrivate, entryCost, user: { username, avatar }, category }
 */
export default function LiveCard({ live }) {
  const username = live.user?.username || live.user?.name || "anónimo";
  const initial = username[0].toUpperCase();

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
          </div>

          {live.isPrivate && (
            <span className="live-private-badge">🔒 PRIVADO</span>
          )}

          <div className="live-thumb-stats">
            {live.viewerCount != null && (
              <span className="live-stat-chip">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                {live.viewerCount}
              </span>
            )}
            {live.giftsTotal > 0 && (
              <span className="live-stat-chip live-stat-gifts">
                🎁 {live.giftsTotal}
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
            {live.isPrivate && live.entryCost != null && (
              <span className="live-entry-cost" style={{ marginLeft: "auto" }}>🪙 {live.entryCost}</span>
            )}
          </div>
          <div className="live-title">{live.title}</div>
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

        /* Thumbnail */
        .live-thumb {
          height: 162px;
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
          background: radial-gradient(circle at 50% 50%, rgba(139,92,246,0.1), transparent 65%);
        }

        .live-thumb-badges {
          position: absolute;
          top: 0.65rem;
          left: 0.65rem;
          z-index: 2;
          display: flex;
          gap: 0.35rem;
          align-items: center;
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

        .live-private-badge {
          position: absolute;
          top: 0.65rem;
          right: 0.65rem;
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
          bottom: 0.65rem;
          right: 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          z-index: 2;
        }

        .live-stat-chip {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(6,4,17,0.8);
          color: var(--text);
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.22rem 0.6rem;
          border-radius: 999px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .live-stat-gifts {
          color: #f9a8d4;
          border-color: rgba(244,114,182,0.2);
        }

        .live-thumb-play {
          font-size: 2.5rem;
          opacity: 0.12;
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
          </div>

          {live.isPrivate && (
            <span className="live-private-badge">🔒 PRIVADO</span>
          )}

          {live.viewerCount != null && (
            <span className="live-viewer-count">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {live.viewerCount}
            </span>
          )}

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
            </div>
            <span className="live-username">@{username}</span>
            {live.isPrivate && live.entryCost != null && (
              <span className="live-entry-cost" style={{ marginLeft: "auto" }}>🪙 {live.entryCost}</span>
            )}
          </div>
          <div className="live-title">{live.title}</div>
          {live.description && (
            <div className="live-desc">{live.description}</div>
          )}
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

        /* Thumbnail */
        .live-thumb {
          height: 162px;
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
          background: radial-gradient(circle at 50% 50%, rgba(139,92,246,0.1), transparent 65%);
        }

        .live-thumb-badges {
          position: absolute;
          top: 0.65rem;
          left: 0.65rem;
          z-index: 2;
          display: flex;
          gap: 0.35rem;
          align-items: center;
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

        .live-private-badge {
          position: absolute;
          top: 0.65rem;
          right: 0.65rem;
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

        .live-viewer-count {
          position: absolute;
          bottom: 0.65rem;
          right: 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(6,4,17,0.8);
          color: var(--text);
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.22rem 0.6rem;
          border-radius: 999px;
          z-index: 2;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .live-thumb-play {
          font-size: 2.5rem;
          opacity: 0.12;
          position: relative;
          z-index: 1;
          color: var(--text);
        }

        /* Body */
        .live-body {
          padding: 1rem 1.1rem;
        }

        .live-user-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
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
        }

        .live-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }

        .live-username {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-weight: 600;
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
          margin-top: 0.3rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.4;
        }
      `}</style>
    </>
  );
}
