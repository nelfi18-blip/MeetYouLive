"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}

/**
 * HiddenLikesSection
 *
 * Shows people who liked the current user, splitting them into revealed
 * (clear avatar + name) and locked (blurred avatar + lock icon) groups.
 * Locked likers can be revealed for UNLOCK_PRICE coins via the API.
 *
 * Props:
 *   compact – if true, renders a smaller layout (used inside the crush page)
 */
export default function HiddenLikesSection({ compact = false }) {
  const [data, setData] = useState(null);      // { revealed, locked, lockedCount, unlockPrice }
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");

  const fetchLikes = useCallback(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { setLoading(false); return; }

    fetch(`${API_URL}/api/matches/likes-received`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar los likes");
        return r.json();
      })
      .then((d) => { if (d) setData(d); })
      .catch(() => setError("No se pudieron cargar los likes"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLikes(); }, [fetchLikes]);

  const handleUnlock = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setUnlocking(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/matches/unlock-likes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || "Error al desbloquear");
      } else {
        // Refresh to show revealed profiles
        fetchLikes();
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setUnlocking(false);
    }
  };

  // Nothing to show while loading or if there's no data at all
  if (loading) return null;
  if (!data) return null;

  const total = (data.revealed?.length ?? 0) + (data.lockedCount ?? 0);
  if (total === 0) return null;

  const unlockPrice = data.unlockPrice ?? 50;
  const hasLocked = (data.lockedCount ?? 0) > 0;

  return (
    <div className={`hls-wrap${compact ? " hls-compact" : ""}`}>
      {/* ── Header ── */}
      <div className="hls-header">
        <div className="hls-title-row">
          <span className="hls-title">👀 A estas personas les gustas</span>
          {hasLocked && (
            <span className="hls-locked-badge">
              🔒 {data.lockedCount} oculto{data.lockedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="hls-subtitle">💖 Ya les gustas · 🔥 No te los pierdas</p>
      </div>

      {/* ── Grid of likers ── */}
      <div className="hls-grid">
        {/* Revealed likers */}
        {(data.revealed ?? []).map(({ likeId, user, crushType }) => {
          const displayName = user?.username || user?.name || "Usuario";
          const initial = displayName[0]?.toUpperCase() || "?";
          return (
            <div key={likeId} className="hls-card hls-card-revealed">
              <div className="hls-avatar-wrap">
                {user?.avatar ? (
                  <img src={user.avatar} alt={displayName} className="hls-avatar-img" />
                ) : (
                  <div className="hls-avatar-placeholder">{initial}</div>
                )}
                {crushType === "super_crush" && (
                  <span className="hls-super-badge" title="Super Crush">⚡</span>
                )}
              </div>
              <span className="hls-name">{displayName}</span>
            </div>
          );
        })}

        {/* Locked likers */}
        {(data.locked ?? []).map(({ likeId, crushType }) => (
          <div key={likeId} className="hls-card hls-card-locked">
            <div className="hls-avatar-wrap">
              <div className="hls-avatar-blurred" aria-hidden="true" />
              {crushType === "super_crush" && (
                <span className="hls-super-badge hls-super-badge-locked" title="Super Crush">⚡</span>
              )}
              <div className="hls-lock-icon" aria-label="Bloqueado">
                <LockIcon />
              </div>
            </div>
            <span className="hls-name-blurred" aria-hidden="true" />
          </div>
        ))}
      </div>

      {/* ── Error message ── */}
      {error && <p className="hls-error">{error}</p>}

      {/* ── Unlock CTA ── */}
      {hasLocked && (
        <div className="hls-cta-wrap">
          <div className="hls-cta-glow" aria-hidden="true" />
          <p className="hls-cta-hint">👀 Descubre quién te dio like antes de que sea tarde</p>
          <div className="hls-cta-buttons">
            <button
              className="hls-unlock-btn"
              onClick={handleUnlock}
              disabled={unlocking}
            >
              {unlocking ? "Desbloqueando…" : `💎 Desbloquear ahora · 🪙${unlockPrice}`}
            </button>
            <Link href="/coins" className="hls-coins-link">
              Comprar monedas →
            </Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .hls-wrap {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.25rem;
          border-radius: var(--radius);
          background: rgba(15,8,32,0.75);
          border: 1px solid rgba(255,45,120,0.22);
          position: relative;
          overflow: hidden;
        }
        .hls-compact { padding: 1rem; gap: 0.75rem; }

        /* ── Header ── */
        .hls-header { display: flex; flex-direction: column; gap: 0.2rem; }
        .hls-title-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .hls-title {
          font-size: 0.88rem;
          font-weight: 800;
          color: var(--text);
        }
        .hls-locked-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.16rem 0.6rem;
          border-radius: var(--radius-pill);
          background: rgba(255,45,120,0.14);
          border: 1px solid rgba(255,45,120,0.32);
          color: #ff6ba8;
          font-size: 0.7rem;
          font-weight: 800;
          animation: hls-pulse 2s ease-in-out infinite;
        }
        @keyframes hls-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(255,45,120,0); }
          50%       { box-shadow: 0 0 10px rgba(255,45,120,0.4); }
        }
        .hls-subtitle {
          font-size: 0.73rem;
          color: rgba(255,255,255,0.42);
          margin: 0;
        }

        /* ── Grid ── */
        .hls-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
          gap: 0.65rem;
        }

        /* ── Card shared ── */
        .hls-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
        }

        /* ── Avatar wrapper ── */
        .hls-avatar-wrap {
          position: relative;
          width: 56px;
          height: 56px;
          flex-shrink: 0;
        }

        /* Revealed card */
        .hls-avatar-img {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(255,45,120,0.5);
          box-shadow: 0 0 14px rgba(255,45,120,0.25);
        }
        .hls-avatar-placeholder {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,45,120,0.35), rgba(224,64,251,0.35));
          border: 2px solid rgba(255,45,120,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          font-weight: 800;
          color: rgba(255,255,255,0.85);
        }
        .hls-name {
          font-size: 0.68rem;
          font-weight: 700;
          color: rgba(255,255,255,0.8);
          text-align: center;
          max-width: 70px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Locked card */
        .hls-avatar-blurred {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,45,120,0.28), rgba(224,64,251,0.28));
          filter: blur(7px);
          border: 2px solid rgba(255,255,255,0.06);
        }
        .hls-lock-icon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.55);
          filter: drop-shadow(0 0 6px rgba(224,64,251,0.4));
        }
        .hls-name-blurred {
          display: block;
          width: 48px;
          height: 8px;
          border-radius: var(--radius-pill);
          background: rgba(255,255,255,0.12);
          filter: blur(3px);
        }

        /* Super crush badge */
        .hls-super-badge {
          position: absolute;
          bottom: -2px;
          right: -4px;
          font-size: 0.75rem;
          background: rgba(251,191,36,0.22);
          border: 1px solid rgba(251,191,36,0.5);
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .hls-super-badge-locked { opacity: 0.6; }

        /* ── Error ── */
        .hls-error {
          font-size: 0.78rem;
          color: #f87171;
          margin: 0;
          padding: 0.45rem 0.75rem;
          border-radius: 8px;
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.25);
        }

        /* ── CTA ── */
        .hls-cta-wrap {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.55rem;
          padding: 1rem;
          border-radius: var(--radius-sm);
          background: rgba(224,64,251,0.06);
          border: 1px solid rgba(224,64,251,0.22);
          text-align: center;
          overflow: hidden;
        }
        .hls-cta-glow {
          position: absolute;
          top: -60%;
          left: 50%;
          transform: translateX(-50%);
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(224,64,251,0.15) 0%, transparent 70%);
          pointer-events: none;
        }
        .hls-cta-hint {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.55);
          margin: 0;
          position: relative;
        }
        .hls-cta-buttons {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: center;
          position: relative;
        }
        .hls-unlock-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.55rem 1.25rem;
          border-radius: var(--radius-pill);
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          animation: hls-glow 2.5s ease-in-out infinite;
          white-space: nowrap;
        }
        .hls-unlock-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          animation: none;
        }
        @keyframes hls-glow {
          0%, 100% { box-shadow: 0 4px 20px rgba(224,64,251,0.3); }
          50%       { box-shadow: 0 4px 35px rgba(224,64,251,0.6), 0 0 20px rgba(255,45,120,0.35); }
        }
        .hls-unlock-btn:hover:not(:disabled) {
          filter: brightness(1.12);
          transform: translateY(-1px);
        }
        .hls-coins-link {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.4);
          text-decoration: none;
          white-space: nowrap;
        }
        .hls-coins-link:hover { color: rgba(255,255,255,0.65); text-decoration: underline; }
      `}</style>
    </div>
  );
}
