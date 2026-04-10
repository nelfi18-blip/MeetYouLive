"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";
import GiftButton from "@/components/GiftButton";
import UrgencyBanner from "@/components/UrgencyBanner";
import PremiumLockCard from "@/components/PremiumLockCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  );
}

function CallIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  );
}

export default function MatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [callError, setCallError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/matches`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d) setMatches(d.matches || []);
      })
      .catch(() => setError("No se pudieron cargar los matches"))
      .finally(() => setLoading(false));
  }, [router]);

  const startChat = async (userId) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participantId: userId }),
      });
      if (res.ok) {
        const chat = await res.json();
        router.push(`/chats/${chat._id}`);
      }
    } catch {
      // ignore
    }
  };

  const startPrivateCall = async (userId) => {
    const token = localStorage.getItem("token");
    setCallError("");
    try {
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientId: userId, type: "paid_creator" }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/call/${data._id}`);
      } else {
        setCallError(data.message || "No se pudo iniciar la llamada");
        setTimeout(() => setCallError(""), 4000);
      }
    } catch {
      setCallError("Error de conexión");
      setTimeout(() => setCallError(""), 4000);
    }
  };

  return (
    <div className="matches-page">
      {/* Urgency banner */}
      <UrgencyBanner />

      <div className="matches-header">
        <div className="matches-header-icon">
          <HeartIcon />
        </div>
        <div>
          <h1 className="page-title">Tus Matches</h1>
          <p className="page-subtitle">Conexiones mutuas con otros usuarios</p>
        </div>
        <Link href="/crush" className="crush-link-btn">
          ⚡ Crush
        </Link>
      </div>

      {error && <div className="banner-error">{error}</div>}
      {callError && <div className="banner-error">{callError}</div>}

      {loading && (
        <div className="matches-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 200, borderRadius: "var(--radius)" }} />
          ))}
        </div>
      )}

      {!loading && matches.length === 0 && (
        <>
          {/* Locked likes teaser */}
          <div className="locked-likes-section">
            <div className="ll-header">
              <span className="ll-badge">👀 Personas que te dieron like</span>
              <span className="ll-count-badge">+7 nuevos</span>
            </div>
            <div className="ll-blurred-grid">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="ll-blurred-card">
                  <div className="ll-avatar-blur" />
                  <div className="ll-name-blur" />
                </div>
              ))}
            </div>
            <PremiumLockCard
              label="Descubre quién te dio like"
              cta="🔥 Ver quién te dio like"
              href="/coins"
              compact
            />
          </div>

          <div className="empty-state">
            <div className="empty-icon" style={{ color: "var(--accent)" }}>
              <HeartIcon />
            </div>
            <h3>Sin matches aún</h3>
            <p>Explora perfiles y dale like a quienes te llamen la atención. ¡Cuando sea mutuo, aparecerán aquí!</p>
            <Link href="/crush" className="btn btn-primary">
              ⚡ Ir al Crush
            </Link>
            <div className="empty-upsell">
              <p className="empty-upsell-label">💎 Desbloquea más con monedas</p>
              <div className="empty-upsell-actions">
                <Link href="/coins" className="empty-upsell-btn">
                  💎 Desbloquear ahora
                </Link>
                <Link href="/explore" className="empty-upsell-btn empty-upsell-btn-ghost">
                  🔍 Explorar perfiles
                </Link>
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && matches.length > 0 && (
        <div className="matches-grid">
          {matches.map((user) => {
            const displayName = user.username || user.name || "Usuario";
            const initial = displayName[0].toUpperCase();
            const isCreator = user.role === "creator";
            const roleLabel = isCreator ? "Creador" : user.role === "admin" ? "Admin" : "Usuario";
            const privateCallEnabled = isCreator && user.creatorProfile?.privateCallEnabled;
            const pricePerMinute = user.creatorProfile?.pricePerMinute ?? 0;
            const compatibilityScore = user.compatibilityScore ?? null;
            const sharedInterests = user.sharedInterests || [];
            return (
              <div key={user._id} className="match-card">
                <div className="match-avatar-wrap">
                  {user.avatar ? (
                    <img src={user.avatar} alt={displayName} className="match-avatar-img" />
                  ) : (
                    <div className="match-avatar-placeholder">{initial}</div>
                  )}
                  <div className="match-badge-heart">
                    <HeartIcon />
                  </div>
                </div>
                <div className="match-body">
                  <div className="match-name">{displayName}</div>
                  <div className="match-meta-row">
                    {isCreator && (
                      <span className="badge badge-creator">{roleLabel}</span>
                    )}
                    {compatibilityScore !== null && compatibilityScore > 0 && (
                      <span className="match-compat-badge">🔥 {compatibilityScore}%</span>
                    )}
                  </div>
                  {user.bio && <p className="match-bio">{user.bio}</p>}
                  {user.interests?.length > 0 && (
                    <div className="match-interests">
                      {user.interests.slice(0, 3).map((i) => (
                        <span key={i} className={`match-interest-tag${sharedInterests.includes(i) ? " match-interest-shared" : ""}`}>{i}</span>
                      ))}
                    </div>
                  )}
                  {sharedInterests.length > 0 && (
                    <p className="match-shared-label">✨ {sharedInterests.length} interés{sharedInterests.length !== 1 ? "es" : ""} en común</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="match-actions">
                  <button
                    className="btn btn-primary match-action-btn"
                    onClick={() => startChat(user._id)}
                  >
                    <ChatIcon /> Chat
                  </button>

                  {privateCallEnabled ? (
                    <button
                      className="match-action-btn match-call-btn"
                      onClick={() => startPrivateCall(user._id)}
                      title={`Llamada privada · 🪙${pricePerMinute}/min`}
                    >
                      <CallIcon /> ⚡ Llamar ahora · 🪙{pricePerMinute}/min
                    </button>
                  ) : (
                    <button
                      className="match-action-btn match-call-btn match-call-instant"
                      onClick={() => startPrivateCall(user._id)}
                    >
                      <CallIcon /> ⚡ Llamar ahora
                    </button>
                  )}

                  {isCreator && (
                    <div className="match-gift-wrap">
                      <GiftButton receiverId={user._id} context="match" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .matches-page { display: flex; flex-direction: column; gap: 1.75rem; }

        /* Locked likes teaser */
        .locked-likes-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.25rem;
          border-radius: var(--radius);
          background: rgba(15,8,32,0.7);
          border: 1px solid rgba(255,45,120,0.2);
        }

        .ll-header {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        .ll-badge {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text);
        }

        .ll-count-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.18rem 0.65rem;
          border-radius: var(--radius-pill);
          background: rgba(255,45,120,0.15);
          border: 1px solid rgba(255,45,120,0.35);
          color: #ff6ba8;
          font-size: 0.72rem;
          font-weight: 800;
          animation: ll-pulse 2s ease-in-out infinite;
        }

        @keyframes ll-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(255,45,120,0); }
          50%       { box-shadow: 0 0 10px rgba(255,45,120,0.4); }
        }

        .ll-blurred-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
        }

        .ll-blurred-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 0.5rem;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .ll-avatar-blur {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,45,120,0.3), rgba(224,64,251,0.3));
          filter: blur(6px);
        }

        .ll-name-blur {
          width: 60%;
          height: 10px;
          border-radius: var(--radius-pill);
          background: rgba(255,255,255,0.15);
          filter: blur(4px);
        }

        .matches-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .matches-header-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-sm);
          background: rgba(255,45,120,0.1);
          border: 1px solid rgba(255,45,120,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          flex-shrink: 0;
        }
        .crush-link-btn {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 1.1rem;
          border-radius: 999px;
          border: 1px solid rgba(251,191,36,0.35);
          background: rgba(251,191,36,0.07);
          color: #fbbf24;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
        }
        .crush-link-btn:hover {
          background: rgba(251,191,36,0.14);
          box-shadow: 0 0 12px rgba(251,191,36,0.2);
        }

        .matches-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1rem;
        }

        .match-card {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.9rem;
          transition: all var(--transition-slow);
        }
        .match-card:hover {
          border-color: rgba(255,45,120,0.3);
          box-shadow: var(--shadow), 0 0 24px rgba(255,45,120,0.1);
          transform: translateY(-3px);
        }

        .match-avatar-wrap {
          position: relative;
          width: 80px;
          height: 80px;
        }
        .match-avatar-img {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(255,45,120,0.3);
        }
        .match-avatar-placeholder {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          font-weight: 800;
          color: #fff;
        }
        .match-badge-heart {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          box-shadow: 0 2px 8px rgba(255,45,120,0.5);
        }
        .match-badge-heart :global(svg) { width: 12px; height: 12px; }

        .match-body { text-align: center; width: 100%; }
        .match-name {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text);
          margin-bottom: 0.3rem;
        }
        .match-bio {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0.35rem 0 0;
        }
        .match-interests {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          justify-content: center;
          margin-top: 0.5rem;
        }
        .match-interest-tag {
          font-size: 0.65rem;
          padding: 0.2rem 0.55rem;
          border-radius: var(--radius-pill);
          background: rgba(224,64,251,0.08);
          border: 1px solid rgba(224,64,251,0.18);
          color: var(--accent-2);
          font-weight: 600;
        }
        .match-interest-shared {
          background: rgba(255,45,120,0.12);
          border-color: rgba(255,45,120,0.4);
          color: #ff2d78;
          box-shadow: 0 0 6px rgba(255,45,120,0.15);
        }
        .match-meta-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          flex-wrap: wrap;
          margin-bottom: 0.15rem;
        }
        .match-compat-badge {
          font-size: 0.68rem;
          font-weight: 800;
          padding: 0.18rem 0.55rem;
          border-radius: var(--radius-pill);
          background: linear-gradient(135deg, rgba(255,45,120,0.15), rgba(251,191,36,0.15));
          border: 1px solid rgba(255,45,120,0.4);
          color: #fbbf24;
          letter-spacing: 0.02em;
          box-shadow: 0 0 8px rgba(255,45,120,0.18);
          white-space: nowrap;
        }
        .match-shared-label {
          font-size: 0.67rem;
          color: rgba(255,45,120,0.75);
          font-weight: 600;
          margin: 0.3rem 0 0;
          text-align: center;
        }

        .match-actions {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          width: 100%;
        }

        .match-action-btn {
          width: 100%;
          padding: 0.6rem;
          font-size: 0.82rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
        }

        .match-call-btn {
          width: 100%;
          padding: 0.6rem;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          background: rgba(99,102,241,0.08);
          border: 1px solid rgba(99,102,241,0.3);
          border-radius: var(--radius-sm);
          color: #a5b4fc;
          cursor: pointer;
          transition: all 0.2s;
          font-weight: 600;
          animation: call-btn-glow 3s ease-in-out infinite;
        }
        @keyframes call-btn-glow {
          0%, 100% { box-shadow: 0 0 0 rgba(99,102,241,0); }
          50%       { box-shadow: 0 0 14px rgba(99,102,241,0.25); }
        }
        .match-call-btn:hover {
          background: rgba(99,102,241,0.18);
          box-shadow: 0 0 18px rgba(99,102,241,0.35);
        }

        .match-gift-wrap { width: 100%; }
        .match-gift-wrap :global(.gift-btn-wrap) { width: 100%; }
        .match-gift-wrap :global(.gift-trigger-btn) { width: 100%; justify-content: center; }

        .badge-creator {
          display: inline-block;
          font-size: 0.65rem;
          padding: 0.18rem 0.55rem;
          border-radius: var(--radius-pill);
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.25);
          color: var(--accent-green);
          font-weight: 700;
          margin-bottom: 0.25rem;
        }

        .match-call-instant {
          background: rgba(255,45,120,0.08);
          border-color: rgba(255,45,120,0.28);
          color: #ff6ba8;
        }
        .match-call-instant:hover {
          background: rgba(255,45,120,0.18);
          box-shadow: 0 0 12px rgba(255,45,120,0.2);
        }

        /* Empty state upsell */
        .empty-upsell {
          margin-top: 1.25rem;
          padding: 1.25rem 1.5rem;
          border: 1px solid rgba(251,191,36,0.25);
          background: rgba(251,191,36,0.04);
          border-radius: var(--radius);
          text-align: center;
          max-width: 380px;
          width: 100%;
        }
        .empty-upsell-label {
          font-size: 0.85rem;
          color: #fbbf24;
          font-weight: 700;
          margin: 0 0 0.85rem;
        }
        .empty-upsell-actions {
          display: flex;
          gap: 0.65rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        .empty-upsell-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          background: linear-gradient(135deg, rgba(251,191,36,0.18), rgba(224,64,251,0.1));
          border: 1px solid rgba(251,191,36,0.35);
          color: #fbbf24;
          transition: all 0.2s;
        }
        .empty-upsell-btn:hover {
          background: linear-gradient(135deg, rgba(251,191,36,0.28), rgba(224,64,251,0.18));
          box-shadow: 0 0 14px rgba(251,191,36,0.2);
        }
        .empty-upsell-btn-ghost {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.12);
          color: var(--text-muted);
        }
        .empty-upsell-btn-ghost:hover {
          background: rgba(255,255,255,0.08);
          box-shadow: none;
        }
      `}</style>
    </div>
  );
}
