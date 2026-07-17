"use client";

import Link from "next/link";
import FollowButton from "./FollowButton";
import StatusBadges from "./StatusBadges";
import { computeStatusBadges } from "@/lib/statusBadges";
import { isApprovedCreator } from "@/lib/creatorUtils";
import {
  getLiveThumbnail,
  getDisplayName,
  getInitial,
  getGradientForUser,
  getUserImage,
} from "@/lib/imageHelpers";
import { RECENT_LIVE_WINDOW_MS } from "@/lib/liveUi";

function getLiveDuration(live) {
  const startedAt = live?.startedAt || live?.createdAt;
  const startTime = startedAt ? new Date(startedAt).getTime() : NaN;
  if (!Number.isFinite(startTime)) return "Ahora";

  const minutes = Math.max(1, Math.floor((Date.now() - startTime) / 60000));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export default function LiveCard({
  live,
  index = 0,
  token = "",
  variant = "default",
  onShare,
  onGift,
}) {
  if (!live || typeof live !== "object" || !live._id) return null;

  const username = getDisplayName(live.user);
  const initial = getInitial(username);
  const safeTitle = typeof live.title === "string" && live.title.trim() ? live.title.trim() : "Directo en vivo";
  const liveThumb = getLiveThumbnail(live);
  const avatar = getUserImage(live.user);
  const gradient = getGradientForUser(live.user?._id || live._id);
  const safeViewerCount = normalizeNumber(live.viewerCount ?? live.viewers ?? live.viewersCount);
  const safeGiftsTotal = normalizeNumber(live.giftsTotal ?? live.totalCoinsEarned);
  const isCreatorApproved = isApprovedCreator(live.user);
  const liveStartedAt = live.startedAt || live.createdAt;
  const isNew = liveStartedAt ? Date.now() - new Date(liveStartedAt).getTime() < RECENT_LIVE_WINDOW_MS : false;
  const isBattle = live.battle?.active === true || live.isVsActive === true;
  const duration = getLiveDuration(live);
  const profileHref = live.user?._id ? `/profile/${live.user._id}` : "/profile";
  const statusBadges = computeStatusBadges(
    { ...live.user, isLive: true, liveId: live._id },
    { viewerCount: safeViewerCount, giftsTotal: safeGiftsTotal },
  );
  const staggerClass = index < 5 ? `stagger-${index + 1}` : "";

  return (
    <>
      <article className={`live-card ${variant === "featured" ? "featured" : ""} animate-slide-up ${staggerClass}`}>
        <Link href={`/live/${live._id}`} className="live-card-link" aria-label={`Entrar al live ${safeTitle}`}>
          <div className="live-thumb">
            {liveThumb ? (
              <img src={liveThumb} alt={safeTitle} className="live-thumb-img" />
            ) : (
              <div className="live-thumb-fallback">
                <div className="live-thumb-fallback-bg" style={{ background: gradient }} />
                <div className="live-thumb-fallback-glow" />
                <div className="live-thumb-avatar">
                  {avatar ? <img src={avatar} alt={username} /> : initial}
                </div>
                <div className="live-thumb-play-icon">▶</div>
              </div>
            )}

            <div className="live-thumb-shade" />

            <div className="live-thumb-badges">
              <span className="live-badge-enhanced">🔴 EN VIVO</span>
              {live.category && <span className="live-category-tag">{live.category}</span>}
              {isBattle && <span className="live-vs-badge">⚔️ VS</span>}
            </div>

            <div className="live-top-tags">
              {(live.isTrending || safeViewerCount >= 50) && <span className="live-tag-trending">🔥 Popular</span>}
              {isNew && <span className="live-tag-new">✨ Nuevo</span>}
              {live.isVipOnly && <span className="live-tag-vip">💎 VIP</span>}
              {live.isPrivate && <span className="live-tag-private">🔒 Premium</span>}
            </div>

            <div className="live-thumb-stats">
              <span className="live-stat-chip viewer-pulse">👁 {safeViewerCount}</span>
              <span className="live-stat-chip">⏱ {duration}</span>
              {safeGiftsTotal > 0 && <span className="live-stat-chip live-stat-coins">💎 {safeGiftsTotal}</span>}
            </div>
          </div>

          <div className="live-body">
            <div className="live-user-row">
              <div className="live-avatar">
                {avatar ? <img src={avatar} alt={username} className="live-avatar-img" /> : initial}
                <span className="live-avatar-dot" />
              </div>
              <div className="live-user-copy">
                <span className="live-username">@{username}</span>
                <span className="live-user-meta">{safeViewerCount} espectadores · {duration}</span>
              </div>
              {isCreatorApproved && <span className="live-creator-badge">Creator</span>}
            </div>

            {statusBadges.length > 0 && <StatusBadges badges={statusBadges} compact />}

            <div className="live-title">{safeTitle}</div>
            {live.description && <div className="live-desc">{live.description}</div>}
          </div>
        </Link>

        <div className="live-actions" aria-label={`Acciones para ${safeTitle}`}>
          <Link href={`/live/${live._id}`} className="action-primary">
            Entrar
          </Link>
          {live.user?._id && (
            <span className="follow-wrap">
              <FollowButton targetId={String(live.user._id)} token={token} />
            </span>
          )}
          <button type="button" className="action-chip" onClick={() => onShare?.(live)}>
            Compartir
          </button>
          <button type="button" className="action-chip gift" onClick={() => onGift?.(live)}>
            Regalo
          </button>
          <Link href={profileHref} className="action-chip profile">
            Perfil
          </Link>
        </div>
      </article>

      <style jsx>{`
        .live-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(224, 64, 251, 0.18);
          border-radius: var(--radius);
          background:
            radial-gradient(circle at 20% 0%, rgba(224,64,251,0.18), transparent 34%),
            linear-gradient(145deg, rgba(24,10,52,0.92), rgba(8,4,22,0.96));
          box-shadow: 0 18px 45px rgba(0,0,0,0.24), 0 0 30px rgba(139,92,246,0.08);
          transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.2s ease;
        }

        .live-card:hover {
          border-color: rgba(34,211,238,0.38);
          box-shadow: 0 20px 55px rgba(0,0,0,0.32), 0 0 42px rgba(224,64,251,0.2);
          transform: translateY(-4px);
        }

        .live-card.featured .live-thumb { height: 270px; }
        .live-card-link { display: block; color: inherit; text-decoration: none; }

        .live-thumb {
          height: 210px;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #05020d;
        }

        .live-thumb-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scale(1.01);
          transition: transform 0.5s ease;
        }

        .live-card:hover .live-thumb-img { transform: scale(1.06); }

        .live-thumb-shade {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to top, rgba(5,2,13,0.82), rgba(5,2,13,0.08) 55%),
            radial-gradient(circle at 80% 12%, rgba(34,211,238,0.18), transparent 28%);
          z-index: 1;
        }

        .live-thumb-fallback {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
        }

        .live-thumb-fallback-bg,
        .live-thumb-fallback-glow {
          position: absolute;
          inset: 0;
        }

        .live-thumb-fallback-glow {
          background: radial-gradient(circle at 50% 35%, rgba(255,255,255,0.18), transparent 46%);
        }

        .live-thumb-avatar {
          position: relative;
          z-index: 1;
          width: 76px;
          height: 76px;
          border-radius: 50%;
          overflow: hidden;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 900;
          font-size: 1.85rem;
          border: 3px solid rgba(255,255,255,0.32);
          box-shadow: 0 0 26px rgba(224,64,251,0.45);
        }

        .live-thumb-avatar img,
        .live-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .live-thumb-play-icon {
          position: relative;
          z-index: 1;
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          color: #fff;
          background: rgba(255,255,255,0.13);
          border: 1px solid rgba(255,255,255,0.22);
          backdrop-filter: blur(10px);
          animation: playPulse 2.2s ease-in-out infinite;
        }

        @keyframes playPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(224,64,251,0); }
          50% { transform: scale(1.08); box-shadow: 0 0 24px rgba(224,64,251,0.32); }
        }

        .live-thumb-badges,
        .live-top-tags,
        .live-thumb-stats {
          position: absolute;
          z-index: 2;
          display: flex;
          gap: 0.38rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .live-thumb-badges { top: 0.75rem; left: 0.75rem; }
        .live-top-tags { top: 0.75rem; right: 0.75rem; flex-direction: column; align-items: flex-end; }
        .live-thumb-stats { bottom: 0.75rem; left: 0.75rem; right: 0.75rem; justify-content: space-between; }

        .live-category-tag,
        .live-vs-badge,
        .live-tag-trending,
        .live-tag-new,
        .live-tag-vip,
        .live-tag-private,
        .live-stat-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(7,3,18,0.58);
          color: #fff;
          backdrop-filter: blur(12px);
          font-size: 0.68rem;
          font-weight: 850;
          padding: 0.24rem 0.62rem;
          white-space: nowrap;
        }

        .live-tag-trending { color: #fecaca; border-color: rgba(248,113,113,0.36); background: rgba(239,68,68,0.18); }
        .live-tag-new { color: #bae6fd; border-color: rgba(34,211,238,0.35); background: rgba(34,211,238,0.12); }
        .live-tag-vip { color: #fde68a; border-color: rgba(251,191,36,0.42); background: rgba(251,191,36,0.12); }
        .live-tag-private { color: #e9d5ff; border-color: rgba(192,132,252,0.34); background: rgba(139,92,246,0.16); }
        .live-stat-coins { color: #fde68a; }

        .viewer-pulse { animation: viewerPulse 1.8s ease-in-out infinite; }
        @keyframes viewerPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0.28); }
          50% { box-shadow: 0 0 0 5px rgba(34,211,238,0); }
        }

        .live-body {
          padding: 1rem 1rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.48rem;
        }

        .live-user-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .live-avatar {
          position: relative;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          background: var(--grad-primary);
          color: #fff;
          font-weight: 900;
          border: 2px solid rgba(224,64,251,0.45);
        }

        .live-avatar-dot {
          position: absolute;
          right: 1px;
          bottom: 1px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444;
          border: 2px solid #12071f;
          animation: liveDotPulse 1.3s infinite;
        }

        @keyframes liveDotPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.72); opacity: 0.65; }
        }

        .live-user-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.08rem;
          flex: 1;
        }

        .live-username {
          font-size: 0.85rem;
          color: var(--text);
          font-weight: 850;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .live-user-meta {
          font-size: 0.7rem;
          color: var(--text-dim);
          font-weight: 650;
        }

        .live-creator-badge {
          font-size: 0.62rem;
          color: #fde68a;
          background: rgba(251,191,36,0.12);
          border: 1px solid rgba(251,191,36,0.32);
          border-radius: 999px;
          padding: 0.16rem 0.48rem;
          font-weight: 900;
        }

        .live-title {
          font-weight: 900;
          color: var(--text);
          font-size: 1rem;
          line-height: 1.3;
        }

        .live-desc {
          color: var(--text-muted);
          font-size: 0.8rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.42;
        }

        .live-actions {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
          padding: 0 1rem 1rem;
        }

        .action-primary,
        .action-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          text-decoration: none;
          cursor: pointer;
          font-size: 0.76rem;
          font-weight: 850;
          padding: 0.34rem 0.78rem;
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }

        .action-primary {
          background: linear-gradient(135deg, #e040fb, #22d3ee);
          border: none;
          color: #fff;
          box-shadow: 0 0 18px rgba(224,64,251,0.28);
        }

        .action-chip.gift { color: #f0abfc; border-color: rgba(224,64,251,0.28); }
        .action-chip.profile { color: #67e8f9; border-color: rgba(34,211,238,0.25); }

        .action-primary:hover,
        .action-chip:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.09);
          box-shadow: 0 0 16px rgba(139,92,246,0.18);
        }

        .action-primary:hover { background: linear-gradient(135deg, #ec5fff, #38e4ff); }

        .follow-wrap :global(.follow-btn) {
          min-height: 32px;
          padding: 0.34rem 0.78rem;
          font-size: 0.76rem;
        }
      `}</style>
    </>
  );
}
