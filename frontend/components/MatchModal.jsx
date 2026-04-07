"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * MatchModal — shown after a mutual match is created.
 *
 * Props:
 *  - user: { _id, username, name, avatar, role, isLive, liveId, creatorProfile }
 *  - onClose: () => void
 *  - isSuperCrush: boolean – whether this match was triggered by a super crush
 */
export default function MatchModal({ user, onClose, isSuperCrush = false }) {
  const router = useRouter();
  const [chatLoading, setChatLoading] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [error, setError] = useState("");
  const [particles, setParticles] = useState([]);

  const displayName = user?.username || user?.name || "Usuario";
  const isCreator = user?.role === "creator";
  const isLive = isCreator && user?.isLive && user?.liveId;
  const privateCallEnabled = isCreator && user?.creatorProfile?.privateCallEnabled;
  const pricePerMinute = user?.creatorProfile?.pricePerMinute ?? 0;

  useEffect(() => {
    // Generate sparkle particles for animation
    const pts = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      size: 4 + Math.random() * 8,
      color: i % 3 === 0 ? "#ff2d78" : i % 3 === 1 ? "#e040fb" : "#818cf8",
    }));
    setParticles(pts);
  }, []);

  const startChat = async () => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setChatLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ participantId: user._id }),
      });
      if (res.ok) {
        const chat = await res.json();
        router.push(`/chats/${chat._id}`);
        onClose();
      } else {
        router.push("/chats");
        onClose();
      }
    } catch {
      setError("Error al abrir el chat");
    } finally {
      setChatLoading(false);
    }
  };

  const startPrivateCall = async () => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    setCallLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientId: user._id, type: "paid_creator" }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/call/${data._id}`);
        onClose();
      } else {
        setError(data.message || "No se pudo iniciar la llamada");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setCallLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="match-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* Particles */}
      <div className="particles-layer" aria-hidden="true">
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: `${p.x}%`,
              animationDelay: `${p.delay}s`,
              width: p.size,
              height: p.size,
              background: p.color,
            }}
          />
        ))}
      </div>

      <div className="match-card">
        <div className="match-badge-row">
          <span className="match-badge">{isSuperCrush ? "⚡ Super Crush Match!" : "💘 ¡Es un Match!"}</span>
        </div>

        <div className="match-hearts">
          <span className="heart-big">💗</span>
          {isSuperCrush && <span className="star-badge">✨</span>}
        </div>

        <div className="match-avatar-wrap">
          {user.avatar ? (
            <img src={user.avatar} alt={displayName} className="match-avatar-img" />
          ) : (
            <div className="match-avatar-placeholder">{displayName[0]?.toUpperCase()}</div>
          )}
          {isLive && <span className="live-pip">LIVE</span>}
        </div>

        <h2 className="match-name">{displayName}</h2>

        <div className="match-badges-row">
          {isCreator && <span className="badge-creator">✦ Creator</span>}
          {isSuperCrush && <span className="badge-super">⚡ Super Crush</span>}
        </div>

        <p className="match-subtitle">
          {isSuperCrush
            ? "Tu Super Crush fue correspondido. ¡Conexión especial!"
            : "¡Ambos se gustaron mucho! Empieza una conversación."}
        </p>

        {error && <p className="match-error">{error}</p>}

        <div className="match-ctas">
          <button className="cta-btn cta-chat" onClick={startChat} disabled={chatLoading}>
            <span className="cta-icon">💬</span>
            {chatLoading ? "Abriendo…" : "Chatear ahora"}
          </button>

          {isCreator && (
            <Link href={`/gifts?receiverId=${user._id}`} className="cta-btn cta-gift" onClick={onClose}>
              <span className="cta-icon">🎁</span>
              Enviar regalo
            </Link>
          )}

          {privateCallEnabled && (
            <button className="cta-btn cta-call" onClick={startPrivateCall} disabled={callLoading}>
              <span className="cta-icon">📞</span>
              {callLoading ? "Conectando…" : `Llamada privada · 🪙${pricePerMinute}/min`}
            </button>
          )}

          {isLive && (
            <Link href={`/live/${user.liveId}`} className="cta-btn cta-live" onClick={onClose}>
              <span className="cta-icon">🔴</span>
              Ver en vivo ahora
            </Link>
          )}
        </div>

        <button className="match-close-btn" onClick={onClose} aria-label="Cerrar">
          ✕ Seguir descubriendo
        </button>
      </div>

      <style jsx>{`
        .match-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(5, 0, 18, 0.88);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .particles-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .particle {
          position: absolute;
          border-radius: 50%;
          top: -10px;
          animation: particle-fall 2.5s ease-in forwards;
          opacity: 0.85;
        }
        @keyframes particle-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.85; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }

        .match-card {
          background: linear-gradient(160deg, #130828 0%, #0e051e 100%);
          border: 1px solid rgba(255, 45, 120, 0.4);
          border-radius: 24px;
          padding: 2rem 1.75rem 1.5rem;
          max-width: 400px;
          width: 100%;
          text-align: center;
          position: relative;
          box-shadow: 0 0 60px rgba(255, 45, 120, 0.25), 0 0 120px rgba(224, 64, 251, 0.1);
          animation: card-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes card-pop {
          from { transform: scale(0.7); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }

        .match-badge-row { margin-bottom: 0.5rem; }
        .match-badge {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 0.3rem 1rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          color: #fff;
          box-shadow: 0 0 20px rgba(255, 45, 120, 0.5);
        }

        .match-hearts {
          font-size: 2.5rem;
          margin: 0.5rem 0;
          position: relative;
          display: inline-block;
          animation: hearts-pulse 1.2s ease-in-out infinite;
        }
        @keyframes hearts-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
        .star-badge {
          font-size: 1.4rem;
          position: absolute;
          top: -6px;
          right: -16px;
          animation: star-spin 2s linear infinite;
        }
        @keyframes star-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .match-avatar-wrap {
          position: relative;
          display: inline-block;
          margin: 0.75rem 0;
        }
        .match-avatar-img {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid rgba(255, 45, 120, 0.6);
          box-shadow: 0 0 24px rgba(255, 45, 120, 0.35);
        }
        .match-avatar-placeholder {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.4rem;
          font-weight: 800;
          color: #fff;
        }
        .live-pip {
          position: absolute;
          bottom: 4px;
          right: -4px;
          background: linear-gradient(135deg, #ff0f8a, #e040fb);
          color: #fff;
          font-size: 0.55rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          padding: 0.18rem 0.5rem;
          border-radius: 999px;
        }

        .match-name {
          font-size: 1.4rem;
          font-weight: 800;
          color: #fff;
          margin: 0.2rem 0 0.4rem;
        }

        .match-badges-row {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
          margin-bottom: 0.75rem;
        }
        .badge-creator {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 0.22rem 0.7rem;
          border-radius: 999px;
          background: rgba(52, 211, 153, 0.12);
          border: 1px solid rgba(52, 211, 153, 0.3);
          color: #34d399;
        }
        .badge-super {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 0.22rem 0.7rem;
          border-radius: 999px;
          background: rgba(251, 191, 36, 0.12);
          border: 1px solid rgba(251, 191, 36, 0.35);
          color: #fbbf24;
        }

        .match-subtitle {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.55);
          margin: 0 0 1rem;
          line-height: 1.5;
        }

        .match-error {
          font-size: 0.8rem;
          color: #f87171;
          margin: 0 0 0.75rem;
        }

        .match-ctas {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          margin-bottom: 1rem;
        }

        .cta-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          padding: 0.8rem 1rem;
          border-radius: 12px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid;
          text-decoration: none;
        }
        .cta-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .cta-chat {
          background: linear-gradient(135deg, rgba(255,45,120,0.18), rgba(224,64,251,0.18));
          border-color: rgba(255, 45, 120, 0.5);
          color: #fff;
        }
        .cta-chat:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(255,45,120,0.3), rgba(224,64,251,0.3));
          box-shadow: 0 0 20px rgba(255, 45, 120, 0.3);
        }

        .cta-gift {
          background: rgba(251, 191, 36, 0.08);
          border-color: rgba(251, 191, 36, 0.3);
          color: #fbbf24;
        }
        .cta-gift:hover {
          background: rgba(251, 191, 36, 0.16);
          box-shadow: 0 0 16px rgba(251, 191, 36, 0.2);
        }

        .cta-call {
          background: rgba(99, 102, 241, 0.08);
          border-color: rgba(99, 102, 241, 0.35);
          color: #a5b4fc;
        }
        .cta-call:hover:not(:disabled) {
          background: rgba(99, 102, 241, 0.18);
          box-shadow: 0 0 16px rgba(99, 102, 241, 0.2);
        }

        .cta-live {
          background: linear-gradient(135deg, rgba(255,15,138,0.12), rgba(224,64,251,0.12));
          border-color: rgba(255, 15, 138, 0.4);
          color: #ff0f8a;
        }
        .cta-live:hover {
          background: linear-gradient(135deg, rgba(255,15,138,0.22), rgba(224,64,251,0.22));
          box-shadow: 0 0 20px rgba(255, 15, 138, 0.3);
        }

        .cta-icon { font-size: 1rem; }

        .match-close-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.35);
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0.4rem;
          transition: color 0.2s;
        }
        .match-close-btn:hover { color: rgba(255, 255, 255, 0.65); }
      `}</style>
    </div>
  );
}
