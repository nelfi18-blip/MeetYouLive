"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function LockIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export default function ExclusiveContent({ creatorId }) {
  const router = useRouter();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [unlocking, setUnlocking] = useState(null);
  const [unlockError, setUnlockError] = useState("");

  useEffect(() => {
    if (!creatorId) return;
    setLoading(true);
    setFetchError(false);
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    fetch(`${API_URL}/api/exclusive/creator/${creatorId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((items) => setData(items))
      .catch((err) => {
        console.error("[ExclusiveContent] Failed to fetch:", err);
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, [creatorId]);

  const unlock = async (id, coinPrice) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setUnlockError("Debes iniciar sesión para desbloquear contenido.");
      return;
    }
    setUnlocking(id);
    setUnlockError("");
    try {
      const res = await fetch(`${API_URL}/api/exclusive/${id}/unlock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Error al desbloquear");
      router.push(`/exclusive/${id}`);
    } catch (err) {
      setUnlockError(err.message);
    } finally {
      setUnlocking(null);
    }
  };

  if (loading) {
    return (
      <div className="exc-loading">
        <div className="exc-spinner" />
        <style jsx>{`
          .exc-loading {
            width: 100%;
            display: flex;
            justify-content: center;
            padding: 1.5rem 0;
            border-top: 1px solid var(--border);
          }
          .exc-spinner {
            width: 26px;
            height: 26px;
            border: 2px solid rgba(224, 64, 251, 0.2);
            border-top-color: #e040fb;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (fetchError || data.length === 0) return null;

  return (
    <div className="exc-section">
      <div className="exc-header">
        <h2 className="exc-title">💎 Contenido exclusivo</h2>
        <span className="exc-count">{data.length}</span>
      </div>

      {unlockError && <div className="exc-error">{unlockError}</div>}

      <div className="exc-grid">
        {data.map((item) => (
          <div key={item._id} className={`exc-card${item.hasAccess ? " exc-card-unlocked" : ""}`}>
            {/* Thumbnail */}
            <Link href={`/exclusive/${item._id}`} className="exc-thumb">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  className={`exc-img${item.hasAccess ? "" : " exc-blur"}`}
                />
              ) : (
                <div className="exc-placeholder">💎</div>
              )}

              {/* Lock overlay */}
              {!item.hasAccess && (
                <div className="exc-lock-overlay">
                  <div className="exc-lock-circle">
                    <LockIcon size={22} />
                  </div>
                </div>
              )}

              {/* Unlocked checkmark */}
              {item.hasAccess && (
                <div className="exc-unlocked-badge">✅ Desbloqueado</div>
              )}

              {/* Type badge */}
              <div className="exc-type-badge">
                {item.type === "video" ? <><VideoIcon /><span>Vídeo</span></> : <><PhotoIcon /><span>Foto</span></>}
              </div>

              {/* Price badge (locked only) */}
              {!item.hasAccess && (
                <div className="exc-price-badge">
                  <LockIcon size={9} />
                  <span>{item.coinPrice} 🪙</span>
                </div>
              )}
            </Link>

            {/* Card body */}
            <div className="exc-body">
              <Link href={`/exclusive/${item._id}`} className="exc-item-title">
                {item.title}
              </Link>

              {!item.hasAccess ? (
                <button
                  className="exc-unlock-btn"
                  onClick={() => unlock(item._id, item.coinPrice)}
                  disabled={unlocking === item._id}
                >
                  {unlocking === item._id
                    ? <span className="exc-btn-inner"><span className="exc-btn-spinner" />Desbloqueando…</span>
                    : <span className="exc-btn-inner">🔓 Desbloquear — {item.coinPrice} 🪙</span>
                  }
                </button>
              ) : (
                <Link href={`/exclusive/${item._id}`} className="exc-view-btn">
                  {item.type === "video" ? "▶ Ver vídeo" : "🖼 Ver foto"}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .exc-section {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          border-top: 1px solid var(--border);
          padding-top: 1.25rem;
        }

        .exc-header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .exc-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.01em;
        }

        .exc-count {
          background: rgba(162,28,175,0.18);
          border: 1px solid rgba(224,64,251,0.3);
          color: #e040fb;
          font-size: 0.7rem;
          font-weight: 700;
          border-radius: 999px;
          padding: 0.1rem 0.5rem;
          line-height: 1.5;
        }

        .exc-error {
          background: rgba(244, 67, 54, 0.08);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: 10px;
          padding: 0.6rem 0.85rem;
          font-size: 0.8rem;
          font-weight: 600;
        }

        /* Grid: 1 col mobile → 2 cols wider */
        .exc-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.85rem;
        }
        @media (min-width: 420px) {
          .exc-grid { grid-template-columns: repeat(2, 1fr); }
        }

        /* Card */
        .exc-card {
          background: rgba(12, 6, 28, 0.85);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: border-color var(--transition), box-shadow var(--transition-slow), transform var(--transition-slow);
        }
        .exc-card:hover {
          border-color: rgba(224, 64, 251, 0.45);
          box-shadow: 0 6px 28px rgba(162, 28, 175, 0.22);
          transform: translateY(-2px);
        }
        .exc-card-unlocked {
          border-color: rgba(74, 222, 128, 0.2);
        }
        .exc-card-unlocked:hover {
          border-color: rgba(74, 222, 128, 0.4);
          box-shadow: 0 6px 28px rgba(74, 222, 128, 0.12);
        }

        /* Thumbnail */
        .exc-thumb {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: linear-gradient(135deg, rgba(20,10,42,0.95), rgba(8,4,20,0.95));
          overflow: hidden;
          display: block;
          text-decoration: none;
        }

        .exc-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.35s ease;
        }
        .exc-card:hover .exc-img { transform: scale(1.03); }

        .exc-blur {
          filter: blur(10px) brightness(0.45);
        }

        .exc-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        }

        /* Lock overlay */
        .exc-lock-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .exc-lock-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(8px);
          border: 1.5px solid rgba(224,64,251,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #e040fb;
          box-shadow: 0 0 18px rgba(224,64,251,0.35);
        }

        /* Unlocked badge */
        .exc-unlocked-badge {
          position: absolute;
          top: 0.4rem;
          left: 0.4rem;
          background: rgba(34,197,94,0.15);
          border: 1px solid rgba(34,197,94,0.4);
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          font-size: 0.65rem;
          font-weight: 700;
          color: #4ade80;
          backdrop-filter: blur(6px);
        }

        /* Type badge */
        .exc-type-badge {
          position: absolute;
          bottom: 0.4rem;
          left: 0.4rem;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
          font-size: 0.65rem;
          font-weight: 700;
          color: rgba(255,255,255,0.8);
        }

        /* Price badge */
        .exc-price-badge {
          position: absolute;
          top: 0.4rem;
          right: 0.4rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(224, 64, 251, 0.55);
          border-radius: 999px;
          padding: 0.15rem 0.5rem;
          font-size: 0.68rem;
          font-weight: 700;
          color: #e040fb;
          box-shadow: 0 0 10px rgba(224,64,251,0.2);
        }

        /* Card body */
        .exc-body {
          padding: 0.65rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .exc-item-title {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text);
          text-decoration: none;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          line-height: 1.35;
          transition: color var(--transition);
        }
        .exc-item-title:hover { color: #e040fb; }

        /* Unlock button */
        .exc-unlock-btn {
          background: linear-gradient(135deg, rgba(162,28,175,0.25), rgba(224,64,251,0.12));
          border: 1px solid rgba(224,64,251,0.45);
          color: #e040fb;
          border-radius: 10px;
          padding: 0.45rem 0.6rem;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
          width: 100%;
          text-align: center;
        }
        .exc-unlock-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(162,28,175,0.4), rgba(224,64,251,0.22));
          box-shadow: 0 0 16px rgba(224, 64, 251, 0.38);
          transform: translateY(-1px);
        }
        .exc-unlock-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .exc-btn-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }

        .exc-btn-spinner {
          width: 11px;
          height: 11px;
          border: 1.5px solid rgba(224,64,251,0.3);
          border-top-color: #e040fb;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* View button (unlocked) */
        .exc-view-btn {
          display: block;
          text-align: center;
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.3);
          color: #4ade80;
          border-radius: 10px;
          padding: 0.4rem 0.6rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-decoration: none;
          transition: all var(--transition);
        }
        .exc-view-btn:hover {
          background: rgba(34,197,94,0.18);
          box-shadow: 0 0 12px rgba(74,222,128,0.2);
        }
      `}</style>
    </div>
  );
}
