"use client";

import Link from "next/link";
import Badge from "./Badge";
import StatusBadges from "./StatusBadges";
import InteractionButton from "./InteractionButton";
import { computeStatusBadges } from "@/lib/statusBadges";

/**
 * PremiumProfileCard - Enhanced ProfileCard with InteractionButton system
 *
 * Props:
 *  - user: { _id, username, name, avatar, bio, role, interests, location,
 *            isLive, liveId, language, languages,
 *            creatorProfile: { privateCallEnabled, pricePerMinute } }
 *  - liked: boolean
 *  - matched: boolean
 *  - onLike: (userId) => void - SPARK action
 *  - onPass: (userId) => void - FADE action
 *  - onSuperCrush: (userId) => void - MAGNET action
 *  - onBoost: (userId) => void - PULSE action  
 *  - onFlashLive: (userId) => void - FLASH LIVE action
 *  - superCrushPrice: number – coin cost shown on button
 *  - boostPrice: number - coin cost for boost
 *  - loading: boolean
 */
export default function PremiumProfileCard({
  user,
  liked,
  matched,
  onLike,
  onPass,
  onSuperCrush,
  onBoost,
  onFlashLive,
  superCrushPrice = 50,
  boostPrice = 100,
  loading
}) {
  // Defensive: never render admin or moderator cards publicly
  if (!user || user.role === "admin" || user.role === "moderator") {
    return null;
  }

  const displayName = user.username || user.name || "Usuario";
  const initial = displayName[0].toUpperCase();
  const isCreator = user.role === "creator" || user.role === "subCreator";
  const isLive = isCreator && user.isLive && user.liveId;
  const langs = user.languages?.length
    ? user.languages
    : user.language
    ? [user.language]
    : [];
  const privateCallEnabled = isCreator && user.creatorProfile?.privateCallEnabled;
  const statusBadges = computeStatusBadges(user);

  return (
    <>
      <div className={`premium-profile-card${matched ? " matched" : ""}${isLive ? " creator-live" : ""}`}>
        {/* Top badges */}
        {matched && (
          <div className="card-ribbon">
            <Badge variant="match">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              Match!
            </Badge>
          </div>
        )}
        {isLive && !matched && (
          <div className="card-ribbon">
            <Badge variant="live" pulse>EN VIVO</Badge>
          </div>
        )}

        {/* Link to profile */}
        <Link href={isCreator ? `/creator/${user._id}` : `/profile/${user._id}`} className="card-link-overlay" aria-label={`Ver perfil de ${displayName}`} />

        {/* Avatar */}
        <div className="card-avatar-wrap">
          {user.avatar ? (
            <img src={user.avatar} alt={displayName} className="card-avatar-img" />
          ) : (
            <div className="card-avatar-placeholder">{initial}</div>
          )}
          {isLive && (
            <span className="avatar-live-dot">
              <Badge variant="live">LIVE</Badge>
            </span>
          )}
        </div>

        {/* Body */}
        <div className="card-body">
          <div className="card-name">{displayName}</div>

          <div className="card-badges-row">
            {isCreator && <Badge variant="creator">CREATOR</Badge>}
            {user.isVerified && <Badge variant="verified">✓ Verificado</Badge>}
            <StatusBadges badges={statusBadges} compact />
          </div>

          {user.location && (
            <div className="card-location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{user.location}</span>
            </div>
          )}

          {langs.length > 0 && (
            <div className="card-langs">
              <span className="card-langs-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />
                </svg>
              </span>
              <span className="card-langs-list">{langs.slice(0, 3).join(" · ")}</span>
            </div>
          )}

          {user.bio && <p className="card-bio">{user.bio}</p>}

          {user.interests?.length > 0 && (
            <div className="card-interests">
              {user.interests.slice(0, 3).map((tag) => (
                <span key={tag} className="card-interest-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Premium Interaction Buttons */}
        <div className="card-premium-actions">
          <div className="actions-row">
            {/* FADE - Pass */}
            <div style={{ flex: '0 0 auto' }}>
              <InteractionButton
                variant="fade"
                label="FADE"
                onClick={() => onPass?.(user._id)}
                disabled={loading}
                className="action-compact"
              />
            </div>

            {/* SPARK - Like */}
            <div style={{ flex: '1 1 auto' }}>
              <InteractionButton
                variant="spark"
                label={liked ? (matched ? "MATCH" : "LIKED") : "SPARK"}
                onClick={() => onLike?.(user._id)}
                disabled={loading || liked}
                className="action-expanded"
              />
            </div>

            {/* MAGNET - Super Crush */}
            <div style={{ flex: '0 0 auto' }}>
              <InteractionButton
                variant="magnet"
                label="MAGNET"
                coinCost={superCrushPrice}
                onClick={() => onSuperCrush?.(user._id)}
                disabled={loading}
                className="action-compact"
              />
            </div>
          </div>

          {/* Secondary actions */}
          <div className="actions-row-secondary">
            {/* FLASH LIVE - Video Call */}
            {privateCallEnabled && (
              <div style={{ flex: '1 1 auto' }}>
                <InteractionButton
                  variant="flash-live"
                  label="FLASH"
                  onClick={() => onFlashLive?.(user._id)}
                  disabled={loading}
                  className="action-secondary"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .premium-profile-card {
          background: rgba(20, 12, 46, 0.8);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(224, 64, 251, 0.2);
          border-radius: var(--radius);
          padding: 1.5rem 1.1rem 1.1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          position: relative;
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                      box-shadow 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                      border-color 0.2s ease;
        }

        .premium-profile-card:hover {
          border-color: rgba(224, 64, 251, 0.44);
          box-shadow: var(--shadow), 0 0 12px rgba(224,64,251,0.4), 0 0 24px rgba(224,64,251,0.2);
          transform: translateY(-4px);
        }

        .premium-profile-card.matched {
          border-color: rgba(255, 45, 120, 0.45);
          box-shadow: var(--shadow), 0 0 28px rgba(255, 45, 120, 0.18);
        }

        .premium-profile-card.creator-live {
          border-color: rgba(255, 15, 138, 0.55);
          box-shadow: var(--shadow), 0 0 32px rgba(255, 15, 138, 0.22);
        }

        /* Link overlay for clicking card */}
        .card-link-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 90px; /* Don't cover actions */
          z-index: 1;
        }

        /* Ribbon (top-right badge) */}
        .card-ribbon {
          position: absolute;
          top: 0.55rem;
          right: 0.55rem;
          z-index: 2;
        }

        /* Avatar */}
        .card-avatar-wrap {
          position: relative;
          flex-shrink: 0;
          z-index: 2;
        }

        .card-avatar-img {
          width: 82px;
          height: 82px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(255, 45, 120, 0.22);
          box-shadow: 0 0 0 4px rgba(255, 45, 120, 0.06);
        }

        .card-avatar-placeholder {
          width: 82px;
          height: 82px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.9rem;
          font-weight: 800;
          color: #fff;
          box-shadow: 0 0 0 4px rgba(255, 45, 120, 0.1);
        }

        .avatar-live-dot {
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
        }

        /* Body */}
        .card-body {
          text-align: center;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          z-index: 2;
        }

        .card-name {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text);
        }

        .card-badges-row {
          display: flex;
          gap: 0.35rem;
          flex-wrap: wrap;
          justify-content: center;
          min-height: 0;
        }

        .card-location {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          color: var(--text-muted);
        }

        .card-langs {
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }

        .card-langs-icon {
          color: var(--accent-cyan);
          display: inline-flex;
        }

        .card-langs-list {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .card-bio {
          font-size: 0.77rem;
          color: var(--text-muted);
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0;
        }

        .card-interests {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
          justify-content: center;
        }

        .card-interest-tag {
          font-size: 0.62rem;
          padding: 0.18rem 0.52rem;
          border-radius: 999px;
          background: rgba(224, 64, 251, 0.08);
          border: 1px solid rgba(224, 64, 251, 0.15);
          color: var(--accent-2);
          font-weight: 600;
        }

        /* Premium Actions */}
        .card-premium-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.5rem;
          z-index: 3;
          position: relative;
        }

        .actions-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .actions-row-secondary {
          display: flex;
          gap: 0.5rem;
        }

        .premium-profile-card :global(.action-compact) {
          min-width: 50px !important;
          padding: 0.75rem 0.5rem !important;
        }

        .premium-profile-card :global(.action-expanded) {
          width: 100%;
          min-width: 0 !important;
        }

        .premium-profile-card :global(.action-secondary) {
          width: 100%;
          min-width: 0 !important;
        }

        .premium-profile-card :global(.interaction-label) {
          font-size: 0.65rem !important;
        }
      `}</style>
    </>
  );
}
