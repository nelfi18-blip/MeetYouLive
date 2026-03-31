/**
 * ProfileCard – card for a user/creator in the discover feed.
 *
 * Props:
 *   user        – user object { _id, username, name, avatar, bio, location, role,
 *                               creatorStatus, isLive, liveId, languages, isOnline }
 *   liked       – bool, whether current user has liked this profile
 *   matched     – bool, whether this is a mutual match
 *   onLike      – () => void
 *   onMessage   – () => void  (optional; if omitted button is hidden)
 *   onVideoCall – () => void  (optional; future use)
 */
import Link from "next/link";
import Badge from "./Badge";

export default function ProfileCard({ user, liked, matched, onLike, onMessage, onVideoCall }) {
  const displayName = user.username || user.name || "Usuario";
  const initial = displayName[0].toUpperCase();
  const isCreator = user.role === "creator";
  const isLive = isCreator && user.isLive && user.liveId;

  return (
    <>
      <div className={`profile-card${matched ? " pc-matched" : ""}${isLive ? " pc-live" : ""}`}>
        {/* ── Top ribbons ─────────────────── */}
        {matched && (
          <div className="pc-ribbon pc-ribbon-match">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
            Match!
          </div>
        )}
        {isLive && !matched && (
          <Badge variant="live" className="pc-top-badge" />
        )}

        {/* ── Avatar ──────────────────────── */}
        <div className="pc-avatar-wrap">
          {user.avatar ? (
            <img src={user.avatar} alt={displayName} className="pc-avatar-img" />
          ) : (
            <div className="pc-avatar-placeholder">{initial}</div>
          )}
          {isLive && (
            <span className="pc-avatar-live">
              <span className="pc-live-dot" />LIVE
            </span>
          )}
        </div>

        {/* ── Info body ───────────────────── */}
        <div className="pc-body">
          <div className="pc-name">{displayName}</div>

          {/* Badges row */}
          <div className="pc-badges">
            {isCreator && <Badge variant="creator" />}
            {user.isVerifiedCreator && <Badge variant="verified" />}
          </div>

          {/* Online / live status */}
          <div className="pc-status-row">
            {isLive ? (
              <span className="pc-status pc-status-live">
                <span className="pc-dot pc-dot-live" />
                En vivo
              </span>
            ) : user.isOnline ? (
              <span className="pc-status pc-status-online">
                <span className="pc-dot pc-dot-online" />
                En línea
              </span>
            ) : null}
          </div>

          {/* Languages */}
          {user.languages?.length > 0 && (
            <div className="pc-languages">
              {user.languages.slice(0, 3).map((lang) => (
                <span key={lang} className="pc-lang-tag">{lang}</span>
              ))}
            </div>
          )}

          {user.location && (
            <div className="pc-location">📍 {user.location}</div>
          )}

          {user.bio && <p className="pc-bio">{user.bio}</p>}

          {user.interests?.length > 0 && (
            <div className="pc-interests">
              {user.interests.slice(0, 3).map((i) => (
                <span key={i} className="pc-interest-tag">{i}</span>
              ))}
            </div>
          )}
        </div>

        {/* ── Action buttons ──────────────── */}
        <div className="pc-actions">
          {/* Watch live – only for live creators */}
          {isLive && (
            <Link href={`/live/${user.liveId}`} className="pc-btn pc-btn-live">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              Ver en vivo
            </Link>
          )}

          {/* Message – optional handler */}
          {onMessage && (
            <button className="pc-btn pc-btn-msg" onClick={onMessage} aria-label="Enviar mensaje">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              Mensaje
            </button>
          )}

          {/* Video call – future use; always rendered if handler provided */}
          {onVideoCall && (
            <button className="pc-btn pc-btn-call" onClick={onVideoCall} aria-label="Videollamada" title="Próximamente">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
            </button>
          )}

          {/* Like button */}
          <button
            className={`pc-btn pc-btn-like${liked ? " liked" : ""}`}
            onClick={onLike}
            aria-label={liked ? "Quitar like" : "Dar like"}
          >
            {liked ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
            )}
            {liked ? (matched ? "¡Match!" : "Gustado") : "Me gusta"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .profile-card {
          background: rgba(15,8,32,0.75);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 1.5rem 1.1rem 1.1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          position: relative;
          transition: transform 0.35s cubic-bezier(0.4,0,0.2,1),
                      box-shadow 0.35s cubic-bezier(0.4,0,0.2,1),
                      border-color 0.2s ease;
        }
        .profile-card:hover {
          border-color: rgba(255,45,120,0.3);
          box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 22px rgba(255,45,120,0.1);
          transform: translateY(-3px);
        }
        .pc-matched {
          border-color: rgba(255,45,120,0.45);
          box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 26px rgba(255,45,120,0.18);
        }
        .pc-live {
          border-color: rgba(255,15,138,0.55);
          box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 30px rgba(255,15,138,0.22);
        }

        /* Ribbons */
        .pc-ribbon {
          position: absolute;
          top: 0.55rem;
          right: 0.55rem;
          font-size: 0.6rem;
          font-weight: 800;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          letter-spacing: 0.04em;
        }
        .pc-ribbon-match {
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          color: #fff;
          box-shadow: 0 2px 10px rgba(255,45,120,0.45);
        }
        .pc-top-badge {
          position: absolute !important;
          top: 0.55rem !important;
          right: 0.55rem !important;
        }

        /* Avatar */
        .pc-avatar-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .pc-avatar-img {
          width: 84px;
          height: 84px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(255,45,120,0.25);
        }
        .pc-avatar-placeholder {
          width: 84px;
          height: 84px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 50%, #818cf8 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.9rem;
          font-weight: 800;
          color: #fff;
        }
        .pc-avatar-live {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #ff0f8a, #e040fb);
          color: #fff;
          font-size: 0.55rem;
          font-weight: 800;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          white-space: nowrap;
          letter-spacing: 0.06em;
        }
        .pc-live-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #fff;
          display: inline-block;
          animation: pc-dot-blink 1s ease-in-out infinite;
        }
        @keyframes pc-dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }

        /* Body */
        .pc-body {
          text-align: center;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
        }
        .pc-name {
          font-weight: 700;
          font-size: 0.95rem;
          color: #F4F0FF;
        }
        .pc-badges {
          display: flex;
          gap: 0.35rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        /* Status */
        .pc-status-row { min-height: 18px; }
        .pc-status {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .pc-status-online { color: #34d399; }
        .pc-status-live    { color: #ff2d78; }
        .pc-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .pc-dot-online { background: #34d399; }
        .pc-dot-live   { background: #ff2d78; animation: pc-dot-blink 1s ease-in-out infinite; }

        /* Languages */
        .pc-languages {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
          justify-content: center;
        }
        .pc-lang-tag {
          font-size: 0.62rem;
          padding: 0.18rem 0.5rem;
          border-radius: 999px;
          background: rgba(129,140,248,0.1);
          border: 1px solid rgba(129,140,248,0.2);
          color: #818cf8;
          font-weight: 600;
        }

        .pc-location {
          font-size: 0.72rem;
          color: #9585b8;
        }

        .pc-bio {
          font-size: 0.77rem;
          color: #9585b8;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0;
        }

        .pc-interests {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
          justify-content: center;
        }
        .pc-interest-tag {
          font-size: 0.62rem;
          padding: 0.18rem 0.5rem;
          border-radius: 999px;
          background: rgba(224,64,251,0.08);
          border: 1px solid rgba(224,64,251,0.15);
          color: #e040fb;
          font-weight: 600;
        }

        /* Actions */
        .pc-actions {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          width: 100%;
          margin-top: 0.25rem;
        }

        .pc-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.6rem;
          border-radius: 14px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          text-decoration: none;
          color: inherit;
        }

        .pc-btn-live {
          background: linear-gradient(135deg, rgba(255,15,138,0.15), rgba(224,64,251,0.15));
          border: 1px solid rgba(255,15,138,0.35);
          color: #ff2d78;
        }
        .pc-btn-live:hover {
          background: linear-gradient(135deg, rgba(255,15,138,0.28), rgba(224,64,251,0.28));
          box-shadow: 0 0 18px rgba(255,15,138,0.32);
        }

        .pc-btn-msg {
          background: rgba(129,140,248,0.08);
          border: 1px solid rgba(129,140,248,0.2);
          color: #818cf8;
        }
        .pc-btn-msg:hover {
          background: rgba(129,140,248,0.16);
          box-shadow: 0 0 14px rgba(129,140,248,0.25);
        }

        .pc-btn-call {
          width: auto;
          padding: 0.6rem 1rem;
          background: rgba(34,211,238,0.08);
          border: 1px solid rgba(34,211,238,0.2);
          color: #22d3ee;
          border-radius: 14px;
          flex-shrink: 0;
          align-self: stretch;
        }
        .pc-btn-call:hover {
          background: rgba(34,211,238,0.16);
          box-shadow: 0 0 14px rgba(34,211,238,0.25);
        }

        .pc-btn-like {
          background: rgba(255,45,120,0.07);
          border: 1px solid rgba(255,45,120,0.22);
          color: #9585b8;
        }
        .pc-btn-like:hover {
          background: rgba(255,45,120,0.14);
          color: #ff2d78;
          border-color: rgba(255,45,120,0.4);
        }
        .pc-btn-like.liked {
          background: rgba(255,45,120,0.14);
          border-color: #ff2d78;
          color: #ff2d78;
        }

        /* Row layout when message + like sit side by side */
        .pc-actions:has(.pc-btn-msg) .pc-btn-like {
          flex: 1;
        }
      `}</style>
    </>
  );
}
