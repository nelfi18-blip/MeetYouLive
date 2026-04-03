"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export default function ExclusiveContent({ creatorId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(null);
  const [unlockError, setUnlockError] = useState("");

  useEffect(() => {
    if (!creatorId) return;
    setLoading(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    fetch(`${API_URL}/api/exclusive/creator/${creatorId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((items) => setData(items))
      .catch((err) => console.error("[ExclusiveContent] Failed to fetch:", err))
      .finally(() => setLoading(false));
  }, [creatorId]);

  const unlock = async (id) => {
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
      window.location.href = `/exclusive/${id}`;
    } catch (err) {
      setUnlockError(err.message);
    } finally {
      setUnlocking(null);
    }
  };

  if (loading || data.length === 0) return null;

  return (
    <div className="exc-section">
      <h2 className="exc-title">💎 Contenido exclusivo</h2>
      {unlockError && <div className="exc-error">{unlockError}</div>}
      <div className="exc-grid">
        {data.map((item) => (
          <div key={item._id} className="exc-card">
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
              {!item.hasAccess && (
                <div className="exc-lock-overlay">
                  <LockIcon />
                </div>
              )}
              <div className="exc-price-badge">
                {item.hasAccess ? (
                  <span className="exc-unlocked">✅ Desbloqueado</span>
                ) : (
                  <>
                    <LockIcon />
                    <span>{item.coinPrice} 🪙</span>
                  </>
                )}
              </div>
            </Link>
            <div className="exc-info">
              <Link href={`/exclusive/${item._id}`} className="exc-item-title">
                {item.title}
              </Link>
              {!item.hasAccess && (
                <button
                  className="exc-unlock-btn"
                  onClick={() => unlock(item._id)}
                  disabled={unlocking === item._id}
                >
                  {unlocking === item._id ? "Desbloqueando…" : `🔓 Desbloquear — ${item.coinPrice} 🪙`}
                </button>
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
          gap: 0.85rem;
          border-top: 1px solid var(--border);
          padding-top: 1rem;
        }

        .exc-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.01em;
        }

        .exc-error {
          background: rgba(244, 67, 54, 0.08);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.6rem 0.85rem;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .exc-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.85rem;
        }

        .exc-card {
          background: rgba(15, 8, 32, 0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: border-color var(--transition), box-shadow var(--transition-slow);
        }

        .exc-card:hover {
          border-color: rgba(224, 64, 251, 0.4);
          box-shadow: 0 4px 20px rgba(224, 64, 251, 0.15);
        }

        .exc-thumb {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: rgba(22, 12, 45, 0.9);
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
        }

        .exc-blur {
          filter: blur(8px) brightness(0.5);
        }

        .exc-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        }

        .exc-lock-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.7);
        }

        .exc-lock-overlay :global(svg) {
          width: 28px;
          height: 28px;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
        }

        .exc-price-badge {
          position: absolute;
          top: 0.4rem;
          right: 0.4rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(224, 64, 251, 0.5);
          border-radius: var(--radius-pill);
          padding: 0.15rem 0.5rem;
          font-size: 0.68rem;
          font-weight: 700;
          color: #e040fb;
        }

        .exc-price-badge :global(svg) {
          width: 10px;
          height: 10px;
        }

        .exc-unlocked {
          color: #4ade80;
          font-size: 0.68rem;
          font-weight: 700;
        }

        .exc-info {
          padding: 0.6rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
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
          line-height: 1.3;
        }

        .exc-item-title:hover {
          color: #e040fb;
        }

        .exc-unlock-btn {
          background: linear-gradient(135deg, rgba(162, 28, 175, 0.2), rgba(224, 64, 251, 0.1));
          border: 1px solid rgba(224, 64, 251, 0.35);
          color: #e040fb;
          border-radius: var(--radius-sm);
          padding: 0.4rem 0.6rem;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
          width: 100%;
          text-align: center;
        }

        .exc-unlock-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(162, 28, 175, 0.35), rgba(224, 64, 251, 0.2));
          box-shadow: 0 0 12px rgba(224, 64, 251, 0.3);
        }

        .exc-unlock-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
