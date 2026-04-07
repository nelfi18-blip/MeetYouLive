"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/Badge";
import MatchModal from "@/components/MatchModal";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const USERS_PER_PAGE = 20;
const ACTION_FEEDBACK_DURATION_MS = 700;
const ACTIVITY_BANNER_DURATION_MS = 3500;

/** Calculate age from a birthdate string/Date. Returns null if not available. */
function calcAge(birthdate) {
  if (!birthdate) return null;
  const bd = new Date(birthdate);
  if (isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age -= 1;
  return age > 0 ? age : null;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function PassIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function HeartIcon({ filled = false }) {
  return filled ? (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  ) : (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

// ─── SuperCrushConfirmModal ───────────────────────────────────────────────────
function SuperCrushConfirmModal({ user, price, coins, loading, onConfirm, onCancel }) {
  const displayName = user?.username || user?.name || "Usuario";
  const hasBalance = coins === null || coins >= price;

  return (
    <div className="sc-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="sc-modal">
        <div className="sc-glow" aria-hidden="true" />
        <div className="sc-icon">⚡</div>
        <h3 className="sc-title">Super Crush</h3>
        <p className="sc-desc">
          Destácate entre todos y haz que <strong>{displayName}</strong> sepa que eres especial.
        </p>

        <div className="sc-price-row">
          <span className="sc-price-label">Costo</span>
          <span className="sc-price-value">🪙 {price} monedas</span>
        </div>

        {coins !== null && (
          <div className="sc-balance-row">
            <span className="sc-balance-label">Tu saldo</span>
            <span className={`sc-balance-value${hasBalance ? "" : " sc-balance-low"}`}>
              🪙 {coins} monedas
            </span>
          </div>
        )}

        {!hasBalance && (
          <div className="sc-insufficient">
            <span className="sc-insuf-icon">⚠️</span>
            <span>Saldo insuficiente.</span>
            <Link href="/coins" className="sc-buy-link" onClick={onCancel}>Comprar monedas →</Link>
          </div>
        )}

        <div className="sc-actions">
          <button className="sc-btn sc-btn-cancel" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button
            className="sc-btn sc-btn-confirm"
            onClick={onConfirm}
            disabled={loading || !hasBalance}
          >
            {loading ? "Enviando…" : `⚡ Enviar · 🪙${price}`}
          </button>
        </div>
      </div>

      <style jsx>{`
        .sc-overlay {
          position: fixed;
          inset: 0;
          z-index: 3000;
          background: rgba(4,0,14,0.82);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
        }
        .sc-modal {
          position: relative;
          background: linear-gradient(155deg, #130525 0%, #0b0219 100%);
          border: 1px solid rgba(251,191,36,0.4);
          border-radius: 22px;
          padding: 2rem 1.75rem 1.5rem;
          max-width: 360px;
          width: 100%;
          text-align: center;
          box-shadow: 0 0 60px rgba(251,191,36,0.18), 0 0 120px rgba(224,64,251,0.1);
          animation: sc-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
          overflow: hidden;
        }
        @keyframes sc-pop {
          from { transform: scale(0.75); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        .sc-glow {
          position: absolute;
          top: -40%;
          left: 50%;
          transform: translateX(-50%);
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .sc-icon {
          font-size: 2.8rem;
          margin-bottom: 0.5rem;
          animation: sc-pulse 1.5s ease-in-out infinite;
        }
        @keyframes sc-pulse {
          0%,100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(251,191,36,0.5)); }
          50%     { transform: scale(1.15); filter: drop-shadow(0 0 18px rgba(251,191,36,0.8)); }
        }
        .sc-title {
          font-size: 1.35rem;
          font-weight: 900;
          color: #fbbf24;
          margin: 0 0 0.5rem;
          letter-spacing: 0.03em;
        }
        .sc-desc {
          font-size: 0.83rem;
          color: rgba(255,255,255,0.6);
          margin: 0 0 1.25rem;
          line-height: 1.5;
        }
        .sc-desc strong { color: rgba(255,255,255,0.85); }
        .sc-price-row, .sc-balance-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          border-radius: 10px;
          margin-bottom: 0.4rem;
        }
        .sc-price-row {
          background: rgba(251,191,36,0.07);
          border: 1px solid rgba(251,191,36,0.2);
        }
        .sc-balance-row {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .sc-price-label, .sc-balance-label {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.45);
          font-weight: 600;
        }
        .sc-price-value {
          font-size: 0.9rem;
          font-weight: 800;
          color: #fbbf24;
        }
        .sc-balance-value {
          font-size: 0.85rem;
          font-weight: 700;
          color: rgba(255,255,255,0.7);
        }
        .sc-balance-low { color: #f87171 !important; }
        .sc-insufficient {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 0.75rem;
          border-radius: 10px;
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.25);
          margin: 0.5rem 0;
          font-size: 0.78rem;
          color: #f87171;
          flex-wrap: wrap;
        }
        .sc-insuf-icon { font-size: 0.9rem; }
        .sc-buy-link {
          color: #fbbf24;
          text-decoration: none;
          font-weight: 700;
          margin-left: auto;
        }
        .sc-buy-link:hover { text-decoration: underline; }
        .sc-actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 1.25rem;
        }
        .sc-btn {
          flex: 1;
          padding: 0.75rem 0.5rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid;
          transition: all 0.2s;
        }
        .sc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sc-btn-cancel {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.5);
        }
        .sc-btn-cancel:hover:not(:disabled) {
          background: rgba(255,255,255,0.08);
        }
        .sc-btn-confirm {
          background: linear-gradient(135deg, rgba(251,191,36,0.2), rgba(224,64,251,0.2));
          border-color: rgba(251,191,36,0.6);
          color: #fbbf24;
          box-shadow: 0 0 18px rgba(251,191,36,0.2);
        }
        .sc-btn-confirm:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(251,191,36,0.32), rgba(224,64,251,0.32));
          box-shadow: 0 0 32px rgba(251,191,36,0.35);
        }
      `}</style>
    </div>
  );
}

// ─── CrushActivityBanner ──────────────────────────────────────────────────────
function CrushActivityBanner({ event, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, ACTIVITY_BANNER_DURATION_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!event) return null;
  const isSuper = event.type === "super";

  return (
    <div className={`cab${isSuper ? " cab-super" : ""}`} role="status">
      <span className="cab-icon">{isSuper ? "⚡" : "💘"}</span>
      <span className="cab-text">
        {isSuper
          ? `¡${event.username} te envió un Super Crush!`
          : `¡Alguien te acaba de dar like!`}
      </span>
      <button className="cab-close" onClick={onDismiss} aria-label="Cerrar">✕</button>

      <style jsx>{`
        .cab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1rem;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(255,45,120,0.12), rgba(224,64,251,0.12));
          border: 1px solid rgba(255,45,120,0.3);
          font-size: 0.82rem;
          color: rgba(255,255,255,0.85);
          animation: cab-slide 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .cab-super {
          background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(224,64,251,0.12));
          border-color: rgba(251,191,36,0.35);
        }
        @keyframes cab-slide {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cab-icon { font-size: 1rem; }
        .cab-text { flex: 1; font-weight: 600; }
        .cab-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.35);
          cursor: pointer;
          font-size: 0.75rem;
          padding: 0;
          line-height: 1;
        }
        .cab-close:hover { color: rgba(255,255,255,0.65); }
      `}</style>
    </div>
  );
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────
function SwipeCard({ user, onPass, onLike }) {
  const cardRef = useRef(null);
  const startXRef = useRef(null);
  const velRef = useRef(0);
  const lastXRef = useRef(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [dragging, setDragging] = useState(false);

  const displayName = user.username || user.name || "Usuario";
  const age = calcAge(user.birthdate);
  const isCreator = user.role === "creator";
  const isLive = isCreator && user.isLive && user.liveId;
  const privateCallEnabled = isCreator && user.creatorProfile?.privateCallEnabled;
  const pricePerMinute = user.creatorProfile?.pricePerMinute ?? 0;

  const getClientX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

  const onDragStart = (e) => {
    startXRef.current = getClientX(e);
    lastXRef.current = getClientX(e);
    velRef.current = 0;
    setDragging(true);
  };

  const onDragMove = (e) => {
    if (startXRef.current === null) return;
    const x = getClientX(e);
    velRef.current = x - (lastXRef.current ?? x);
    lastXRef.current = x;
    const dx = x - startXRef.current;
    setDragDelta(dx);
  };

  const onDragEnd = () => {
    if (startXRef.current === null) return;
    const threshold = 75;
    const velocityBoost = dragDelta + velRef.current * 6;
    if (velocityBoost > threshold) {
      onLike(user._id);
    } else if (velocityBoost < -threshold) {
      onPass(user._id);
    }
    startXRef.current = null;
    lastXRef.current = null;
    velRef.current = 0;
    setDragDelta(0);
    setDragging(false);
  };

  const rotation = dragDelta / 16;
  const likeOpacity = Math.min(Math.max(dragDelta / 70, 0), 1);
  const passOpacity = Math.min(Math.max(-dragDelta / 70, 0), 1);

  return (
    <div
      ref={cardRef}
      className={`swipe-card${dragging ? " dragging" : ""}`}
      style={{
        transform: `translateX(${dragDelta}px) rotate(${rotation}deg)`,
        transition: dragging ? "none" : "transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94)",
      }}
      onMouseDown={onDragStart}
      onMouseMove={dragging ? onDragMove : undefined}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
      onTouchStart={onDragStart}
      onTouchMove={onDragMove}
      onTouchEnd={onDragEnd}
    >
      {/* Drag feedback overlays */}
      <div className="drag-hint drag-hint-like" style={{ opacity: likeOpacity }}>
        <span className="drag-hint-text">💖 LIKE</span>
      </div>
      <div className="drag-hint drag-hint-pass" style={{ opacity: passOpacity }}>
        <span className="drag-hint-text">✕ PASS</span>
      </div>

      {/* Live ribbon */}
      {isLive && (
        <div className="card-ribbon-live">
          <Badge variant="live" pulse>EN VIVO</Badge>
        </div>
      )}

      {/* Photo */}
      <div className="card-photo-wrap">
        {user.avatar ? (
          <img src={user.avatar} alt={displayName} className="card-photo" draggable={false} />
        ) : (
          <div className="card-photo-placeholder">
            <span className="placeholder-initial">{displayName[0]?.toUpperCase()}</span>
          </div>
        )}
        {/* Multi-layer gradient for depth */}
        <div className="card-gradient-overlay" />
        <div className="card-gradient-top" />
      </div>

      {/* Info overlay */}
      <div className="card-info">
        <div className="card-info-top">
          <div className="card-name-row">
            <div className="card-name-age">
              <span className="card-name">{displayName}</span>
              {age && <span className="card-age">{age}</span>}
            </div>
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
          max-width: 440px;
          margin: 0 auto;
          height: 100%;
          border-radius: 24px;
          overflow: hidden;
          background: linear-gradient(160deg, #12052a, #0a0218);
          border: 1px solid rgba(255,45,120,0.25);
          box-shadow:
            0 10px 50px rgba(0,0,0,0.6),
            0 0 40px rgba(224,64,251,0.1),
            0 0 0 1px rgba(255,255,255,0.03) inset;
          cursor: grab;
          user-select: none;
          touch-action: none;
          will-change: transform;
        }
        .swipe-card.dragging { cursor: grabbing; }

        .drag-hint {
          position: absolute;
          top: 1.75rem;
          z-index: 10;
          pointer-events: none;
          transition: opacity 0.08s;
        }
        .drag-hint-like { right: 1.5rem; }
        .drag-hint-pass { left: 1.5rem; }
        .drag-hint-text {
          font-size: 1.05rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          padding: 0.4rem 1.1rem;
          border-radius: 8px;
          border: 3px solid;
          text-transform: uppercase;
          display: block;
        }
        .drag-hint-like .drag-hint-text {
          color: #34d399;
          border-color: #34d399;
          background: rgba(52,211,153,0.08);
          text-shadow: 0 0 14px rgba(52,211,153,0.7);
          box-shadow: 0 0 20px rgba(52,211,153,0.2);
        }
        .drag-hint-pass .drag-hint-text {
          color: #f87171;
          border-color: #f87171;
          background: rgba(248,113,113,0.08);
          text-shadow: 0 0 14px rgba(248,113,113,0.7);
          box-shadow: 0 0 20px rgba(248,113,113,0.2);
        }

        .card-ribbon-live {
          position: absolute;
          top: 0.85rem;
          right: 0.85rem;
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
          background: linear-gradient(160deg, #1c0938 0%, #2a0d4f 50%, #1a0630 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .placeholder-initial {
          font-size: 7rem;
          font-weight: 900;
          color: rgba(255,255,255,0.08);
          text-shadow: 0 0 60px rgba(224,64,251,0.15);
          user-select: none;
        }
        .card-gradient-overlay {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 70%;
          background: linear-gradient(
            to top,
            rgba(6,1,18,0.99) 0%,
            rgba(6,1,18,0.75) 35%,
            rgba(6,1,18,0.3) 60%,
            transparent 100%
          );
        }
        .card-gradient-top {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 30%;
          background: linear-gradient(
            to bottom,
            rgba(6,1,18,0.45) 0%,
            transparent 100%
          );
        }

        .card-info {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: 1.25rem 1.35rem 1.1rem;
          z-index: 2;
        }
        .card-info-top {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }
        .card-name-row {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .card-name-age {
          display: flex;
          align-items: baseline;
          gap: 0.45rem;
        }
        .card-name {
          font-size: 1.5rem;
          font-weight: 900;
          color: #fff;
          line-height: 1.1;
          text-shadow: 0 2px 12px rgba(0,0,0,0.5);
        }
        .card-age {
          font-size: 1.1rem;
          font-weight: 600;
          color: rgba(255,255,255,0.75);
        }
        .card-location {
          font-size: 0.73rem;
          color: rgba(255,255,255,0.48);
          margin-top: 0.1rem;
        }
        .card-badges-row {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: flex-end;
        }
        .card-bio {
          font-size: 0.82rem;
          color: rgba(255,255,255,0.62);
          line-height: 1.45;
          margin: 0 0 0.55rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card-tags {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          margin-bottom: 0.45rem;
        }
        .card-tag {
          font-size: 0.66rem;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.22);
          color: #e040fb;
          font-weight: 600;
          backdrop-filter: blur(4px);
        }
        .card-creator-row {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .creator-action-link {
          font-size: 0.73rem;
          font-weight: 700;
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          text-decoration: none;
          border: 1px solid;
          backdrop-filter: blur(4px);
        }
        .creator-live-link {
          background: rgba(255,15,138,0.14);
          border-color: rgba(255,15,138,0.4);
          color: #ff2d78;
          box-shadow: 0 0 12px rgba(255,15,138,0.15);
        }
        .creator-call-link {
          background: rgba(99,102,241,0.1);
          border-color: rgba(99,102,241,0.32);
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
  const [superCrushConfirm, setSuperCrushConfirm] = useState(false);
  const [crushActivity, setCrushActivity] = useState(null); // { type: "crush"|"super", username }

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

  // ─── Socket: page-level crush events ──────────────────────────────────────
  useEffect(() => {
    const handleCrushReceived = ({ fromUsername, crushType }) => {
      setCrushActivity({
        type: crushType === "super_crush" ? "super" : "crush",
        username: fromUsername || "",
      });
    };

    const handleSuperCrushReceived = ({ fromUsername }) => {
      setCrushActivity({ type: "super", username: fromUsername || "" });
    };

    const handleMatchCreatedSocket = ({ matchedUserId, matchedUsername }) => {
      setMatchData((prev) => {
        if (prev) return prev;
        const matchedUser = users.find((u) => String(u._id) === String(matchedUserId));
        if (matchedUser) return { user: matchedUser, isSuperCrush: false };
        return {
          user: { _id: matchedUserId, username: matchedUsername, name: matchedUsername },
          isSuperCrush: false,
        };
      });
    };

    socket.on("CRUSH_RECEIVED", handleCrushReceived);
    socket.on("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);
    socket.on("MATCH_CREATED", handleMatchCreatedSocket);
    return () => {
      socket.off("CRUSH_RECEIVED", handleCrushReceived);
      socket.off("SUPER_CRUSH_RECEIVED", handleSuperCrushReceived);
      socket.off("MATCH_CREATED", handleMatchCreatedSocket);
    };
  }, [users]);

  const showFeedback = (type) => {
    setActionFeedback(type);
    setTimeout(() => setActionFeedback(null), ACTION_FEEDBACK_DURATION_MS);
  };

  const advance = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
  }, []);

  const handlePass = useCallback(async (userId) => {
    if (actionLoading) return;
    showFeedback("pass");
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
          const matchedUser = users.find((u) => String(u._id) === String(userId));
          if (matchedUser) setMatchData({ user: matchedUser, isSuperCrush: false });
        }
      }
    } catch { /* ignore */ } finally {
      setActionLoading(false);
      advance();
    }
  }, [actionLoading, advance, users, router]);

  const requestSuperCrush = useCallback(() => {
    if (actionLoading || !currentUser) return;
    setSuperCrushConfirm(true);
  }, [actionLoading, currentUser]);

  const handleSuperCrush = useCallback(async () => {
    const userId = currentUser?._id;
    if (!userId) return;
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setActionLoading(true);
    setSuperCrushConfirm(false);
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
        setTimeout(() => setError(""), 5000);
      }
    } catch {
      setError("Error de conexión");
      setTimeout(() => setError(""), 5000);
    } finally {
      setActionLoading(false);
      advance();
    }
  }, [actionLoading, advance, coins, superCrushPrice, users, router, currentUser]);

  const isDone = !loading && currentIndex >= users.length;
  const canSuperCrush = coins === null || coins >= superCrushPrice;

  return (
    <div className="crush-page">
      {/* Ambient background glow */}
      <div className="page-glow page-glow-1" aria-hidden="true" />
      <div className="page-glow page-glow-2" aria-hidden="true" />

      {/* Header */}
      <div className="crush-header">
        <div>
          <h1 className="page-title">
            <span className="title-icon">💘</span> Crush
          </h1>
          <p className="page-subtitle">Desliza · conecta · enamórate</p>
        </div>
        <div className="header-actions">
          {coins !== null && (
            <div className="coin-chip">
              <span className="coin-icon">🪙</span>
              <span className="coin-value">{coins}</span>
            </div>
          )}
          <Link href="/matches" className="matches-link-btn">
            💗 Matches
          </Link>
        </div>
      </div>

      {/* Activity banner (socket events) */}
      {crushActivity && (
        <CrushActivityBanner
          event={crushActivity}
          onDismiss={() => setCrushActivity(null)}
        />
      )}

      {error && <div className="banner-error">{error}</div>}

      {/* Card stack */}
      <div className="card-stack-wrap">
        {loading ? (
          <div className="skeleton-card">
            <div className="skeleton-shimmer" />
          </div>
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
            {nextUser && (
              <div className="ghost-card">
                {nextUser.avatar ? (
                  <img src={nextUser.avatar} alt="" className="ghost-photo" draggable={false} />
                ) : (
                  <div className="ghost-photo-placeholder">
                    {(nextUser.username || nextUser.name || "?")[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            )}

            {currentUser && (
              <>
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
            className={`action-btn btn-super${!canSuperCrush ? " btn-super-disabled" : ""}`}
            onClick={requestSuperCrush}
            disabled={actionLoading}
            aria-label={`Super Crush · ${superCrushPrice} monedas`}
            title={canSuperCrush ? `Super Crush · ${superCrushPrice} 🪙` : "Saldo insuficiente"}
          >
            <span className="btn-super-inner">
              <StarIcon />
              <span className="super-price">⚡ {superCrushPrice} 🪙</span>
            </span>
            {!canSuperCrush && <span className="super-locked-hint">Sin saldo</span>}
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

      {/* Super Crush confirm modal */}
      {superCrushConfirm && currentUser && (
        <SuperCrushConfirmModal
          user={currentUser}
          price={superCrushPrice}
          coins={coins}
          loading={actionLoading}
          onConfirm={handleSuperCrush}
          onCancel={() => setSuperCrushConfirm(false)}
        />
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
          gap: 1rem;
          min-height: calc(100svh - 80px);
          padding-bottom: 1.5rem;
          position: relative;
          overflow-x: hidden;
        }

        .page-glow {
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          filter: blur(80px);
        }
        .page-glow-1 {
          width: 400px; height: 400px;
          top: -100px; left: -100px;
          background: radial-gradient(circle, rgba(224,64,251,0.08) 0%, transparent 70%);
        }
        .page-glow-2 {
          width: 350px; height: 350px;
          bottom: 100px; right: -80px;
          background: radial-gradient(circle, rgba(255,45,120,0.07) 0%, transparent 70%);
        }

        .crush-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          position: relative;
          z-index: 1;
        }
        .page-title {
          font-size: 1.65rem;
          font-weight: 900;
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          line-height: 1.15;
        }
        .title-icon { -webkit-text-fill-color: initial; }
        .page-subtitle {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.38);
          margin: 0.15rem 0 0;
        }
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
          padding: 0.38rem 0.9rem;
          border-radius: 999px;
          background: rgba(251,191,36,0.07);
          border: 1px solid rgba(251,191,36,0.22);
          backdrop-filter: blur(6px);
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
          color: #ff2d78;
          font-size: 0.8rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          backdrop-filter: blur(6px);
        }
        .matches-link-btn:hover {
          background: rgba(255,45,120,0.14);
          box-shadow: 0 0 16px rgba(255,45,120,0.22);
        }

        .banner-error {
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.3);
          color: #f87171;
          border-radius: 12px;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          position: relative;
          z-index: 1;
        }

        .card-stack-wrap {
          position: relative;
          width: 100%;
          max-width: 440px;
          margin: 0 auto;
          height: clamp(460px, calc(100svh - 290px), 580px);
          z-index: 1;
        }

        .skeleton-card {
          position: absolute;
          inset: 0;
          border-radius: 24px;
          background: linear-gradient(160deg, #12052a, #0a0218);
          border: 1px solid rgba(255,45,120,0.1);
          overflow: hidden;
        }
        .skeleton-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .ghost-card {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%) scale(0.95);
          width: 100%;
          max-width: 440px;
          height: 100%;
          border-radius: 24px;
          overflow: hidden;
          background: rgba(12,4,28,0.5);
          border: 1px solid rgba(255,45,120,0.1);
          z-index: 0;
        }
        .ghost-photo {
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0.28;
          filter: blur(3px);
          pointer-events: none;
        }
        .ghost-photo-placeholder {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          font-size: 5rem; font-weight: 900;
          color: rgba(255,255,255,0.06);
          background: linear-gradient(135deg, #0e0425, #180845);
        }

        .action-flash {
          position: absolute;
          top: 42%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 20;
          font-size: 1.65rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          padding: 0.55rem 1.75rem;
          border-radius: 14px;
          border: 3px solid;
          pointer-events: none;
          animation: flash-pop 0.7s ease forwards;
        }
        @keyframes flash-pop {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          28%  { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
          75%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.02); }
        }
        .action-flash-like {
          color: #34d399; border-color: #34d399;
          background: rgba(52,211,153,0.07);
          text-shadow: 0 0 20px rgba(52,211,153,0.7);
          box-shadow: 0 0 40px rgba(52,211,153,0.2);
        }
        .action-flash-pass {
          color: #f87171; border-color: #f87171;
          background: rgba(248,113,113,0.07);
          text-shadow: 0 0 20px rgba(248,113,113,0.7);
          box-shadow: 0 0 40px rgba(248,113,113,0.2);
        }
        .action-flash-super {
          color: #fbbf24; border-color: #fbbf24;
          background: rgba(251,191,36,0.08);
          text-shadow: 0 0 24px rgba(251,191,36,0.8);
          box-shadow: 0 0 50px rgba(251,191,36,0.25);
        }

        .action-buttons {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.25rem;
          padding: 0.25rem 0;
          position: relative;
          z-index: 1;
        }
        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.22s ease;
          flex-shrink: 0;
          position: relative;
        }
        .action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .action-btn:active:not(:disabled) { transform: scale(0.93) !important; }

        .btn-pass {
          width: 60px; height: 60px;
          background: rgba(248,113,113,0.07);
          border: 2px solid rgba(248,113,113,0.32);
          color: #f87171;
        }
        .btn-pass:hover:not(:disabled) {
          background: rgba(248,113,113,0.16);
          box-shadow: 0 0 28px rgba(248,113,113,0.35);
          transform: scale(1.1);
        }

        .btn-like {
          width: 60px; height: 60px;
          background: rgba(255,45,120,0.08);
          border: 2px solid rgba(255,45,120,0.38);
          color: #ff2d78;
        }
        .btn-like:hover:not(:disabled) {
          background: rgba(255,45,120,0.18);
          box-shadow: 0 0 28px rgba(255,45,120,0.38);
          transform: scale(1.1);
        }

        .btn-super {
          width: 76px; height: 76px;
          background: linear-gradient(135deg, rgba(251,191,36,0.1), rgba(224,64,251,0.1));
          border: 2px solid rgba(251,191,36,0.5);
          color: #fbbf24;
          border-radius: 50%;
          box-shadow: 0 0 24px rgba(251,191,36,0.18), 0 0 0 1px rgba(251,191,36,0.08) inset;
        }
        .btn-super:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(251,191,36,0.2), rgba(224,64,251,0.2));
          box-shadow: 0 0 40px rgba(251,191,36,0.42), 0 0 0 1px rgba(251,191,36,0.12) inset;
          transform: scale(1.12);
        }
        .btn-super-disabled {
          border-color: rgba(255,255,255,0.18) !important;
          box-shadow: none !important;
          opacity: 0.5;
        }
        .btn-super-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.15rem;
        }
        .super-price {
          font-size: 0.58rem;
          font-weight: 800;
          color: #fbbf24;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }
        .super-locked-hint {
          position: absolute;
          bottom: -1.4rem;
          left: 50%;
          transform: translateX(-50%);
          font-size: 0.6rem;
          color: rgba(248,113,113,0.7);
          white-space: nowrap;
          font-weight: 600;
        }

        .done-state {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          text-align: center;
          border: 1px dashed rgba(224,64,251,0.18);
          border-radius: 24px;
          background: rgba(10,2,24,0.6);
          padding: 2rem;
          backdrop-filter: blur(8px);
        }
        .done-icon { font-size: 3.5rem; }
        .done-state h3 { color: var(--text); font-size: 1.1rem; margin: 0; }
        .done-state p  { color: var(--text-muted); font-size: 0.875rem; margin: 0; }
        .done-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 0.5rem;
        }

        @media (max-width: 480px) {
          .card-stack-wrap { height: clamp(400px, calc(100svh - 280px), 520px); }
          .action-btn { touch-action: manipulation; }
        }
      `}</style>
    </div>
  );
}
