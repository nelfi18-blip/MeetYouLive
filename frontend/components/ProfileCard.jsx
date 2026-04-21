"use client";

import Link from "next/link";
import Badge from "./Badge";
import GiftButton from "./GiftButton";
import StatusBadges from "./StatusBadges";
import { computeStatusBadges } from "@/lib/statusBadges";

/**
 * Reusable ProfileCard component for the explore/discover section.
 *
 * Props:
 *  - user: { _id, username, name, avatar, bio, role, interests, location,
 *            isLive, liveId, language, languages,
 *            creatorProfile: { privateCallEnabled, pricePerMinute } }
 *  - liked: boolean
 *  - matched: boolean
 *  - onLike: (userId) => void
 *  - onSuperCrush: (userId) => void – optional
 *  - superCrushPrice: number – coin cost shown on button
 *  - onMessage: (userId) => void  – optional, triggers chat creation + nav
 *  - onVideoCall: (userId) => void  – optional (future use)
 *  - onPrivateCall: (userId) => void  – optional, triggers a paid creator call
 *  - loading: boolean
 */
export default function ProfileCard({ user, liked, matched, onLike, onSuperCrush, superCrushPrice, onMessage, onVideoCall, onPrivateCall, loading }) {
  const displayName = user.username || user.name || "Usuario";
  const initial = displayName[0].toUpperCase();
  const isCreator = user.role === "creator";
  const isLive = isCreator && user.isLive && user.liveId;
  const langs = user.languages?.length
    ? user.languages
    : user.language
    ? [user.language]
    : [];
  const privateCallEnabled = isCreator && user.creatorProfile?.privateCallEnabled;
  const pricePerMinute = user.creatorProfile?.pricePerMinute ?? 0;
  const statusBadges = computeStatusBadges(user);

  return (
    <>
      <div className={`profile-card${matched ? " matched" : ""}${isLive ? " creator-live" : ""}`}>
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{user.location}</span>
            </div>
          )}

          {langs.length > 0 && (
            <div className="card-langs">
              <span className="card-langs-icon" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

        {/* Action buttons */}
        <div className="card-actions">
          {/* View creator profile */}
          {isCreator && (
            <Link href={`/creator/${user._id}`} className="action-btn action-profile">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              Ver perfil
            </Link>
          )}

          {/* Watch live */}
          {isLive && (
            <Link href={`/live/${user.liveId}`} className="action-btn action-watch">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              Ver en vivo
            </Link>
          )}

          {/* Super Crush */}
          {onSuperCrush && (
            <button
              className="action-btn action-super-crush"
              onClick={() => onSuperCrush?.(user._id)}
              aria-label={`Super Crush · 🪙${superCrushPrice ?? 50}`}
              title={`Super Crush · 🪙${superCrushPrice ?? 50}`}
              disabled={loading}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              ⚡ {superCrushPrice ?? 50}🪙
            </button>
          )}

          {/* Like */}
          <button
            className={`action-btn action-like${liked ? " liked" : ""}`}
            onClick={() => onLike?.(user._id)}
            aria-label={liked ? "Quitar like" : "Dar like"}
            disabled={loading}
          >
            {liked ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            )}
            {liked ? (matched ? "¡Match!" : "Gustado") : "Me gusta"}
          </button>

          {/* Message */}
          <button
            className="action-btn action-msg"
            onClick={() => onMessage?.(user._id)}
            aria-label="Enviar mensaje"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Mensaje
          </button>

          {/* Private paid call — creators with privateCallEnabled */}
          {privateCallEnabled && (
            <button
              className="action-btn action-paid-call"
              onClick={() => onPrivateCall?.(user._id)}
              aria-label={`Llamada privada · 🪙${pricePerMinute}/min`}
              title={`Llamada privada · 🪙${pricePerMinute}/min`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              🪙{pricePerMinute}/min
            </button>
          )}

          {/* Video call (future use) */}
          <button
            className="action-btn action-call"
            onClick={() => onVideoCall?.(user._id)}
            aria-label="Videollamada – próximamente"
            title="Videollamada – próximamente"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </button>

          {/* Gift — creators only */}
          {isCreator && (
            <div className="card-gift-wrap">
              <GiftButton receiverId={user._id} context="profile" />
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .profile-card {
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

        .profile-card:hover {
          border-color: rgba(224, 64, 251, 0.44);
          box-shadow: var(--shadow), 0 0 12px rgba(224,64,251,0.4), 0 0 24px rgba(224,64,251,0.2);
          transform: translateY(-4px);
        }

        .profile-card.matched {
          border-color: rgba(255, 45, 120, 0.45);
          box-shadow: var(--shadow), 0 0 28px rgba(255, 45, 120, 0.18);
        }

        .profile-card.creator-live {
          border-color: rgba(255, 15, 138, 0.55);
          box-shadow: var(--shadow), 0 0 32px rgba(255, 15, 138, 0.22);
        }

        /* Ribbon (top-right badge) */
        .card-ribbon {
          position: absolute;
          top: 0.55rem;
          right: 0.55rem;
          z-index: 2;
        }

        /* Avatar */
        .card-avatar-wrap {
          position: relative;
          flex-shrink: 0;
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

        /* Body */
        .card-body {
          text-align: center;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
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

        /* Actions */
        .card-actions {
          width: 100%;
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
          margin-top: 0.25rem;
        }

        .action-btn {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.55rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid;
          background: none;
          white-space: nowrap;
          text-decoration: none;
        }

        .action-super-crush {
          width: 100%;
          flex: none;
          background: linear-gradient(135deg, rgba(251,191,36,0.08), rgba(224,64,251,0.08));
          border-color: rgba(251,191,36,0.35);
          color: #fbbf24;
        }
        .action-super-crush:hover {
          background: linear-gradient(135deg, rgba(251,191,36,0.16), rgba(224,64,251,0.16));
          box-shadow: 0 0 14px rgba(251,191,36,0.25);
        }
        .action-super-crush:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-watch {
          width: 100%;
          flex: none;
          background: linear-gradient(135deg, rgba(255,15,138,0.15), rgba(224,64,251,0.15));
          border-color: rgba(255, 15, 138, 0.35);
          color: var(--accent);
        }
        .action-watch:hover {
          background: linear-gradient(135deg, rgba(255,15,138,0.25), rgba(224,64,251,0.25));
          box-shadow: 0 0 16px rgba(255, 15, 138, 0.3);
        }

        .action-profile {
          width: 100%;
          flex: none;
          background: rgba(129,140,248,0.06);
          border-color: rgba(129,140,248,0.25);
          color: var(--accent-3);
        }
        .action-profile:hover {
          background: rgba(129,140,248,0.14);
          border-color: rgba(129,140,248,0.45);
          box-shadow: 0 0 12px rgba(129,140,248,0.2);
        }

        .action-like {
          background: rgba(255, 45, 120, 0.06);
          border-color: rgba(255, 45, 120, 0.25);
          color: var(--text-muted);
        }
        .action-like:hover {
          background: rgba(255, 45, 120, 0.12);
          color: var(--accent);
          border-color: rgba(255, 45, 120, 0.4);
        }
        .action-like.liked {
          background: rgba(255, 45, 120, 0.12);
          border-color: var(--accent);
          color: var(--accent);
        }
        .action-like:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .action-msg {
          background: rgba(129, 140, 248, 0.06);
          border-color: rgba(129, 140, 248, 0.2);
          color: var(--text-muted);
        }
        .action-msg:hover {
          background: rgba(129, 140, 248, 0.12);
          color: var(--accent-3);
          border-color: rgba(129, 140, 248, 0.4);
        }

        .action-paid-call {
          flex: 1;
          min-width: 0;
          background: rgba(99,102,241,0.08);
          border-color: rgba(99,102,241,0.3);
          color: #a5b4fc;
        }
        .action-paid-call:hover {
          background: rgba(99,102,241,0.18);
          border-color: rgba(99,102,241,0.55);
          box-shadow: 0 0 12px rgba(99,102,241,0.25);
        }

        .action-call {
          flex: 0 0 auto;
          padding: 0.55rem 0.65rem;
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.1);
          color: var(--text-dim);
        }
        .action-call:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-muted);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .card-gift-wrap {
          width: 100%;
        }

        .card-gift-wrap :global(.gift-btn-wrap) {
          width: 100%;
        }

        .card-gift-wrap :global(.gift-trigger-btn) {
          width: 100%;
          justify-content: center;
        }
      `}</style>
    </>
  );
}
