"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/Badge";
import MatchModal from "@/components/MatchModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const USERS_PER_PAGE = 20;

// ─── Icons ────────────────────────────────────────────────────────────────────
function PassIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function HeartIcon({ filled = false }) {
  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────
function SwipeCard({ user, onPass, onLike, onSuperCrush, superCrushPrice, actionLoading }) {
  const cardRef = useRef(null);
  const startXRef = useRef(null);
  const startYRef = useRef(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [dragging, setDragging] = useState(false);

  const displayName = user.username || user.name || "Usuario";
  const isCreator = user.role === "creator";
  const isLive = isCreator && user.isLive && user.liveId;
  const privateCallEnabled = isCreator && user.creatorProfile?.privateCallEnabled;
  const pricePerMinute = user.creatorProfile?.pricePerMinute ?? 0;

  // Touch/mouse drag support
  const getClientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);
  const getClientY = (e) => (e.touches ? e.touches[0].clientY : e.clientY);

  const onDragStart = (e) => {
    startXRef.current = getClientX(e);
    startYRef.current = getClientY(e);
    setDragging(true);
  };

  const onDragMove = (e) => {
    if (startXRef.current === null) return;
    const dx = getClientX(e) - startXRef.current;
    setDragDelta(dx);
  };

  const onDragEnd = () => {
    if (startXRef.current === null) return;
    const threshold = 80;
    if (dragDelta > threshold) {
      onLike(user._id);
    } else if (dragDelta < -threshold) {
      onPass(user._id);
    }
    startXRef.current = null;
    startYRef.current = null;
    setDragDelta(0);
    setDragging(false);
  };

  const rotation = dragDelta / 18;
  const likeOpacity = Math.min(dragDelta / 80, 1);
  const passOpacity = Math.min(-dragDelta / 80, 1);

  return (
    <div
      ref={cardRef}
      className={`swipe-card${dragging ? " dragging" : ""}`}
      style={{
        transform: `translateX(${dragDelta}px) rotate(${rotation}deg)`,
        transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
      }}
      onMouseDown={onDragStart}
      onMouseMove={dragging ? onDragMove : undefined}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
      onTouchStart={onDragStart}
      onTouchMove={onDragMove}
      onTouchEnd={onDragEnd}
    >
      {/* Drag hint overlays */}
      <div className="drag-hint drag-hint-like" style={{ opacity: likeOpacity }}>
        <span className="drag-hint-text">💖 LIKE</span>
      </div>
      <div className="drag-hint drag-hint-pass" style={{ opacity: passOpacity }}>
        <span className="drag-hint-text">✕ PASS</span>
      </div>

      {/* Top ribbons */}
      {isLive && (
        <div className="card-ribbon-live">
          <Badge variant="live" pulse>EN VIVO</Badge>
        </div>
      )}

      {/* Avatar */}
      <div className="card-photo-wrap">
        {user.avatar ? (
          <img src={user.avatar} alt={displayName} className="card-photo" draggable={false} />
        ) : (
          <div className="card-photo-placeholder">{displayName[0]?.toUpperCase()}</div>
        )}
        <div className="card-gradient-overlay" />
      </div>

      {/* Info */}
      <div className="card-info">
        <div className="card-info-top">
          <div className="card-name-row">
            <span className="card-name">{displayName}</span>
            {user.location && <span className="card-location">📍 {user.location}</span>}
          </div>
          <div className="card-badges-row">
            {isCreator && <Badge variant="creator">CREATOR</Badge>}
            {user.isVerified && <Badge variant="verified">✓</Badge>}
          </div>
        </div>
        {user.bio && <p className="card-bio">{user.bio}</p>}
        {user.interests?.length > 0 && (
          <div className="card-tags">
            {user.interests.slice(0, 4).map((t) => (
              <span key={t} className="card-tag">{t}</span>
            ))}
          </div>
        )}
        {isCreator && (
          <div className="card-creator-row">
            {isLive && (
              <Link href={`/live/${user.liveId}`} className="creator-action-link creator-live-link">
                🔴 Ver en vivo
              </Link>
            )}
            {privateCallEnabled && (
              <span className="creator-action-link creator-call-link">
                📞 🪙{pricePerMinute}/min
              </span>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .swipe-card {
          position: absolute;
          top: 0; left: 0; right: 0;
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          height: 520px;
          border-radius: 20px;
          overflow: hidden;
          background: #0e051e;
          border: 1px solid rgba(255,45,120,0.2);
          box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 30px rgba(224,64,251,0.08);
          cursor: grab;
          user-select: none;
          touch-action: none;
        }
        .swipe-card.dragging { cursor: grabbing; }

        .drag-hint {
          position: absolute;
          top: 1.5rem;
          z-index: 10;
          pointer-events: none;
          transition: opacity 0.1s;
        }
        .drag-hint-like { right: 1.5rem; }
        .drag-hint-pass { left: 1.5rem; }
        .drag-hint-text {
          font-size: 1rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          padding: 0.4rem 1rem;
          border-radius: 8px;
          border: 3px solid;
          text-transform: uppercase;
        }
        .drag-hint-like .drag-hint-text {
          color: #34d399;
          border-color: #34d399;
          text-shadow: 0 0 12px rgba(52,211,153,0.6);
        }
        .drag-hint-pass .drag-hint-text {
          color: #f87171;
          border-color: #f87171;
          text-shadow: 0 0 12px rgba(248,113,113,0.6);
        }

        .card-ribbon-live {
          position: absolute;
          top: 0.7rem;
          right: 0.7rem;
          z-index: 5;
        }

        .card-photo-wrap {
          position: absolute;
          inset: 0;
        }
        .card-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          pointer-events: none;
        }
        .card-photo-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #1a0830, #2d1157);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 6rem;
          font-weight: 900;
          color: rgba(255,255,255,0.15);
        }
        .card-gradient-overlay {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 65%;
          background: linear-gradient(to top, rgba(8,2,22,0.98) 0%, rgba(8,2,22,0.6) 50%, transparent 100%);
        }

        .card-info {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: 1.1rem 1.25rem;
          z-index: 2;
        }
        .card-info-top {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
        }
        .card-name-row {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .card-name {
          font-size: 1.35rem;
          font-weight: 800;
          color: #fff;
          line-height: 1.15;
        }
        .card-location {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.5);
        }
        .card-badges-row {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .card-bio {
          font-size: 0.8rem;
          color: rgba(255,255,255,0.65);
          line-height: 1.4;
          margin: 0.2rem 0 0.5rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card-tags {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          margin-bottom: 0.4rem;
        }
        .card-tag {
          font-size: 0.65rem;
          padding: 0.18rem 0.55rem;
          border-radius: 999px;
          background: rgba(224,64,251,0.12);
          border: 1px solid rgba(224,64,251,0.2);
          color: #e040fb;
          font-weight: 600;
        }
        .card-creator-row {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .creator-action-link {
          font-size: 0.72rem;
          font-weight: 700;
          padding: 0.22rem 0.7rem;
          border-radius: 999px;
          text-decoration: none;
          border: 1px solid;
        }
        .creator-live-link {
          background: rgba(255,15,138,0.12);
          border-color: rgba(255,15,138,0.35);
          color: #ff0f8a;
        }
        .creator-call-link {
          background: rgba(99,102,241,0.08);
          border-color: rgba(99,102,241,0.3);
          color: #a5b4fc;
        }
      `}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CrushPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null); // "like" | "pass" | "super"
  const [matchData, setMatchData] = useState(null); // { user, isSuperCrush }
  const [superCrushPrice, setSuperCrushPrice] = useState(50);
  const [coins, setCoins] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const currentUser = users[currentIndex] || null;
  const nextUser = users[currentIndex + 1] || null;

  const fetchUsers = useCallback(async (pageNum = 1) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.replace("/login"); return; }
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    setError("");
    try {
      const res = await fetch(
        `${API_URL}/api/user/discover?page=${pageNum}&limit=${USERS_PER_PAGE}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) { router.replace("/login"); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newUsers = data.users || [];
      setUsers((prev) => (pageNum === 1 ? newUsers : [...prev, ...newUsers]));
      setHasMore(newUsers.length === USERS_PER_PAGE);
    } catch {
      setError("No se pudo cargar los perfiles");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [router]);

  const fetchConfig = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    try {
      const [cfgRes, meRes] = await Promise.all([
        fetch(`${API_URL}/api/matches/config`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/user/me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setSuperCrushPrice(cfg.superCrushPrice ?? 50);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setCoins(me.coins ?? 0);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchUsers(1);
    fetchConfig();
  }, [fetchUsers, fetchConfig]);

  // Pre-load more when nearing the end
  useEffect(() => {
    const remaining = users.length - currentIndex;
    if (remaining <= 3 && hasMore && !loadingMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchUsers(nextPage);
    }
  }, [currentIndex, users.length, hasMore, loadingMore, loading, page, fetchUsers]);

  const showFeedback = (type) => {
    setActionFeedback(type);
    setTimeout(() => setActionFeedback(null), 600);
  };

  const advance = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
  }, []);

  const handlePass = useCallback(async (userId) => {
    if (actionLoading) return;
    showFeedback("pass");
    // Unlike if previously liked (no-op otherwise)
    const token = localStorage.getItem("token");
    if (token) {
      fetch(`${API_URL}/api/matches/like/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    advance();
  }, [actionLoading, advance]);

  const handleLike = useCallback(async (userId) => {
    if (actionLoading) return;
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setActionLoading(true);
    showFeedback("like");
    try {
      const res = await fetch(`${API_URL}/api/matches/like/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.match) {
          // Find user object
          const matchedUser = users.find((u) => String(u._id) === String(userId));
          if (matchedUser) setMatchData({ user: matchedUser, isSuperCrush: false });
        }
      }
    } catch { /* ignore */ } finally {
      setActionLoading(false);
      advance();
    }
  }, [actionLoading, advance, users, router]);

  const handleSuperCrush = useCallback(async (userId) => {
    if (actionLoading) return;
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    if (coins !== null && coins < superCrushPrice) {
      setError(`Necesitas ${superCrushPrice} monedas para un Super Crush. Tienes ${coins}.`);
      setTimeout(() => setError(""), 4000);
      return;
    }
    setActionLoading(true);
    showFeedback("super");
    try {
      const res = await fetch(`${API_URL}/api/matches/super-crush/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCoins((c) => (c !== null ? c - superCrushPrice : c));
        if (data.match) {
          const matchedUser = users.find((u) => String(u._id) === String(userId));
          if (matchedUser) setMatchData({ user: matchedUser, isSuperCrush: true });
        }
      } else {
        setError(data.message || "No se pudo enviar el Super Crush");
        setTimeout(() => setError(""), 4000);
      }
    } catch {
      setError("Error de conexión");
      setTimeout(() => setError(""), 4000);
    } finally {
      setActionLoading(false);
      advance();
    }
  }, [actionLoading, advance, coins, superCrushPrice, users, router]);

  const isDone = !loading && currentIndex >= users.length;

  return (
    <div className="crush-page">
      {/* Header */}
      <div className="crush-header">
        <div>
          <h1 className="page-title">
            <span className="title-icon">💘</span> Crush
          </h1>
          <p className="page-subtitle">Desliza o elige — conecta de verdad</p>
        </div>
        <div className="header-actions">
          {coins !== null && (
            <div className="coin-chip">
              <span className="coin-icon">🪙</span>
              <span className="coin-value">{coins}</span>
            </div>
          )}
          <Link href="/matches" className="matches-link-btn">
            💗 Mis Matches
          </Link>
        </div>
      </div>

      {/* Super Crush info banner */}
      <div className="super-crush-banner">
        <span className="sc-banner-icon">⚡</span>
        <div className="sc-banner-text">
          <span className="sc-banner-title">Super Crush</span>
          <span className="sc-banner-desc">Destaca entre todos · Solo {superCrushPrice} 🪙</span>
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {/* Card stack */}
      <div className="card-stack-wrap">
        {loading ? (
          <div className="skeleton-card" />
        ) : isDone ? (
          <div className="done-state">
            <div className="done-icon">🌟</div>
            <h3>¡Has visto todos los perfiles!</h3>
            <p>Vuelve más tarde para descubrir más personas.</p>
            <div className="done-actions">
              <Link href="/matches" className="btn btn-primary">Ver mis matches</Link>
              <Link href="/explore" className="btn">Explorar directos</Link>
            </div>
          </div>
        ) : (
          <>
            {/* Ghost card (next) */}
            {nextUser && (
              <div className="ghost-card">
                {nextUser.avatar ? (
                  <img src={nextUser.avatar} alt="" className="ghost-photo" draggable={false} />
                ) : (
                  <div className="ghost-photo-placeholder">{(nextUser.username || nextUser.name || "?")[0]?.toUpperCase()}</div>
                )}
              </div>
            )}

            {/* Current card */}
            {currentUser && (
              <>
                {/* Action feedback overlays */}
                {actionFeedback === "like" && (
                  <div className="action-flash action-flash-like">💖 LIKE</div>
                )}
                {actionFeedback === "pass" && (
                  <div className="action-flash action-flash-pass">✕ PASS</div>
                )}
                {actionFeedback === "super" && (
                  <div className="action-flash action-flash-super">⚡ SUPER CRUSH!</div>
                )}

                <SwipeCard
                  key={currentUser._id}
                  user={currentUser}
                  onPass={handlePass}
                  onLike={handleLike}
                  onSuperCrush={handleSuperCrush}
                  superCrushPrice={superCrushPrice}
                  actionLoading={actionLoading}
                />
              </>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      {!loading && !isDone && currentUser && (
        <div className="action-buttons">
          <button
            className="action-btn btn-pass"
            onClick={() => handlePass(currentUser._id)}
            disabled={actionLoading}
            aria-label="Pasar"
            title="Pasar"
          >
            <PassIcon />
          </button>

          <button
            className="action-btn btn-super"
            onClick={() => handleSuperCrush(currentUser._id)}
            disabled={actionLoading || (coins !== null && coins < superCrushPrice)}
            aria-label={`Super Crush · ${superCrushPrice} monedas`}
            title={`Super Crush · ${superCrushPrice} 🪙`}
          >
            <StarIcon />
            <span className="super-price">{superCrushPrice} 🪙</span>
          </button>

          <button
            className="action-btn btn-like"
            onClick={() => handleLike(currentUser._id)}
            disabled={actionLoading}
            aria-label="Like"
            title="Like"
          >
            <HeartIcon />
          </button>
        </div>
      )}

      {/* Match modal */}
      {matchData && (
        <MatchModal
          user={matchData.user}
          isSuperCrush={matchData.isSuperCrush}
          onClose={() => setMatchData(null)}
        />
      )}

      <style jsx>{`
        .crush-page {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-height: calc(100vh - 80px);
          padding-bottom: 2rem;
        }

        .crush-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .title-icon { margin-right: 0.25rem; }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .coin-chip {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 0.85rem;
          border-radius: 999px;
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.25);
        }
        .coin-icon { font-size: 0.9rem; }
        .coin-value { font-size: 0.82rem; font-weight: 700; color: #fbbf24; }
        .matches-link-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.42rem 1rem;
          border-radius: 999px;
          border: 1px solid rgba(255,45,120,0.3);
          background: rgba(255,45,120,0.07);
          color: var(--accent);
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
        }
        .matches-link-btn:hover {
          background: rgba(255,45,120,0.14);
          box-shadow: 0 0 14px rgba(255,45,120,0.2);
        }

        .super-crush-banner {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.75rem 1.1rem;
          border-radius: var(--radius-sm);
          background: linear-gradient(135deg, rgba(251,191,36,0.06), rgba(224,64,251,0.06));
          border: 1px solid rgba(251,191,36,0.18);
        }
        .sc-banner-icon { font-size: 1.3rem; }
        .sc-banner-text { display: flex; flex-direction: column; gap: 0.1rem; }
        .sc-banner-title { font-size: 0.85rem; font-weight: 800; color: #fbbf24; }
        .sc-banner-desc  { font-size: 0.75rem; color: rgba(255,255,255,0.5); }

        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        /* Card stack */
        .card-stack-wrap {
          position: relative;
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          height: 520px;
        }

        .skeleton-card {
          position: absolute;
          inset: 0;
          border-radius: 20px;
          background: rgba(15,8,32,0.7);
          border: 1px solid rgba(255,45,120,0.1);
          animation: skeleton-shimmer 1.4s ease-in-out infinite;
        }
        @keyframes skeleton-shimmer {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }

        .ghost-card {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%) scale(0.96);
          width: 100%;
          max-width: 420px;
          height: 520px;
          border-radius: 20px;
          overflow: hidden;
          background: rgba(15,8,32,0.5);
          border: 1px solid rgba(255,45,120,0.12);
          z-index: 0;
        }
        .ghost-photo {
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0.35;
          filter: blur(2px);
          pointer-events: none;
        }
        .ghost-photo-placeholder {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          font-size: 5rem; font-weight: 900;
          color: rgba(255,255,255,0.08);
          background: linear-gradient(135deg, #110524, #1a073a);
        }

        /* Action flash */
        .action-flash {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 20;
          font-size: 1.5rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          padding: 0.5rem 1.5rem;
          border-radius: 12px;
          border: 3px solid;
          pointer-events: none;
          animation: flash-pop 0.6s ease forwards;
        }
        @keyframes flash-pop {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          30%  { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          80%  { opacity: 1; transform: translate(-50%, -50%) scale(1);   }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1);   }
        }
        .action-flash-like { color: #34d399; border-color: #34d399; background: rgba(52,211,153,0.08); }
        .action-flash-pass { color: #f87171; border-color: #f87171; background: rgba(248,113,113,0.08); }
        .action-flash-super { color: #fbbf24; border-color: #fbbf24; background: rgba(251,191,36,0.1); }

        /* Action buttons row */
        .action-buttons {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          margin-top: 0.5rem;
        }
        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.3rem;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .action-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .btn-pass {
          width: 58px;
          height: 58px;
          background: rgba(248,113,113,0.08);
          border: 2px solid rgba(248,113,113,0.35);
          color: #f87171;
        }
        .btn-pass:hover:not(:disabled) {
          background: rgba(248,113,113,0.18);
          box-shadow: 0 0 22px rgba(248,113,113,0.3);
          transform: scale(1.08);
        }

        .btn-like {
          width: 58px;
          height: 58px;
          background: rgba(52,211,153,0.08);
          border: 2px solid rgba(52,211,153,0.35);
          color: #34d399;
        }
        .btn-like:hover:not(:disabled) {
          background: rgba(52,211,153,0.18);
          box-shadow: 0 0 22px rgba(52,211,153,0.3);
          transform: scale(1.08);
        }

        .btn-super {
          width: 72px;
          height: 72px;
          background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(224,64,251,0.12));
          border: 2px solid rgba(251,191,36,0.5);
          color: #fbbf24;
          border-radius: 50%;
          box-shadow: 0 0 20px rgba(251,191,36,0.2);
        }
        .btn-super:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(251,191,36,0.22), rgba(224,64,251,0.22));
          box-shadow: 0 0 32px rgba(251,191,36,0.4);
          transform: scale(1.1);
        }
        .super-price {
          font-size: 0.6rem;
          font-weight: 800;
          color: #fbbf24;
          white-space: nowrap;
        }

        /* Done state */
        .done-state {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          text-align: center;
          border: 1px dashed rgba(224,64,251,0.2);
          border-radius: 20px;
          background: rgba(15,8,32,0.6);
          padding: 2rem;
        }
        .done-icon { font-size: 3rem; }
        .done-state h3 { color: var(--text); font-size: 1.1rem; margin: 0; }
        .done-state p  { color: var(--text-muted); font-size: 0.875rem; margin: 0; }
        .done-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center; margin-top: 0.5rem; }

        @media (max-width: 480px) {
          .card-stack-wrap { height: 460px; }
          .ghost-card { height: 460px; }
        }
      `}</style>
    </div>
  );
}
