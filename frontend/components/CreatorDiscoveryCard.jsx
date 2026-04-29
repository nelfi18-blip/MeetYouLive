"use client";

import Link from "next/link";

/**
 * Tango-style creator discovery card for public users
 * Shows: creator info, popularity stats, live status, action buttons
 * Hides: private earnings, payouts, agency commission
 */
export default function CreatorDiscoveryCard({ creator }) {
  const displayName = creator.username || creator.name || "Creador";
  const initial = displayName[0]?.toUpperCase() || "C";
  
  const hasAvatar = creator.avatar && typeof creator.avatar === "string" && creator.avatar.trim().length > 0;
  const avatarUrl = hasAvatar ? `${process.env.NEXT_PUBLIC_API_URL}/${creator.avatar}` : null;

  return (
    <div className={`creator-card${creator.isLive ? " creator-card-live" : ""}`}>
      {/* Live badge */}
      {creator.isLive && (
        <div className="creator-live-badge">
          <span className="live-dot" />
          EN VIVO
        </div>
      )}

      {/* Avatar section */}
      <div className="creator-avatar-section">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="creator-avatar-img" />
        ) : (
          <div className="creator-avatar-fallback">{initial}</div>
        )}
        {creator.isPremium && <span className="creator-premium-badge">⭐</span>}
        {creator.isVerifiedCreator && <span className="creator-verified-badge">✓</span>}
      </div>

      {/* Creator info */}
      <div className="creator-info">
        <h3 className="creator-name">@{displayName}</h3>
        
        {/* Public stats */}
        <div className="creator-stats">
          <div className="stat-item">
            <span className="stat-icon">🪙</span>
            <span className="stat-value">{(creator.totalReceivedCoins || 0).toLocaleString()}</span>
            <span className="stat-label">recibido</span>
          </div>

          {creator.superGiftCount > 0 && (
            <div className="stat-item">
              <span className="stat-icon">💎</span>
              <span className="stat-value">{creator.superGiftCount}</span>
              <span className="stat-label">super gifts</span>
            </div>
          )}

          {creator.topFanCount > 0 && (
            <div className="stat-item">
              <span className="stat-icon">⭐</span>
              <span className="stat-value">{creator.topFanCount}</span>
              <span className="stat-label">top fans</span>
            </div>
          )}

          {creator.followersCount > 0 && (
            <div className="stat-item">
              <span className="stat-icon">👥</span>
              <span className="stat-value">{creator.followersCount}</span>
              <span className="stat-label">seguidores</span>
            </div>
          )}
        </div>

        {/* Top gift */}
        {creator.topGift && (
          <div className="top-gift-badge">
            <span className="gift-icon">🎁</span>
            Top: {creator.topGift.name} ({creator.topGift.coinCost} 🪙)
          </div>
        )}

        {/* Live stats */}
        {creator.isLive && creator.viewerCount > 0 && (
          <div className="live-viewers">
            <span className="viewers-icon">👁</span>
            {creator.viewerCount} viendo ahora
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="creator-actions">
        {creator.isLive && creator.currentLiveId ? (
          <Link href={`/live/${creator.currentLiveId}`} className="btn-live">
            🔴 Ver en vivo
          </Link>
        ) : (
          <Link href={`/profile/${creator.userId}`} className="btn-profile">
            Ver perfil
          </Link>
        )}
        <Link href={`/profile/${creator.userId}?gift=true`} className="btn-gift">
          🎁 Regalar
        </Link>
      </div>

      <style jsx>{`
        .creator-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: var(--radius);
          background: linear-gradient(135deg, rgba(20,12,46,0.85) 0%, rgba(15,8,32,0.9) 100%);
          border: 1px solid rgba(139,92,246,0.2);
          transition: all 0.25s ease;
          overflow: hidden;
        }

        .creator-card:hover {
          border-color: rgba(224,64,251,0.45);
          box-shadow: 0 0 25px rgba(224,64,251,0.2);
          transform: translateY(-3px);
        }

        .creator-card-live {
          border-color: rgba(239,68,68,0.4);
          background: linear-gradient(135deg, rgba(30,12,46,0.85) 0%, rgba(20,8,32,0.9) 100%);
        }

        .creator-card-live:hover {
          border-color: rgba(239,68,68,0.6);
          box-shadow: 0 0 28px rgba(239,68,68,0.25);
        }

        .creator-live-badge {
          position: absolute;
          top: 0.6rem;
          right: 0.6rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.25rem 0.6rem;
          background: rgba(239,68,68,0.2);
          border: 1px solid rgba(239,68,68,0.4);
          border-radius: 999px;
          font-size: 0.65rem;
          font-weight: 900;
          letter-spacing: 0.05em;
          color: #ef4444;
          z-index: 2;
        }

        .live-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #ef4444;
          animation: pulseDot 1.4s infinite;
        }

        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .creator-avatar-section {
          position: relative;
          display: flex;
          justify-content: center;
          margin-bottom: 0.25rem;
        }

        .creator-avatar-img,
        .creator-avatar-fallback {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(224,64,251,0.3);
          box-shadow: 0 0 15px rgba(224,64,251,0.2);
        }

        .creator-avatar-fallback {
          background: linear-gradient(135deg, #e040fb 0%, #7c3aed 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 900;
          color: #fff;
        }

        .creator-premium-badge {
          position: absolute;
          top: 0;
          right: calc(50% - 45px);
          font-size: 1.2rem;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
        }

        .creator-verified-badge {
          position: absolute;
          bottom: 2px;
          right: calc(50% - 45px);
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(34,211,238,0.2);
          border: 2px solid #22d3ee;
          color: #22d3ee;
          font-size: 0.7rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          box-shadow: 0 2px 6px rgba(34,211,238,0.3);
        }

        .creator-info {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          text-align: center;
        }

        .creator-name {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .creator-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: center;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.15rem;
          min-width: 60px;
        }

        .stat-icon {
          font-size: 1rem;
        }

        .stat-value {
          font-size: 0.85rem;
          font-weight: 800;
          color: #a78bfa;
        }

        .stat-label {
          font-size: 0.65rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .top-gift-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.35rem 0.7rem;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 700;
          color: #fbbf24;
        }

        .gift-icon {
          font-size: 0.9rem;
        }

        .live-viewers {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.35rem 0.7rem;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #fca5a5;
        }

        .viewers-icon {
          font-size: 0.9rem;
        }

        .creator-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }

        .btn-live,
        .btn-profile,
        .btn-gift {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.6rem;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          border: none;
        }

        .btn-live {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
          box-shadow: 0 0 12px rgba(239,68,68,0.3);
        }

        .btn-live:hover {
          box-shadow: 0 0 18px rgba(239,68,68,0.5);
          transform: translateY(-1px);
        }

        .btn-profile {
          background: rgba(139,92,246,0.15);
          border: 1px solid rgba(139,92,246,0.4);
          color: #c4b5fd;
        }

        .btn-profile:hover {
          background: rgba(139,92,246,0.25);
          border-color: rgba(139,92,246,0.6);
        }

        .btn-gift {
          background: linear-gradient(135deg, #e040fb 0%, #7c3aed 100%);
          color: #fff;
          box-shadow: 0 0 12px rgba(224,64,251,0.3);
        }

        .btn-gift:hover {
          box-shadow: 0 0 18px rgba(224,64,251,0.5);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
