"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import GiftEffect from "@/components/GiftEffect";
import { RARITY_STYLES } from "@/lib/gifts";
import GiftPanel from "@/components/GiftPanel";
import GiftEffect from "@/components/GiftEffect";
import { RARITY_STYLES } from "@/lib/gifts";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const LIVE_PROVIDER_KEY = process.env.NEXT_PUBLIC_LIVE_PROVIDER_KEY;

export default function LiveRoomPage() {
  const { id } = useParams();
  const router = useRouter();
  const [live, setLive] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Gift state
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [activeGiftEffect, setActiveGiftEffect] = useState(null);
  const [recentGift, setRecentGift] = useState(null);

  // Private call state
  const [startingCall, setStartingCall] = useState(false);
  const [callError, setCallError] = useState("");

  // Chat state (local only — no backend yet)
  const [chatMessages, setChatMessages] = useState([
    { id: 0, user: "Sistema", text: "¡Bienvenido al directo! 🎉", system: true },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);
  const msgCounterRef = useRef(1);
  const giftEffectTimeoutRef = useRef(null);
  const recentGiftTimeoutRef = useRef(null);

  // Creator mode state
  const [currentUserId, setCurrentUserId] = useState(null);
  const [endingStream, setEndingStream] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    fetch(`${API_URL}/api/lives/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar el directo");
        return res.json();
      })
      .then((data) => setLive(data))
      .catch(() => setError("Directo no encontrado o ya finalizado"));
  }, [id, token]);

  // Fetch current user to detect creator mode
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?._id) setCurrentUserId(String(data._id));
      })
      .catch(() => {});
  }, [token]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      if (giftEffectTimeoutRef.current) clearTimeout(giftEffectTimeoutRef.current);
      if (recentGiftTimeoutRef.current) clearTimeout(recentGiftTimeoutRef.current);
    };
  }, []);

  const sendChatMessage = (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    setChatMessages((prev) => [
      ...prev,
      { id: ++msgCounterRef.current, user: "Tú", text, system: false },
    ]);

    setChatInput("");
  };

  const handleGiftSent = useCallback((data) => {
    const gift = data?.gift || null;
    const senderName = data?.senderName || "Tú";
    const icon = gift?.icon ?? "🎁";
    const name = gift?.name ?? "regalo";

    if (gift) {
      setActiveGiftEffect({ gift, senderName });
      setRecentGift(gift);

      if (giftEffectTimeoutRef.current) clearTimeout(giftEffectTimeoutRef.current);
      if (recentGiftTimeoutRef.current) clearTimeout(recentGiftTimeoutRef.current);

      giftEffectTimeoutRef.current = setTimeout(() => {
        setActiveGiftEffect(null);
      }, gift?.rarity === "vip" || gift?.rarity === "epic" ? 7000 : gift?.rarity === "premium" ? 4500 : 2200);

      recentGiftTimeoutRef.current = setTimeout(() => {
        setRecentGift(null);
      }, 6000);
    }

    setChatMessages((prev) => [
      ...prev,
      {
        id: ++msgCounterRef.current,
        user: senderName,
        text: `${icon} ${name}`,
        gift,
        system: false,
        isGift: true,
      },
    ]);
    if (data?.gift) {
      setActiveGiftEffect(data.gift);
    }
  }, []);

  const handleJoin = async () => {
    if (!token) {
      setJoinError("Debes iniciar sesión para unirte a este directo privado.");
      return;
    }
    setJoining(true);
    setJoinError("");

    try {
      const res = await fetch(`${API_URL}/api/lives/${id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.message || "No se pudo unir al directo");
        return;
      }
      setLive(data);
    } catch {
      setJoinError("No se pudo conectar con el servidor");
    } finally {
      setJoining(false);
    }
  };

  if (error) {
    return (
      <div className="viewer-error">
        <span style={{ fontSize: "3rem" }}>📡</span>
        <h2>Este directo ya terminó</h2>
        <p>{error}</p>
        <Link href="/live" className="btn btn-primary">← Volver a directos</Link>
        <style jsx>{`
          .viewer-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 0.75rem;
            text-align: center;
          }
          .viewer-error h2 { color: var(--text); font-size: 1.4rem; }
          .viewer-error p { color: var(--text-muted); }
        `}</style>
      </div>
    );
  }

  if (!live) {
    return (
      <div className="viewer-loading">
        <div className="spinner" />
        <p>Cargando directo…</p>
        <style jsx>{`
          .viewer-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 1rem;
            color: var(--text-muted);
          }
          .spinner {
            width: 44px;
            height: 44px;
            border: 3px solid rgba(255,15,138,0.15);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Private stream paywall
  if (live.isPrivate && !live.hasAccess) {
    return (
      <div className="viewer-page">
        <div className="paywall card">
          <div className="paywall-icon">🔒</div>
          <h2 className="paywall-title">{live.title}</h2>
          <p className="paywall-streamer">por @{live.user?.username || "anónimo"}</p>
          <p className="paywall-desc">Este directo es privado. Paga la entrada con monedas para acceder.</p>
          <div className="paywall-cost">
            <span className="coin-icon">🪙</span>
            <span className="cost-num">{live.entryCost}</span>
            <span className="cost-label">monedas</span>
          </div>
          {joinError && <div className="error-banner">{joinError}</div>}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? "Procesando…" : `🪙 Pagar ${live.entryCost} monedas y entrar`}
          </button>
          {!token && (
            <p className="paywall-login-hint">
              <Link href="/login" className="link-accent">Inicia sesión</Link> para comprar la entrada.
            </p>
          )}
          <Link href="/live" className="btn btn-secondary">← Volver a directos</Link>
        </div>

        <style jsx>{`
          .viewer-page { display: flex; flex-direction: column; gap: 1rem; }
          .paywall {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 3rem 2rem;
            max-width: 480px;
            margin: 2rem auto;
            text-align: center;
          }
          .paywall-icon { font-size: 3rem; }
          .paywall-title { font-size: 1.4rem; font-weight: 800; color: var(--text); margin: 0; }
          .paywall-streamer { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
          .paywall-desc { color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
          .paywall-cost {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(139,92,246,0.1);
            border: 1px solid rgba(139,92,246,0.3);
            border-radius: var(--radius-pill);
            padding: 0.5rem 1.5rem;
          }
          .coin-icon { font-size: 1.4rem; }
          .cost-num { font-size: 1.75rem; font-weight: 900; color: #a78bfa; }
          .cost-label { font-size: 0.85rem; color: var(--text-muted); font-weight: 600; }
          .error-banner {
            width: 100%;
            background: rgba(244,67,54,0.1);
            border: 1px solid var(--error);
            color: var(--error);
            border-radius: var(--radius-sm);
            padding: 0.65rem 1rem;
            font-size: 0.85rem;
          }
          .paywall-login-hint { font-size: 0.8rem; color: var(--text-muted); }
          .link-accent { color: var(--accent); text-decoration: underline; }
        `}</style>
      </div>
    );
  }

  const isCreator = !!(currentUserId && live.user?._id && currentUserId === String(live.user._id));

  const privateCallEnabled = live.user?.creatorProfile?.privateCallEnabled;
  const pricePerMinute = live.user?.creatorProfile?.pricePerMinute ?? 0;

  const handleStartPrivateCall = async () => {
    if (!token) {
      setCallError("Debes iniciar sesión para realizar llamadas privadas.");
      return;
    }
    setStartingCall(true);
    setCallError("");

    try {
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientId: live.user._id, type: "paid_creator" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al iniciar la llamada");
      router.push(`/call/${data._id}`);
    } catch (err) {
      setCallError(err.message);
    } finally {
      setStartingCall(false);
    }
  };

  const handleEndStream = async () => {
    if (!token) return;
    setEndingStream(true);
    try {
      await fetch(`${API_URL}/api/lives/${id}/end`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore — redirect regardless
    } finally {
      setEndingStream(false);
      router.push("/live");
    }
  };

  const playerUrl = LIVE_PROVIDER_KEY && live.streamKey
    ? `https://wl.cinectar.com/player/${encodeURIComponent(LIVE_PROVIDER_KEY)}/${encodeURIComponent(live.streamKey)}`
    : null;

  const creatorName = live.user?.username || live.user?.name || "Creador";
  const recentGiftRarity = recentGift?.rarity || "common";
  const rarityStyle = RARITY_STYLES?.[recentGiftRarity] || {};

  return (
    <div className="room">
      <div className="room-layout">
        <div className="room-main">
          <div className="video-wrap">
            {playerUrl ? (
              <iframe
                src={playerUrl}
                allow="autoplay; fullscreen"
                allowFullScreen
                title={live.title}
                className="player-frame"
              />
            ) : (
              <div className="video-placeholder">
                <div className="video-placeholder-icon">🎥</div>
                <p className="video-placeholder-text">Transmisión en vivo</p>
              </div>
            )}

            {activeGiftEffect ? (
              <GiftEffect
                gift={activeGiftEffect.gift}
                senderName={activeGiftEffect.senderName}
              />
            ) : null}

            <div className="video-overlay">
              <div className="overlay-left">
                <span className="badge badge-live pulse">● EN VIVO</span>
                {live.isPrivate && (
                  <span className="badge-private">🔒 PRIVADO</span>
                )}
                {recentGift && (
                  <span
                    className="recent-gift-badge"
                    style={{
                      borderColor: rarityStyle?.borderColor || "rgba(255,255,255,0.12)",
                      boxShadow: rarityStyle?.boxShadow || "0 0 12px rgba(224,64,251,0.18)",
                    }}
                  >
                    {recentGift.icon} {recentGift.name}
                  </span>
                )}
              </div>
              <div className="overlay-right">
                <div className="creator-chip">
                  <div className="creator-avatar">
                    {creatorName[0].toUpperCase()}
                  </div>
                  <span>@{creatorName}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="action-bar">
            <div className="viewers-badge">
              <span>👁</span>
              <span>{live.viewerCount ?? live.viewers ?? 0} viendo</span>
            </div>
            <div className="action-buttons">
              {isCreator ? (
                <>
                  <span className="badge-broadcasting">🔴 TRANSMITIENDO</span>
                  <button
                    className="btn btn-end-stream btn-sm"
                    onClick={handleEndStream}
                    disabled={endingStream}
                  >
                    {endingStream ? "Finalizando…" : "⏹ Finalizar"}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowGiftPanel(true)}>
                    🎁 Regalos
                  </button>
                  {privateCallEnabled ? (
                    <button
                      className="btn btn-call btn-sm"
                      onClick={handleStartPrivateCall}
                      disabled={startingCall}
                      title={`Llamada privada · 🪙 ${pricePerMinute}/min`}
                    >
                      {startingCall ? "Conectando…" : `📞 Llamada · 🪙${pricePerMinute}/min`}
                    </button>
                  ) : (
                    <button className="btn btn-secondary btn-sm" disabled title="El creador no tiene llamadas privadas habilitadas">
                      📞 Llamada privada
                    </button>
                  )}
                  {callError && <span className="call-error-inline">{callError}</span>}
                </>
              )}
              <Link href="/live" className="btn btn-ghost btn-sm">
                ← Directos
              </Link>
            </div>
          </div>

          <div className="stream-info card">
            <div className="stream-meta">
              <div className="stream-creator-row">
                <div className="avatar-placeholder" style={{ width: 40, height: 40, fontSize: "1rem" }}>
                  {creatorName[0].toUpperCase()}
                </div>
                <div>
                  <div className="stream-creator-name">@{creatorName}</div>
                  <span className="badge badge-live" style={{ fontSize: "0.6rem", padding: "0.1rem 0.45rem" }}>EN VIVO</span>
                </div>
              </div>
              <h1 className="stream-title">{live.title}</h1>
              {live.description && <p className="stream-desc">{live.description}</p>}
            </div>
          </div>
        </div>

        <div className="room-chat">
          <div className="chat-header">
            <span className="chat-header-icon">💬</span>
            <span>Chat en vivo</span>
          </div>

          <div className="chat-messages">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-msg${msg.system ? " chat-msg-system" : ""}${msg.isGift ? " chat-msg-gift" : ""}`}
              >
                {msg.system ? (
                  <span className="chat-text-system">{msg.text}</span>
                ) : (
                  <>
                    <span className="chat-user">{msg.user}</span>
                    <span className="chat-text">{msg.text}</span>
                  </>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-form" onSubmit={sendChatMessage}>
            <input
              className="chat-input"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={token ? "Escribe un mensaje…" : "Inicia sesión para chatear"}
              maxLength={200}
              disabled={!token}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!token || !chatInput.trim()}
            >
              ➤
            </button>
          </form>
        </div>
      </div>

      {showGiftPanel && live?.user?._id && (
        <GiftPanel
          receiverId={live.user._id}
          liveId={id}
          context="live"
          onClose={() => setShowGiftPanel(false)}
          onGiftSent={handleGiftSent}
        />
      )}

      {/* ── Gift Effect ─────────────────────────────── */}
      {activeGiftEffect && (
        <GiftEffect
          gift={activeGiftEffect}
          onDone={() => setActiveGiftEffect(null)}
        />
      )}

      <style jsx>{`
        .room {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .room-layout {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 1rem;
          align-items: start;
        }

        @media (max-width: 900px) {
          .room-layout { grid-template-columns: 1fr; }
        }

        .room-main {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .video-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid rgba(255,15,138,0.25);
          box-shadow: 0 0 40px rgba(255,15,138,0.15), var(--shadow);
        }

        .player-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: none;
        }

        .video-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          background: radial-gradient(ellipse at center, rgba(30,8,60,0.95) 0%, rgba(6,2,15,0.98) 100%);
        }

        .video-placeholder-icon { font-size: 3.5rem; opacity: 0.6; }

        .video-placeholder-text {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }

        .video-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          padding: 0.6rem 0.85rem;
          background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%);
          z-index: 3;
        }

        .overlay-left,
        .overlay-right {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .creator-chip {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--radius-pill);
          padding: 0.25rem 0.65rem 0.25rem 0.25rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text);
          backdrop-filter: blur(6px);
        }

        .creator-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--grad-warm);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 900;
          color: #fff;
          flex-shrink: 0;
        }

        .recent-gift-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(12, 8, 26, 0.72);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--radius-pill);
          padding: 0.18rem 0.6rem;
          font-size: 0.68rem;
          font-weight: 800;
          color: #fff;
          backdrop-filter: blur(8px);
          animation: giftBadgeGlow 1.8s ease-in-out infinite;
        }

        @keyframes giftBadgeGlow {
          0%, 100% { transform: translateY(0); opacity: 0.95; }
          50% { transform: translateY(-1px); opacity: 1; }
        }

        .pulse::before {
          content: "";
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ff2d78;
          margin-right: 5px;
          animation: pulse-dot 1.4s infinite;
          vertical-align: middle;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }

        .badge-private {
          background: rgba(139,92,246,0.25);
          color: #c4b5fd;
          border: 1px solid rgba(139,92,246,0.4);
          border-radius: var(--radius-pill);
          padding: 0.15rem 0.55rem;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .viewers-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(26,11,46,0.8);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          padding: 0.35rem 0.9rem;
          font-size: 0.82rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .action-buttons {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .badge-broadcasting {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(255,15,138,0.12);
          border: 1px solid rgba(255,15,138,0.4);
          border-radius: var(--radius-pill);
          padding: 0.25rem 0.75rem;
          font-size: 0.65rem;
          font-weight: 800;
          color: #ff4fbd;
          letter-spacing: 0.07em;
          animation: bcast-glow 2s ease-in-out infinite;
        }

        @keyframes bcast-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(255,15,138,0.2); }
          50% { box-shadow: 0 0 14px rgba(255,15,138,0.45); }
        }

        .btn-end-stream {
          background: rgba(220,38,38,0.12);
          border: 1px solid rgba(220,38,38,0.45);
          color: #f87171;
          border-radius: var(--radius-pill);
          padding: 0.35rem 0.9rem;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
        }

        .btn-end-stream:hover:not(:disabled) {
          background: rgba(220,38,38,0.25);
          border-color: rgba(220,38,38,0.7);
          box-shadow: 0 0 12px rgba(220,38,38,0.3);
        }

        .btn-end-stream:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-call {
          background: rgba(99,102,241,0.15);
          border: 1px solid rgba(99,102,241,0.45);
          color: #a5b4fc;
          border-radius: var(--radius-pill);
          padding: 0.35rem 0.9rem;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
        }

        .btn-call:hover:not(:disabled) {
          background: rgba(99,102,241,0.28);
          border-color: rgba(99,102,241,0.7);
          box-shadow: 0 0 12px rgba(99,102,241,0.35);
        }

        .btn-call:disabled { opacity: 0.5; cursor: not-allowed; }

        .call-error-inline {
          font-size: 0.75rem;
          color: var(--error);
          white-space: nowrap;
        }

        .stream-info {
          background: rgba(20,8,42,0.9);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1rem 1.25rem;
          backdrop-filter: blur(16px);
        }

        .stream-meta {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .stream-creator-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .stream-creator-name {
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--text);
        }

        .stream-title {
          font-size: 1.2rem;
          font-weight: 800;
          background: linear-gradient(135deg, #F8F4FF, #FF4FD8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          line-height: 1.3;
        }

        .stream-desc {
          color: var(--text-muted);
          font-size: 0.875rem;
          line-height: 1.5;
          margin: 0;
        }

        .room-chat {
          display: flex;
          flex-direction: column;
          background: rgba(14,5,32,0.92);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          height: 540px;
          position: sticky;
          top: 1rem;
        }

        @media (max-width: 900px) {
          .room-chat {
            height: 400px;
            position: static;
          }
        }

        .chat-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: rgba(224,64,251,0.06);
          border-bottom: 1px solid var(--border);
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text);
          flex-shrink: 0;
        }

        .chat-header-icon { font-size: 1rem; }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(224,64,251,0.2) transparent;
        }

        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-thumb { background: rgba(224,64,251,0.25); border-radius: 4px; }

        .chat-msg {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
          align-items: baseline;
          font-size: 0.82rem;
          line-height: 1.4;
          word-break: break-word;
        }

        .chat-msg-system {
          justify-content: center;
        }

        .chat-msg-gift {
          background: rgba(224,64,251,0.08);
          border: 1px solid rgba(224,64,251,0.2);
          border-radius: 0.85rem;
          padding: 0.45rem 0.65rem;
          box-shadow: 0 0 14px rgba(224,64,251,0.08);
        }

        .chat-user {
          font-weight: 700;
          color: var(--accent-2);
          white-space: nowrap;
        }

        .chat-user::after { content: ":"; }

        .chat-text { color: var(--text); }

        .chat-text-system {
          font-size: 0.75rem;
          color: var(--text-dim);
          font-style: italic;
          text-align: center;
        }

        .chat-form {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
          background: rgba(10,4,24,0.8);
        }

        .chat-input {
          flex: 1;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          color: var(--text);
          font-size: 0.82rem;
          padding: 0.5rem 0.875rem;
          outline: none;
          transition: border-color var(--transition);
          min-width: 0;
        }

        .chat-input:focus { border-color: rgba(224,64,251,0.45); }
        .chat-input::placeholder { color: var(--text-dim); }
        .chat-input:disabled { opacity: 0.5; cursor: not-allowed; }

        .chat-send-btn {
          flex-shrink: 0;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--grad-warm);
          border: none;
          color: #fff;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity var(--transition), transform var(--transition);
        }

        .chat-send-btn:hover:not(:disabled) { opacity: 0.85; transform: scale(1.08); }
        .chat-send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
