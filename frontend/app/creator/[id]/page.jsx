"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import GiftButton from "@/components/GiftButton";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export default function CreatorProfilePage() {
  const { id } = useParams();
  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [giftSent, setGiftSent] = useState(null);

  // Exclusive content
  const [exclusiveItems, setExclusiveItems] = useState([]);
  const [unlocking, setUnlocking] = useState(null);
  const [unlockError, setUnlockError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API_URL}/api/user/${id}/public`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setCreator(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(`No se pudo cargar el perfil (${err.message})`);
        setLoading(false);
      });

    // Fetch exclusive content for this creator (with token if available for hasAccess check)
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    fetch(`${API_URL}/api/exclusive/creator/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setExclusiveItems(data))
      .catch((err) => console.error("[creator profile] Failed to fetch exclusive content:", err));
  }, [id]);

  const handleUnlock = async (contentId, coinPrice) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setUnlockError("Debes iniciar sesión para desbloquear contenido.");
      return;
    }
    setUnlocking(contentId);
    setUnlockError("");
    try {
      const res = await fetch(`${API_URL}/api/exclusive/${contentId}/unlock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al desbloquear");
      // Navigate to the full content page on success
      window.location.href = `/exclusive/${contentId}`;
    } catch (err) {
      setUnlockError(err.message);
    } finally {
      setUnlocking(null);
    }
  };

  const displayName = creator?.username || creator?.name || "Creator";
  const initial = displayName[0]?.toUpperCase() ?? "?";
  const isLive = creator?.isLive && creator?.liveId;

  return (
    <main className="cp-page">
      {loading && (
        <div className="cp-loading">
          <div className="cp-spinner" />
          <span>Cargando perfil…</span>
        </div>
      )}

      {error && !loading && (
        <div className="cp-error">
          <span>⚠️ {error}</span>
          <Link href="/explore" className="cp-back-link">← Volver a Explorar</Link>
        </div>
      )}

      {creator && !loading && (
        <div className="cp-card">
          {/* Live badge */}
          {isLive && (
            <div className="cp-live-badge">
              <span className="cp-live-dot" />
              EN VIVO
            </div>
          )}

          {/* Avatar */}
          <div className="cp-avatar-wrap">
            {creator.avatar ? (
              <img src={creator.avatar} alt={displayName} className="cp-avatar-img" />
            ) : (
              <div className="cp-avatar-placeholder">{initial}</div>
            )}
            {isLive && <div className="cp-avatar-ring" />}
          </div>

          {/* Name & badges */}
          <div className="cp-identity">
            <h1 className="cp-name">{creator.name || creator.username || "Creator"}</h1>
            {creator.username && <p className="cp-username">@{creator.username}</p>}
            <div className="cp-badges">
              {creator.role === "creator" && <span className="cp-badge cp-badge-creator">CREATOR</span>}
              {creator.isVerifiedCreator && <span className="cp-badge cp-badge-verified">✓ VERIFICADO</span>}
              {creator.creatorProfile?.category && (
                <span className="cp-badge cp-badge-cat">{creator.creatorProfile.category}</span>
              )}
            </div>
          </div>

          {/* Bio */}
          {creator.bio && <p className="cp-bio">{creator.bio}</p>}

          {/* Interests */}
          {creator.interests?.length > 0 && (
            <div className="cp-interests">
              {creator.interests.slice(0, 6).map((tag) => (
                <span key={tag} className="cp-interest-tag">{tag}</span>
              ))}
            </div>
          )}

          {/* Gift sent notification */}
          {giftSent && (
            <div className="cp-gift-notif">
              🎁 ¡Enviaste {giftSent.giftCatalogItem?.icon} <strong>{giftSent.giftCatalogItem?.name}</strong>!
            </div>
          )}

          {/* Action buttons */}
          <div className="cp-actions">
            {isLive && (
              <Link href={`/live/${creator.liveId}`} className="cp-btn cp-btn-live">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
                Ver en vivo
              </Link>
            )}

            {creator.role === "creator" && (
              <GiftButton
                receiverId={creator._id}
                context="profile"
                onGiftSent={(gift) => {
                  setGiftSent(gift);
                  setTimeout(() => setGiftSent(null), 4000);
                }}
              />
            )}
          </div>

          {/* Exclusive content section */}
          {exclusiveItems.length > 0 && (
            <div className="cp-exclusive-section">
              <h2 className="cp-exclusive-title">💎 Contenido exclusivo</h2>
              {unlockError && (
                <div className="cp-unlock-error">{unlockError}</div>
              )}
              <div className="cp-exclusive-grid">
                {exclusiveItems.map((item) => (
                  <div key={item._id} className="cp-exc-card">
                    <Link href={`/exclusive/${item._id}`} className="cp-exc-thumb">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className={`cp-exc-img${item.hasAccess ? "" : " cp-exc-blur"}`}
                        />
                      ) : (
                        <div className="cp-exc-placeholder">💎</div>
                      )}
                      {!item.hasAccess && (
                        <div className="cp-exc-lock-overlay">
                          <LockIcon />
                        </div>
                      )}
                      <div className="cp-exc-price-badge">
                        {item.hasAccess ? (
                          <span className="cp-exc-unlocked">✅ Desbloqueado</span>
                        ) : (
                          <>
                            <LockIcon />
                            <span>{item.coinPrice} 🪙</span>
                          </>
                        )}
                      </div>
                    </Link>
                    <div className="cp-exc-info">
                      <Link href={`/exclusive/${item._id}`} className="cp-exc-item-title">
                        {item.title}
                      </Link>
                      {!item.hasAccess && (
                        <button
                          className="cp-exc-unlock-btn"
                          onClick={() => handleUnlock(item._id, item.coinPrice)}
                          disabled={unlocking === item._id}
                        >
                          {unlocking === item._id ? "Desbloqueando…" : `🔓 Desbloquear — ${item.coinPrice} 🪙`}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link href="/explore" className="cp-back-link">← Volver a Explorar</Link>
        </div>
      )}

      <style jsx>{`
        .cp-page {
          min-height: 100vh;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 3rem 1rem 6rem;
          background: var(--bg);
        }

        .cp-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          color: var(--text-muted);
          margin-top: 6rem;
          font-size: 0.9rem;
        }

        .cp-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(224,64,251,0.2);
          border-top-color: var(--accent-2);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .cp-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          color: var(--error);
          margin-top: 6rem;
          text-align: center;
        }

        .cp-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 2.5rem 2rem;
          max-width: 480px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          box-shadow: var(--shadow), 0 0 40px rgba(139,92,246,0.08);
          position: relative;
          overflow: hidden;
        }

        .cp-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 0%, rgba(224,64,251,0.07) 0%, transparent 65%);
          pointer-events: none;
        }

        .cp-live-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(255,45,120,0.15);
          border: 1px solid rgba(255,45,120,0.4);
          border-radius: var(--radius-pill);
          padding: 0.3rem 0.85rem;
          font-size: 0.7rem;
          font-weight: 800;
          color: var(--accent);
          letter-spacing: 0.1em;
        }

        .cp-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse-dot 1.2s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.3); }
        }

        .cp-avatar-wrap {
          position: relative;
          width: 96px;
          height: 96px;
        }

        .cp-avatar-img,
        .cp-avatar-placeholder {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          object-fit: cover;
        }

        .cp-avatar-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--accent-2), var(--accent));
          font-size: 2.2rem;
          font-weight: 800;
          color: #fff;
        }

        .cp-avatar-ring {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 3px solid var(--accent);
          box-shadow: 0 0 16px rgba(255,45,120,0.5);
          animation: ring-pulse 2s ease-in-out infinite;
        }

        @keyframes ring-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(255,45,120,0.5); }
          50% { box-shadow: 0 0 28px rgba(255,45,120,0.75); }
        }

        .cp-identity {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          text-align: center;
        }

        .cp-name {
          font-size: 1.55rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
          letter-spacing: -0.01em;
        }

        .cp-username {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: 0;
        }

        .cp-badges {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.4rem;
          margin-top: 0.25rem;
        }

        .cp-badge {
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-pill);
        }

        .cp-badge-creator {
          background: rgba(224,64,251,0.15);
          border: 1px solid rgba(224,64,251,0.4);
          color: var(--accent-2);
        }

        .cp-badge-verified {
          background: rgba(96,165,250,0.12);
          border: 1px solid rgba(96,165,250,0.35);
          color: var(--accent-cyan);
        }

        .cp-badge-cat {
          background: rgba(129,140,248,0.1);
          border: 1px solid rgba(129,140,248,0.3);
          color: var(--accent-3);
        }

        .cp-bio {
          font-size: 0.875rem;
          color: var(--text-muted);
          text-align: center;
          line-height: 1.55;
          margin: 0;
          max-width: 360px;
        }

        .cp-interests {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.4rem;
        }

        .cp-interest-tag {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.25rem 0.65rem;
          border-radius: var(--radius-pill);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-muted);
        }

        .cp-gift-notif {
          font-size: 0.85rem;
          font-weight: 600;
          color: #4ade80;
          background: rgba(74,222,128,0.1);
          border: 1px solid rgba(74,222,128,0.25);
          border-radius: var(--radius-sm);
          padding: 0.55rem 1rem;
          text-align: center;
          animation: fade-in 0.3s ease;
        }

        @keyframes fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

        .cp-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.75rem;
          width: 100%;
        }

        .cp-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 1.25rem;
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
          text-decoration: none;
          font-family: inherit;
        }

        .cp-btn-live {
          background: rgba(255,45,120,0.15);
          border: 1px solid rgba(255,45,120,0.4);
          color: var(--accent);
        }

        .cp-btn-live:hover {
          background: rgba(255,45,120,0.25);
          box-shadow: 0 0 16px rgba(255,45,120,0.3);
        }

        .cp-back-link {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition);
          margin-top: 0.25rem;
        }

        .cp-back-link:hover { color: var(--text); }

        /* ── Exclusive content section ── */
        .cp-exclusive-section {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          border-top: 1px solid var(--border);
          padding-top: 1rem;
        }

        .cp-exclusive-title {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.01em;
        }

        .cp-unlock-error {
          background: rgba(244,67,54,0.08);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.6rem 0.85rem;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .cp-exclusive-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.85rem;
        }

        .cp-exc-card {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: border-color var(--transition), box-shadow var(--transition-slow);
        }

        .cp-exc-card:hover {
          border-color: rgba(224,64,251,0.4);
          box-shadow: 0 4px 20px rgba(224,64,251,0.15);
        }

        .cp-exc-thumb {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: rgba(22,12,45,0.9);
          overflow: hidden;
          display: block;
          text-decoration: none;
        }

        .cp-exc-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cp-exc-blur {
          filter: blur(8px) brightness(0.5);
        }

        .cp-exc-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        }

        .cp-exc-lock-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.7);
        }

        .cp-exc-lock-overlay :global(svg) {
          width: 28px;
          height: 28px;
          filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6));
        }

        .cp-exc-price-badge {
          position: absolute;
          top: 0.4rem;
          right: 0.4rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(224,64,251,0.5);
          border-radius: var(--radius-pill);
          padding: 0.15rem 0.5rem;
          font-size: 0.68rem;
          font-weight: 700;
          color: #e040fb;
        }

        .cp-exc-price-badge :global(svg) {
          width: 10px;
          height: 10px;
        }

        .cp-exc-unlocked {
          color: #4ade80;
          font-size: 0.68rem;
          font-weight: 700;
        }

        .cp-exc-info {
          padding: 0.6rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .cp-exc-item-title {
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

        .cp-exc-item-title:hover { color: #e040fb; }

        .cp-exc-unlock-btn {
          background: linear-gradient(135deg, rgba(162,28,175,0.2), rgba(224,64,251,0.1));
          border: 1px solid rgba(224,64,251,0.35);
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

        .cp-exc-unlock-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(162,28,175,0.35), rgba(224,64,251,0.2));
          box-shadow: 0 0 12px rgba(224,64,251,0.3);
        }

        .cp-exc-unlock-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 480px) {
          .cp-page { padding: 2rem 0.75rem 5rem; }
          .cp-card { padding: 2rem 1.25rem; }
          .cp-name { font-size: 1.35rem; }
        }
      `}</style>
    </main>
  );
}
