"use client";

import Link from "next/link";
import { useState } from "react";
import FeedMonetizationActions from "./FeedMonetizationActions";
import { getUserPhotoSelection } from "@/lib/imageHelpers";

/**
 * MatchCard component - Tinder-style card for dating profiles
 * 
 * Props:
 *  - user: { _id, username, name, avatar, bio, birthdate, location, interests, tags, profilePhotos, role }
 *  - onLike: (userId) => void
 *  - onSkip: (userId) => void
 *  - onChat: (userId) => void (for matches only)
 *  - isMatch: boolean
 *  - hooks: { visitCount, hasGreeting, isLiveNow, liveId }
 *  - onSendGift: (userId, liveId?) => void
 *  - onSendGreeting: (userId) => void
 *  - onUnlockChat: (userId) => void
 *  - onJoinLive: (liveId) => void
 */
export default function MatchCard({ 
  user, 
  onLike, 
  onSkip, 
  onChat, 
  isMatch, 
  hooks = {},
  onSendGift,
  onSendGreeting,
  onUnlockChat,
  onJoinLive,
}) {
  const [imageIndex, setImageIndex] = useState(0);

  if (!user || !user._id) return null;

  const displayName = user.username || user.name || "Usuario";
  const age = user.birthdate ? calculateAge(user.birthdate) : null;
  const tags = user.tags || [];
  const photos = getUserPhotoSelection(user).photos;

  const currentPhoto = photos[imageIndex] || null;
  const hasMultiplePhotos = photos.length > 1;
  const isCreator = user.role === "creator" || user.role === "subCreator";

  const handlePrevPhoto = (e) => {
    e.stopPropagation();
    if (hasMultiplePhotos && imageIndex > 0) {
      setImageIndex(imageIndex - 1);
    }
  };

  const handleNextPhoto = (e) => {
    e.stopPropagation();
    if (hasMultiplePhotos && imageIndex < photos.length - 1) {
      setImageIndex(imageIndex + 1);
    }
  };

  return (
    <>
      <div className="match-card">
        {/* Photo Container */}
        <div className="match-photo-container">
          {currentPhoto ? (
            <img src={currentPhoto} alt={displayName} className="match-photo" />
          ) : (
            <div className="match-photo-placeholder">
              <div className="placeholder-initial">{displayName[0]?.toUpperCase()}</div>
            </div>
          )}

          {/* Photo navigation dots */}
          {hasMultiplePhotos && (
            <div className="photo-nav-dots">
              {photos.map((_, idx) => (
                <span
                  key={idx}
                  className={`photo-dot ${idx === imageIndex ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageIndex(idx);
                  }}
                />
              ))}
            </div>
          )}

          {/* Photo navigation areas */}
          {hasMultiplePhotos && (
            <>
              {imageIndex > 0 && (
                <div className="photo-nav-area left" onClick={handlePrevPhoto}>
                  <span className="nav-arrow">‹</span>
                </div>
              )}
              {imageIndex < photos.length - 1 && (
                <div className="photo-nav-area right" onClick={handleNextPhoto}>
                  <span className="nav-arrow">›</span>
                </div>
              )}
            </>
          )}

          {/* Hooks overlay (top-right) */}
          {(hooks.visitCount > 0 || hooks.hasGreeting || hooks.isLiveNow) && (
            <div className="match-hooks">
              {hooks.isLiveNow && (
                <div className="hook-badge live-badge">
                  🔴 En vivo ahora
                </div>
              )}
              {hooks.visitCount > 0 && (
                <div className="hook-badge visit-badge">
                  👁️ Te visitó {hooks.visitCount}x
                </div>
              )}
              {hooks.hasGreeting && (
                <div className="hook-badge greeting-badge">
                  👋 Te envió un saludo
                </div>
              )}
            </div>
          )}

          {/* Info overlay (bottom) */}
          <div className="match-info-overlay">
            <div className="match-name-row">
              <h3 className="match-name">
                {displayName}
                {age && <span className="match-age">, {age}</span>}
              </h3>
            </div>

            {user.location && (
              <div className="match-location">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{user.location}</span>
              </div>
            )}

            {tags.length > 0 && (
              <div className="match-tags">
                {tags.map((tag, idx) => (
                  <span key={idx} className="match-tag">{tag}</span>
                ))}
              </div>
            )}

            {user.bio && (
              <p className="match-bio">{user.bio}</p>
            )}

            {user.interests && user.interests.length > 0 && (
              <div className="match-interests">
                {user.interests.slice(0, 3).map((interest, idx) => (
                  <span key={idx} className="match-interest-badge">{interest}</span>
                ))}
              </div>
            )}

            {/* Monetization actions */}
            {(onSendGift || onSendGreeting || onUnlockChat || onJoinLive) && (
              <FeedMonetizationActions
                userId={user._id}
                isLive={hooks.isLiveNow || false}
                liveId={hooks.liveId}
                isCreator={isCreator}
                onSendGift={onSendGift}
                onSendGreeting={onSendGreeting}
                onUnlockChat={onUnlockChat}
                onJoinLive={onJoinLive}
                compact
              />
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="match-actions">
          <button
            className="match-action-btn skip-btn"
            onClick={() => onSkip && onSkip(user._id)}
            title="Skip"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <button
            className="match-action-btn like-btn"
            onClick={() => onLike && onLike(user._id)}
            title="Like"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </button>

          {isMatch && (
            <button
              className="match-action-btn chat-btn"
              onClick={() => onChat && onChat(user._id)}
              title="Chat"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .match-card {
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
          position: relative;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          background: linear-gradient(135deg, rgba(30,12,60,0.95) 0%, rgba(12,5,25,1) 100%);
        }

        .match-photo-container {
          position: relative;
          width: 100%;
          aspect-ratio: 3 / 4;
          overflow: hidden;
        }

        .match-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .match-photo-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(224,64,251,0.3));
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .placeholder-initial {
          font-size: 6rem;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.6);
        }

        /* Photo navigation */
        .photo-nav-dots {
          position: absolute;
          top: 1rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 0.4rem;
          z-index: 10;
        }

        .photo-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          transition: all 0.2s;
        }

        .photo-dot.active {
          background: rgba(255, 255, 255, 0.95);
          transform: scale(1.2);
        }

        .photo-nav-area {
          position: absolute;
          top: 0;
          bottom: 25%;
          width: 40%;
          display: flex;
          align-items: center;
          cursor: pointer;
          z-index: 5;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .photo-nav-area:hover {
          opacity: 1;
        }

        .photo-nav-area.left {
          left: 0;
          justify-content: flex-start;
          padding-left: 1rem;
          background: linear-gradient(to right, rgba(0,0,0,0.3), transparent);
        }

        .photo-nav-area.right {
          right: 0;
          justify-content: flex-end;
          padding-right: 1rem;
          background: linear-gradient(to left, rgba(0,0,0,0.3), transparent);
        }

        .nav-arrow {
          font-size: 3rem;
          color: white;
          font-weight: bold;
          text-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }

        /* Hooks overlay */
        .match-hooks {
          position: absolute;
          top: 3.5rem;
          right: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          z-index: 10;
        }

        .hook-badge {
          font-size: 0.7rem;
          font-weight: 800;
          padding: 0.4rem 0.8rem;
          border-radius: 999px;
          backdrop-filter: blur(10px);
          white-space: nowrap;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        }

        .live-badge {
          background: linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9));
          color: white;
          animation: livePulse 2s ease-in-out infinite;
        }

        @keyframes livePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 2px 12px rgba(239,68,68,0.4); }
          50% { transform: scale(1.05); box-shadow: 0 4px 20px rgba(239,68,68,0.7); }
        }

        .visit-badge {
          background: rgba(139,92,246,0.9);
          color: white;
        }

        .greeting-badge {
          background: rgba(251,191,36,0.9);
          color: rgba(15,8,32,1);
        }

        /* Info overlay */
        .match-info-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 2rem 1.5rem 1.5rem;
          background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
          color: white;
        }

        .match-name-row {
          display: flex;
          align-items: baseline;
          margin-bottom: 0.5rem;
        }

        .match-name {
          font-size: 1.8rem;
          font-weight: 800;
          color: white;
          margin: 0;
          text-shadow: 0 2px 8px rgba(0,0,0,0.6);
        }

        .match-age {
          font-size: 1.6rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .match-location {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.85);
          margin-bottom: 0.6rem;
        }

        .match-tags {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 0.6rem;
        }

        .match-tag {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          background: rgba(139,92,246,0.3);
          border: 1px solid rgba(139,92,246,0.5);
          color: #c4b5fd;
        }

        .match-bio {
          font-size: 0.9rem;
          line-height: 1.4;
          color: rgba(255, 255, 255, 0.9);
          margin: 0.5rem 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .match-interests {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
          margin-top: 0.6rem;
        }

        .match-interest-badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        /* Action buttons */
        .match-actions {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1.5rem;
          padding: 1.5rem;
        }

        .match-action-btn {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .match-action-btn:hover {
          transform: scale(1.1);
        }

        .match-action-btn:active {
          transform: scale(0.95);
        }

        .skip-btn {
          background: linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.2));
          border: 2px solid rgba(239,68,68,0.6);
        }

        .skip-btn svg {
          stroke: #fca5a5;
        }

        .skip-btn:hover {
          background: linear-gradient(135deg, rgba(239,68,68,0.3), rgba(220,38,38,0.3));
          border-color: rgba(239,68,68,0.9);
          box-shadow: 0 6px 20px rgba(239,68,68,0.4);
        }

        .like-btn {
          background: linear-gradient(135deg, rgba(224,64,251,0.25), rgba(139,92,246,0.25));
          border: 2px solid rgba(224,64,251,0.6);
          width: 72px;
          height: 72px;
        }

        .like-btn svg {
          fill: #e040fb;
        }

        .like-btn:hover {
          background: linear-gradient(135deg, rgba(224,64,251,0.4), rgba(139,92,246,0.4));
          border-color: rgba(224,64,251,1);
          box-shadow: 0 6px 24px rgba(224,64,251,0.5);
        }

        .chat-btn {
          background: linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.2));
          border: 2px solid rgba(34,197,94,0.6);
        }

        .chat-btn svg {
          stroke: #86efac;
        }

        .chat-btn:hover {
          background: linear-gradient(135deg, rgba(34,197,94,0.3), rgba(22,163,74,0.3));
          border-color: rgba(34,197,94,0.9);
          box-shadow: 0 6px 20px rgba(34,197,94,0.4);
        }

        @media (max-width: 768px) {
          .match-card {
            max-width: 100%;
            border-radius: 12px;
          }

          .match-name {
            font-size: 1.5rem;
          }

          .match-age {
            font-size: 1.3rem;
          }

          .match-action-btn {
            width: 56px;
            height: 56px;
          }

          .like-btn {
            width: 64px;
            height: 64px;
          }
        }
      `}</style>
    </>
  );
}

function calculateAge(birthdate) {
  if (!birthdate) return null;
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age > 0 ? age : null;
}
