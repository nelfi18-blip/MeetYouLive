"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import GiftEffect from "@/components/GiftEffect";
import { RARITY_STYLES } from "@/lib/giftConstants";

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
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftCatalog, setGiftCatalog] = useState([]);
  const [selectedGift, setSelectedGift] = useState(null);
  const [giftMessage, setGiftMessage] = useState("");
  const [sendingGift, setSendingGift] = useState(false);
  const [giftError, setGiftError] = useState("");
  const [giftSuccess, setGiftSuccess] = useState("");

  // Gift animation overlay
  const [activeGiftEffect, setActiveGiftEffect] = useState(null); // { gift, senderName }
  const [recentGift, setRecentGift] = useState(null); // shown in video overlay badge

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
  }, [id]);

  // Fetch current user to detect creator mode
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?._id) setCurrentUserId(String(data._id)); })
      .catch(() => {});
  }, [token]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

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

  const openGiftModal = useCallback(() => {
    setGiftError("");
    setGiftSuccess("");
    setSelectedGift(null);
    setGiftMessage("");
    if (giftCatalog.length === 0) {
      fetch(`${API_URL}/api/gifts`)
        .then((r) => r.ok ? r.json() : [])
        .then((data) => setGiftCatalog(data))
        .catch(() => {});
    }
    setShowGiftModal(true);
  }, [giftCatalog.length]);

  const handleSendGift = async () => {
    if (!token) { setGiftError("Debes iniciar sesión para enviar regalos."); return; }
    if (!selectedGift) { setGiftError("Selecciona un regalo."); return; }
    if (!live?.user?._id) { setGiftError("No se pudo identificar al creador."); return; }
    setSendingGift(true);
    setGiftError("");
    setGiftSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/gifts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: live.user._id,
          giftId: selectedGift._id,
          liveId: id,
          context: "live",
          contextId: id,
          message: giftMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al enviar el regalo");

      // Trigger gift animation overlay on video
      setActiveGiftEffect({ gift: selectedGift, senderName: "Tú" });
      // Store as recent gift for the video-overlay badge
      setRecentGift(selectedGift);

      // Add special gift chat bubble
      setChatMessages((prev) => [
        ...prev,
        {
          id: ++msgCounterRef.current,
          user: "Tú",
          text: `${selectedGift.icon} ${selectedGift.name}`,
          gift: selectedGift,
          system: false,
          isGift: true,
        },
      ]);

      setGiftSuccess(`¡Enviaste ${selectedGift.icon} ${selectedGift.name} a @${live.user.username || live.user.name}!`);
      setSelectedGift(null);
      setGiftMessage("");
      setTimeout(() => { setShowGiftModal(false); setGiftSuccess(""); }, 2200);
    } catch (err) {
      setGiftError(err.message);
    } finally {
      setSendingGift(false);
    }
  };

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

  return (
    <div className="room">
      {/* ── Two-column layout ────────────────────── */}
      <div className="room-layout">

        {/* LEFT / TOP — Video + info */}
        <div className="room-main">

          {/* Video area */}
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

            {/* ── Gift animation overlay (inside video-wrap) ── */}
            {activeGiftEffect && (
              <GiftEffect
                gift={activeGiftEffect.gift}
                senderName={activeGiftEffect.senderName}
                context="live"
                onDone={() => setActiveGiftEffect(null)}
              />
            )}

            {/* Overlaid info on video */}
            <div className="video-overlay">
              <div className="overlay-left">
                <span className="badge badge-live pulse">● EN VIVO</span>
                {live.isPrivate && (
                  <span className="badge-private">🔒 PRIVADO</span>
                )}
              </div>
              <div className="overlay-right">
                {recentGift && (
                  <div
                    className="recent-gift-chip"
                    style={{ "--rc": (RARITY_STYLES[recentGift.rarity] || RARITY_STYLES.common).color }}
                  >
                    <span>{recentGift.icon}</span>
                    <span className="recent-gift-name">{recentGift.name}</span>
                  </div>
                )}
                <div className="creator-chip">
                  <div className="creator-avatar">
                    {creatorName[0].toUpperCase()}
                  </div>
                  <span>@{creatorName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action bar */}
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
                  <button className="btn btn-primary btn-sm" onClick={openGiftModal}>
                    🎁 Regalo
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

          {/* Stream title / description */}
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

        {/* RIGHT / BOTTOM — Live chat */}
        <div className="room-chat">
          <div className="chat-header">
            <span className="chat-header-icon">💬</span>
            <span>Chat en vivo</span>
          </div>

          <div className="chat-messages">
            {chatMessages.map((msg) => {
              const msgRs = msg.isGift ? (RARITY_STYLES[msg.gift?.rarity] || RARITY_STYLES.common) : null;
              return (
              <div
                key={msg.id}
                className={`chat-msg${msg.system ? " chat-msg-system" : ""}${msg.isGift ? " chat-msg-gift" : ""}`}
                style={msg.isGift ? { "--rc": msgRs.color, "--rg": msgRs.glow } : undefined}
              >
                {msg.isGift ? (
                  <>
                    <span className="chat-gift-icon">{msg.gift.icon}</span>
                    <span className="chat-gift-body">
                      <span className="chat-gift-sender">{msg.user}</span>
                      <span className="chat-gift-name">{msg.gift.name}</span>
                      <span className="chat-gift-rarity" style={{ color: msgRs.color }}>{msgRs.label}</span>
                    </span>
                    <span className="chat-gift-coins">🪙{msg.gift.coinCost}</span>
                  </>
                ) : msg.system ? (
                  <span className="chat-text-system">{msg.text}</span>
                ) : (
                  <>
                    <span className="chat-user">{msg.user}</span>
                    <span className="chat-text">{msg.text}</span>
                  </>
                )}
              </div>
              );
            })}
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

      {/* ── Gift Modal ─────────────────────────────── */}
      {showGiftModal && (
        <>
          <div className="gift-overlay" onClick={() => setShowGiftModal(false)} />
          <div className="gift-modal">
            <div className="gift-modal-header">
              <h2 className="gift-modal-title">🎁 Enviar regalo</h2>
              <button className="gift-modal-close" onClick={() => setShowGiftModal(false)}>✕</button>
            </div>
            <p className="gift-modal-sub">Elige un regalo para @{creatorName}</p>

            {giftSuccess && <div className="gift-alert gift-success">{giftSuccess}</div>}
            {giftError && <div className="gift-alert gift-error">{giftError}</div>}

            {!token && (
              <div className="gift-alert gift-error">
                <Link href="/login" style={{ color: "inherit", textDecoration: "underline" }}>Inicia sesión</Link> para enviar regalos.
              </div>
            )}

            <div className="gift-catalog">
              {giftCatalog.map((gift) => {
                const rs = RARITY_STYLES[gift.rarity] || RARITY_STYLES.common;
                const isSelected = selectedGift?._id === gift._id;
                return (
                  <button
                    key={gift._id}
                    type="button"
                    className={`gift-item${isSelected ? " selected" : ""}`}
                    style={{ "--rarity-color": rs.color, "--rarity-glow": rs.glow }}
                    onClick={() => setSelectedGift(gift)}
                  >
                    <span className="gift-rarity-dot" title={rs.label} />
                    <span className="gift-icon">{gift.icon}</span>
                    <span className="gift-name">{gift.name}</span>
                    <span className="gift-cost">🪙 {gift.coinCost}</span>
                  </button>
                );
              })}
            </div>

            {selectedGift && (
              <div className="gift-selected-bar">
                <span className="gift-selected-info">
                  {selectedGift.icon} <strong>{selectedGift.name}</strong>
                  <em
                    className="gift-rarity-label"
                    style={{ color: (RARITY_STYLES[selectedGift.rarity] || RARITY_STYLES.common).color }}
                  >
                    {" "}· {(RARITY_STYLES[selectedGift.rarity] || RARITY_STYLES.common).label}
                  </em>
                </span>
                <span className="gift-selected-cost">{selectedGift.coinCost} 🪙</span>
              </div>
            )}

            <div className="gift-message-row">
              <input
                type="text"
                className="gift-message-input"
                placeholder="Mensaje opcional…"
                value={giftMessage}
                onChange={(e) => setGiftMessage(e.target.value)}
                maxLength={100}
              />
            </div>

            <button
              className="btn btn-primary btn-lg gift-send-btn"
              onClick={handleSendGift}
              disabled={sendingGift || !selectedGift || !token}
            >
              {sendingGift
                ? "Enviando…"
                : selectedGift
                ? `Enviar ${selectedGift.icon} ${selectedGift.name} — ${selectedGift.coinCost} 🪙`
                : "Selecciona un regalo"}
            </button>

            <p className="gift-coins-hint">
              ¿Necesitas más monedas?{" "}
              <Link href="/coins" className="gift-coins-link">Comprar monedas</Link>
            </p>
          </div>
        </>
      )}

      <style jsx>{`
        /* ── Layout ───────────────────────────────── */
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

        /* ── Room main (left/top) ─────────────────── */
        .room-main {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        /* ── Video ────────────────────────────────── */
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

        /* Overlay bar at bottom of video */
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
        }

        .overlay-left,
        .overlay-right {
          display: flex;
          align-items: center;
          gap: 0.4rem;
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

        /* Pulsing live dot */
        .pulse::before {
          content: '';
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

        /* ── Action bar ───────────────────────────── */
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

        /* ── Creator-mode badge + end-stream button ── */
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

        /* ── Stream info card ─────────────────────── */
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

        /* ── Chat (right/bottom) ──────────────────── */
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

        .chat-user {
          font-weight: 700;
          color: var(--accent-2);
          white-space: nowrap;
        }

        .chat-user::after { content: ':'; }

        .chat-text { color: var(--text); }

        .chat-text-system {
          font-size: 0.75rem;
          color: var(--text-dim);
          font-style: italic;
          text-align: center;
        }

        /* ── Gift chat bubble ─────────────────────── */
        .chat-msg-gift {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          background: linear-gradient(90deg, rgba(0,0,0,0.0) 0%, color-mix(in srgb, var(--rc, #94a3b8) 8%, transparent) 100%);
          border-left: 2px solid var(--rc, #94a3b8);
          border-radius: 0 6px 6px 0;
          padding: 0.3rem 0.5rem 0.3rem 0.45rem;
          margin: 0.15rem 0;
          box-shadow: -2px 0 8px color-mix(in srgb, var(--rg, rgba(148,163,184,0.35)) 60%, transparent);
          animation: gift-bubble-in 0.3s ease both;
        }

        @keyframes gift-bubble-in {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .chat-gift-icon {
          font-size: 1.25rem;
          line-height: 1;
          flex-shrink: 0;
          filter: drop-shadow(0 0 4px var(--rg, rgba(148,163,184,0.5)));
        }

        .chat-gift-body {
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
          min-width: 0;
          flex: 1;
        }

        .chat-gift-sender {
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--rc, #94a3b8);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-gift-name {
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-gift-rarity {
          font-size: 0.6rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          opacity: 0.85;
        }

        .chat-gift-coins {
          font-size: 0.68rem;
          font-weight: 700;
          color: #fbbf24;
          flex-shrink: 0;
          white-space: nowrap;
        }

        /* ── Recent gift chip in video overlay ─────── */
        .recent-gift-chip {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          background: rgba(0,0,0,0.6);
          border: 1px solid var(--rc, rgba(255,255,255,0.2));
          border-radius: var(--radius-pill);
          padding: 0.2rem 0.55rem 0.2rem 0.35rem;
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--rc, var(--text));
          backdrop-filter: blur(6px);
          box-shadow: 0 0 10px color-mix(in srgb, var(--rc, rgba(255,255,255,0.1)) 40%, transparent);
          animation: chip-appear 0.3s ease both;
        }

        @keyframes chip-appear {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }

        .recent-gift-name {
          max-width: 80px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
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

        /* ── Gift Modal ─────────────────────────── */
        .gift-overlay {
          position: fixed;
          inset: 0;
          z-index: 300;
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(4px);
        }

        .gift-modal {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          z-index: 400;
          width: min(480px, 100vw);
          background: rgba(12,6,28,0.98);
          border: 1px solid rgba(224,64,251,0.25);
          border-bottom: none;
          border-radius: var(--radius) var(--radius) 0 0;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          box-shadow: var(--shadow), 0 -8px 40px rgba(139,92,246,0.15);
          animation: slide-up 0.22s ease;
        }

        @keyframes slide-up {
          from { transform: translateX(-50%) translateY(100%); }
          to   { transform: translateX(-50%) translateY(0); }
        }

        .gift-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .gift-modal-title {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text);
        }

        .gift-modal-close {
          background: rgba(255,255,255,0.07);
          border: 1px solid var(--border);
          border-radius: 50%;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.85rem;
          transition: all var(--transition);
        }

        .gift-modal-close:hover { background: rgba(255,255,255,0.12); color: var(--text); }

        .gift-modal-sub {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: -0.5rem 0 0;
        }

        .gift-alert {
          padding: 0.6rem 0.875rem;
          border-radius: var(--radius-sm);
          font-size: 0.82rem;
          font-weight: 600;
        }

        .gift-success {
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.3);
          color: #4ade80;
        }

        .gift-error {
          background: rgba(244,67,54,0.08);
          border: 1px solid var(--error);
          color: var(--error);
        }

        .gift-catalog {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
          gap: 0.5rem;
        }

        .gift-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 0.65rem 0.25rem 0.5rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          font-family: inherit;
        }

        .gift-item:hover {
          border-color: var(--rarity-color, rgba(224,64,251,0.4));
          background: rgba(255,255,255,0.05);
          box-shadow: 0 0 10px var(--rarity-glow, rgba(224,64,251,0.2));
          transform: translateY(-2px);
        }

        .gift-item.selected {
          border-color: var(--rarity-color, var(--accent));
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 16px var(--rarity-glow, rgba(255,15,138,0.3));
        }

        .gift-rarity-dot {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--rarity-color, #94a3b8);
          box-shadow: 0 0 4px var(--rarity-glow, rgba(148,163,184,0.4));
        }

        .gift-icon { font-size: 1.6rem; line-height: 1; }
        .gift-name { font-size: 0.68rem; font-weight: 700; color: var(--text); text-align: center; }
        .gift-cost { font-size: 0.63rem; color: #fbbf24; font-weight: 600; }

        .gift-selected-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-sm);
          padding: 0.5rem 0.75rem;
        }

        .gift-selected-info {
          font-size: 0.82rem;
          color: var(--text-muted);
        }

        .gift-selected-info strong {
          color: var(--text);
          font-weight: 700;
        }

        .gift-rarity-label {
          font-style: normal;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .gift-selected-cost {
          font-size: 0.85rem;
          font-weight: 800;
          color: #fbbf24;
        }

        .gift-message-row { display: flex; }

        .gift-message-input {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          font-size: 0.875rem;
          padding: 0.6rem 0.875rem;
          outline: none;
          transition: border-color var(--transition);
        }

        .gift-message-input:focus { border-color: rgba(139,92,246,0.5); }
        .gift-message-input::placeholder { color: var(--text-dim); }

        .gift-send-btn { align-self: stretch; }

        .gift-coins-hint {
          text-align: center;
          font-size: 0.78rem;
          color: var(--text-dim);
        }

        .gift-coins-link {
          color: var(--accent-orange);
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
