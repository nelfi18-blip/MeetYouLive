/**
 * LiveCard – card for a live stream.
 *
 * Props:
 *   live  – live stream object { _id, title, description, user, viewerCount, isPrivate, entryCost, category }
 */
import Link from "next/link";
import Badge from "./Badge";

export default function LiveCard({ live }) {
  const username = live.user?.username || "anónimo";
  const initial = username[0].toUpperCase();

  return (
    <>
      <Link href={`/live/${live._id}`} className="live-card">
        <div className="lc-thumb">
          <Badge variant="live" />
          {live.isPrivate && (
            <span className="lc-private">🔒 {live.entryCost} 🪙</span>
          )}
          {live.viewerCount != null && (
            <span className="lc-viewers">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {live.viewerCount}
            </span>
          )}
          <div className="lc-play">▶</div>
        </div>

        <div className="lc-body">
          <div className="lc-user-row">
            <div className="lc-avatar">{initial}</div>
            <span className="lc-username">@{username}</span>
          </div>
          <div className="lc-title">{live.title}</div>
          {live.description && (
            <div className="lc-desc">{live.description}</div>
          )}
        </div>
      </Link>

      <style jsx>{`
        .live-card {
          display: block;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(30,12,60,0.9) 0%, rgba(12,5,25,0.95) 100%);
          transition: transform 0.35s cubic-bezier(0.4,0,0.2,1),
                      box-shadow 0.35s cubic-bezier(0.4,0,0.2,1),
                      border-color 0.2s ease;
          cursor: pointer;
          text-decoration: none;
          color: inherit;
        }
        .live-card:hover {
          border-color: rgba(139,92,246,0.45);
          box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 28px rgba(139,92,246,0.22);
          transform: translateY(-4px);
        }

        .lc-thumb {
          background: linear-gradient(135deg, rgba(22,12,45,0.9), rgba(35,16,70,0.95), rgba(15,8,32,1));
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .lc-thumb::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, rgba(139,92,246,0.08), transparent 65%);
        }
        .lc-thumb :global(.badge-root) {
          position: absolute;
          top: 0.65rem;
          left: 0.65rem;
          z-index: 2;
        }

        .lc-private {
          position: absolute;
          top: 0.65rem;
          right: 0.65rem;
          z-index: 2;
          background: rgba(139,92,246,0.85);
          color: #fff;
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          padding: 0.22rem 0.65rem;
          border-radius: 999px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(139,92,246,0.5);
        }

        .lc-viewers {
          position: absolute;
          bottom: 0.65rem;
          right: 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(6,4,17,0.8);
          color: #F4F0FF;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.22rem 0.6rem;
          border-radius: 999px;
          z-index: 2;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .lc-play {
          font-size: 2.5rem;
          opacity: 0.12;
          position: relative;
          z-index: 1;
          color: #F4F0FF;
        }

        .lc-body { padding: 1rem 1.1rem; }

        .lc-user-row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin-bottom: 0.5rem;
        }

        .lc-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff2d78 0%, #e040fb 50%, #818cf8 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.75rem;
          flex-shrink: 0;
        }

        .lc-username {
          font-size: 0.78rem;
          color: #9585b8;
          font-weight: 600;
        }

        .lc-title {
          font-weight: 700;
          color: #F4F0FF;
          font-size: 0.95rem;
          line-height: 1.35;
        }

        .lc-desc {
          color: #9585b8;
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
