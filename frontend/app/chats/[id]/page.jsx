"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import GiftEffect from "@/components/GiftEffect";
import { RARITY_STYLES } from "@/lib/giftConstants";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ChatConversationPage() {
  const { id } = useParams();
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [otherUser, setOtherUser] = useState(null); // { _id, username, name, avatar, role }
  const [isMatch, setIsMatch] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState("");

  // Gift state
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftCatalog, setGiftCatalog] = useState([]);
  const [selectedGift, setSelectedGift] = useState(null);
  const [sendingGift, setSendingGift] = useState(false);
  const [giftError, setGiftError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [activeGiftEffect, setActiveGiftEffect] = useState(null);
  const giftCounterRef = useRef(0);
  const bottomRef = useRef(null);

  const otherName = otherUser?.username || otherUser?.name || "Usuario";

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    // Fetch current user, chat participants, and messages in parallel
    Promise.all([
      fetch(`${API_URL}/api/user/me`, { headers }).then((r) => {
        if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
        return r.ok ? r.json() : null;
      }),
      fetch(`${API_URL}/api/chats/${id}`, { headers }).then((r) => {
        if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
        return r.ok ? r.json() : null;
      }),
      fetch(`${API_URL}/api/chats/${id}/messages`, { headers }).then((r) => {
        if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
        if (!r.ok) throw new Error("Error al cargar mensajes");
        return r.json();
      }),
    ])
      .then(async ([me, chatData, data]) => {
        const myId = me?._id ?? null;
        setCurrentUserId(myId);
        const msgs = Array.isArray(data) ? data : [];
        setMessages(msgs);

        // Resolve the other participant from chat data
        let other = null;
        if (chatData?.participants) {
          other = chatData.participants.find((p) => String(p._id) !== String(myId)) || null;
        }
        // Fallback: derive from messages
        if (!other) {
          const otherMsg = msgs.find((m) => m.sender?._id !== myId);
          if (otherMsg) other = otherMsg.sender;
        }
        setOtherUser(other);

        // Check match status if we have both IDs
        if (myId && other?._id) {
          try {
            const matchRes = await fetch(`${API_URL}/api/matches/check/${other._id}`, { headers });
            if (matchRes.ok) {
              const matchData = await matchRes.json();
              setIsMatch(!!matchData.match);
            }
          } catch {
            // non-critical
          }
        }
      })
      .catch((err) => {
        if (err.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError("No se pudo cargar la conversación");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    const token = localStorage.getItem("token");
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/chats/${id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) throw new Error("Error al enviar mensaje");
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setText("");
    } catch {
      setError("No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  const handleVideoCall = async (type = "social", callCoins = 0) => {
    if (!otherUser?._id || callLoading) return;
    setCallLoading(true);
    setCallError("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipientId: otherUser._id, type, callCoins }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCallError(data.message || "No se pudo iniciar la llamada");
        return;
      }
      // Navigate to the call room
      router.push(`/call/${data._id}`);
    } catch {
      setCallError("Error de conexión al iniciar la llamada");
    } finally {
      setCallLoading(false);
    }
  };

  const isCreator = otherUser?.role === "creator";
  // Show video call button if: matched users (social call) OR talking to a creator (paid call)
  const canVideoCall = isMatch || isCreator;

  const openGiftModal = () => {
    setGiftError("");
    setCatalogError("");
    setSelectedGift(null);
    if (giftCatalog.length === 0) {
      fetch(`${API_URL}/api/gifts`)
        .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(setGiftCatalog)
        .catch(() => setCatalogError("No se pudieron cargar los regalos. Inténtalo de nuevo."));
    }
    setShowGiftModal(true);
  };

  const handleSendGift = async () => {
    if (!selectedGift || !otherUser?._id) return;
    const token = localStorage.getItem("token");
    if (!token) { setGiftError("Debes iniciar sesión para enviar regalos."); return; }
    setSendingGift(true);
    setGiftError("");
    try {
      const res = await fetch(`${API_URL}/api/gifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          receiverId: otherUser._id,
          giftId: selectedGift._id,
          context: "chat",
          contextId: id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al enviar el regalo");
      // Trigger elegant chat animation
      setActiveGiftEffect(selectedGift);
      // Add special gift bubble to local message list
      setMessages((prev) => [
        ...prev,
        {
          _id: `gift-${++giftCounterRef.current}`,
          sender: { _id: currentUserId },
          isGift: true,
          gift: selectedGift,
          createdAt: new Date().toISOString(),
        },
      ]);
      setSelectedGift(null);
      setShowGiftModal(false);
    } catch (err) {
      setGiftError(err.message);
    } finally {
      setSendingGift(false);
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-header card">
        <Link href="/chats" className="back-btn">← Chats</Link>
        <div className="chat-peer">
          {otherName && (
            <>
              <div className="peer-avatar avatar-placeholder">
                {otherUser?.avatar ? (
                  <img src={otherUser.avatar} alt={otherName} className="peer-avatar-img" />
                ) : (
                  otherName[0].toUpperCase()
                )}
              </div>
              <div className="peer-info">
                <span className="peer-name">{otherName}</span>
                {isCreator && <span className="peer-creator-badge">Creador</span>}
              </div>
            </>
          )}
          {!otherName && <span className="peer-name">Conversación</span>}
        </div>

        {canVideoCall && (
          <button
            className="video-call-btn"
            onClick={() => handleVideoCall(isCreator ? "paid_creator" : "social")}
            disabled={callLoading}
            title={isCreator ? "Llamada privada con creador" : "Videollamada"}
            aria-label="Iniciar videollamada"
          >
            {callLoading ? (
              <span className="call-spinner-sm" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            )}
            <span className="video-call-label">{isCreator ? "Llamada privada" : "Videollamada"}</span>
          </button>
        )}
      </div>

      {callError && <div className="error-banner">{callError}</div>}
      {error && <div className="error-banner">{error}</div>}

      <div className="messages-area">
        {loading && (
          <div className="messages-loading">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`skeleton-bubble ${i % 2 === 0 ? "left" : "right"}`} />
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="empty-state">
            <span style={{ fontSize: "2.5rem" }}>💬</span>
            <p>No hay mensajes aún. ¡Sé el primero en escribir!</p>
          </div>
        )}

        {!loading && messages.map((msg) => {
          const isMine = msg.sender?._id === currentUserId;
          if (msg.isGift) {
            const rs = RARITY_STYLES[msg.gift?.rarity] || RARITY_STYLES.common;
            return (
              <div key={msg._id} className={`bubble-wrap ${isMine ? "mine" : "theirs"}`}>
                {!isMine && (
                  <div className="bubble-avatar avatar-placeholder" style={{ width: 28, height: 28, fontSize: "0.75rem" }}>
                    {(msg.sender?.username || msg.sender?.name || "U")[0].toUpperCase()}
                  </div>
                )}
                <div
                  className="gift-bubble"
                  style={{ "--rc": rs.color, "--rg": rs.glow }}
                >
                  <span className="gift-bubble-icon">{msg.gift?.icon}</span>
                  <div className="gift-bubble-body">
                    <span className="gift-bubble-name">{msg.gift?.name}</span>
                    <span className="gift-bubble-rarity" style={{ color: rs.color }}>{rs.label}</span>
                  </div>
                  <span className="gift-bubble-coins">🪙{msg.gift?.coinCost}</span>
                  <span className="gift-bubble-time">
                    {new Date(msg.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <div key={msg._id} className={`bubble-wrap ${isMine ? "mine" : "theirs"}`}>
              {!isMine && (
                <div className="bubble-avatar avatar-placeholder" style={{ width: 28, height: 28, fontSize: "0.75rem" }}>
                  {(msg.sender?.username || msg.sender?.name || "U")[0].toUpperCase()}
                </div>
              )}
              <div className={`bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
                <p className="bubble-text">{msg.text}</p>
                <span className="bubble-time">
                  {new Date(msg.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Chat Gift animation overlay ─────────── */}
      {activeGiftEffect && (
        <div className="chat-effect-anchor">
          <GiftEffect
            gift={activeGiftEffect}
            senderName="Tú"
            context="chat"
            onDone={() => setActiveGiftEffect(null)}
          />
        </div>
      )}

      <form className="chat-input-bar card" onSubmit={sendMessage}>
        {otherUser && (
          <button
            type="button"
            className="gift-chat-btn"
            onClick={openGiftModal}
            aria-label="Enviar regalo"
            title="Enviar regalo"
          >
            🎁
          </button>
        )}
        <input
          className="input chat-input"
          type="text"
          placeholder="Escribe un mensaje…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          disabled={sending}
        />
        <button
          type="submit"
          className="btn btn-primary send-btn"
          disabled={!text.trim() || sending}
        >
          {sending ? "…" : "Enviar"}
        </button>
      </form>

      {/* ── Gift selection modal ─────────────────── */}
      {showGiftModal && (
        <>
          <div className="chat-gift-overlay" onClick={() => setShowGiftModal(false)} />
          <div className="chat-gift-modal">
            <div className="chat-gift-modal-header">
              <span className="chat-gift-modal-title">🎁 Enviar regalo a @{otherName}</span>
              <button className="chat-gift-modal-close" onClick={() => setShowGiftModal(false)}>✕</button>
            </div>

            {giftError && <div className="chat-gift-alert-error">{giftError}</div>}
            {catalogError && <div className="chat-gift-alert-error">{catalogError}</div>}

            <div className="chat-gift-catalog">
              {giftCatalog.map((g) => {
                const rs = RARITY_STYLES[g.rarity] || RARITY_STYLES.common;
                const isSel = selectedGift?._id === g._id;
                return (
                  <button
                    key={g._id}
                    type="button"
                    className={`chat-gift-item${isSel ? " selected" : ""}`}
                    style={{ "--rc": rs.color, "--rg": rs.glow }}
                    onClick={() => setSelectedGift(g)}
                  >
                    <span className="chat-gift-dot" />
                    <span className="chat-gift-icon">{g.icon}</span>
                    <span className="chat-gift-name">{g.name}</span>
                    <span className="chat-gift-cost">🪙{g.coinCost}</span>
                  </button>
                );
              })}
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSendGift}
              disabled={!selectedGift || sendingGift}
              style={{ width: "100%" }}
            >
              {sendingGift ? "Enviando…" : selectedGift ? `Enviar ${selectedGift.icon} · ${selectedGift.coinCost} 🪙` : "Selecciona un regalo"}
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        .chat-page {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 140px);
          gap: 0.75rem;
        }

        .chat-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          background: rgba(20,8,42,0.9);
          border: 1px solid var(--border-glow);
          border-radius: var(--radius);
          backdrop-filter: blur(16px);
        }

        .back-btn {
          color: var(--text-muted);
          font-size: 0.875rem;
          font-weight: 600;
          flex-shrink: 0;
          transition: color var(--transition);
        }
        .back-btn:hover { color: var(--accent-2); }

        .chat-peer { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; }
        .peer-avatar {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          overflow: hidden;
        }
        .peer-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }
        .peer-info { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
        .peer-name { font-weight: 700; color: var(--text); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .peer-creator-badge {
          display: inline-block;
          font-size: 0.6rem;
          padding: 0.1rem 0.4rem;
          border-radius: var(--radius-pill);
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.2);
          color: var(--accent-green);
          font-weight: 700;
          width: fit-content;
        }

        /* Video call button */
        .video-call-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-sm);
          background: rgba(129,140,248,0.12);
          border: 1px solid rgba(129,140,248,0.3);
          color: var(--accent-3);
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition);
          flex-shrink: 0;
          white-space: nowrap;
        }
        .video-call-btn:hover:not(:disabled) {
          background: rgba(129,140,248,0.2);
          box-shadow: 0 0 16px rgba(129,140,248,0.3);
        }
        .video-call-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .video-call-label {
          display: none;
        }

        @media (min-width: 480px) {
          .video-call-label { display: inline; }
        }

        .call-spinner-sm {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(129,140,248,0.3);
          border-top-color: var(--accent-3);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          padding: 0.5rem 0;
        }

        .bubble-wrap {
          display: flex;
          align-items: flex-end;
          gap: 0.5rem;
        }

        .bubble-wrap.mine { flex-direction: row-reverse; }

        .bubble {
          max-width: 72%;
          padding: 0.65rem 1rem;
          border-radius: 18px;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .bubble-mine {
          background: linear-gradient(135deg, #FF0F8A, #FF4FD8);
          border-bottom-right-radius: 5px;
          box-shadow: 0 4px 14px rgba(255,15,138,0.35);
        }

        .bubble-theirs {
          background: rgba(42,18,82,0.9);
          border: 1px solid rgba(122,43,255,0.25);
          border-bottom-left-radius: 5px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.3);
        }

        .bubble-text {
          font-size: 0.9rem;
          color: var(--text);
          word-break: break-word;
          line-height: 1.45;
        }

        .bubble-mine .bubble-text { color: #fff; }

        .bubble-time {
          font-size: 0.63rem;
          color: rgba(255,255,255,0.55);
          align-self: flex-end;
        }

        .bubble-theirs .bubble-time { color: var(--text-muted); }

        .chat-input-bar {
          display: flex;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          align-items: center;
          background: rgba(20,8,42,0.9);
          border: 1px solid var(--border-glow);
          border-radius: var(--radius);
          backdrop-filter: blur(16px);
        }

        .chat-input {
          flex: 1;
          background: rgba(26,11,46,0.8) !important;
          border-radius: var(--radius) !important;
        }

        .send-btn {
          flex-shrink: 0;
          padding: 0.6rem 1.4rem;
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          background: var(--grad-primary);
          box-shadow: 0 2px 12px rgba(255,15,138,0.4);
        }

        /* Skeletons */
        .messages-loading { display: flex; flex-direction: column; gap: 0.75rem; }

        .skeleton-bubble {
          height: 50px;
          width: 55%;
          border-radius: 18px;
          background: linear-gradient(90deg, rgba(26,11,46,0.8) 25%, rgba(42,18,82,0.8) 50%, rgba(26,11,46,0.8) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border: 1px solid var(--border);
        }

        .skeleton-bubble.right { align-self: flex-end; }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Error */
        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
        }

        /* Empty */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 3rem;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        /* ── Gift chat button ────────────────────── */
        .gift-chat-btn {
          flex-shrink: 0;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(224,64,251,0.3);
          font-size: 1.1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all var(--transition);
        }
        .gift-chat-btn:hover {
          background: rgba(224,64,251,0.22);
          border-color: rgba(224,64,251,0.6);
          box-shadow: 0 0 10px rgba(224,64,251,0.25);
        }

        /* ── Gift bubble (in message list) ─────── */
        .gift-bubble {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: linear-gradient(135deg,
            color-mix(in srgb, var(--rc, #94a3b8) 10%, transparent),
            rgba(10,4,24,0.92));
          border: 1.5px solid var(--rc, #94a3b8);
          border-radius: 14px 14px 14px 4px;
          padding: 0.55rem 0.85rem;
          max-width: 72%;
          box-shadow: 0 0 12px color-mix(in srgb, var(--rg, rgba(148,163,184,0.35)) 50%, transparent);
          animation: gift-bub-in 0.3s ease both;
          flex-wrap: wrap;
          gap: 0.4rem;
          row-gap: 0.25rem;
        }

        .bubble-wrap.mine .gift-bubble {
          border-radius: 14px 14px 4px 14px;
          margin-left: auto;
        }

        @keyframes gift-bub-in {
          from { opacity: 0; transform: scale(0.88) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        .gift-bubble-icon {
          font-size: 1.6rem;
          line-height: 1;
          filter: drop-shadow(0 0 5px var(--rg, rgba(148,163,184,0.4)));
          flex-shrink: 0;
        }

        .gift-bubble-body {
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
          flex: 1;
          min-width: 0;
        }

        .gift-bubble-name {
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .gift-bubble-rarity {
          font-size: 0.62rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .gift-bubble-coins {
          font-size: 0.72rem;
          font-weight: 700;
          color: #fbbf24;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .gift-bubble-time {
          font-size: 0.6rem;
          color: rgba(255,255,255,0.45);
          width: 100%;
          text-align: right;
          margin-top: 0.1rem;
        }

        /* ── Gift modal in chat ──────────────────── */
        .chat-gift-overlay {
          position: fixed;
          inset: 0;
          z-index: 300;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(3px);
        }

        .chat-gift-modal {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          z-index: 400;
          width: min(420px, 100vw);
          background: rgba(12,6,28,0.98);
          border: 1px solid rgba(224,64,251,0.25);
          border-bottom: none;
          border-radius: var(--radius) var(--radius) 0 0;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          box-shadow: 0 -8px 40px rgba(139,92,246,0.15);
          animation: slide-up-modal 0.2s ease;
        }

        @keyframes slide-up-modal {
          from { transform: translateX(-50%) translateY(100%); }
          to   { transform: translateX(-50%) translateY(0); }
        }

        .chat-gift-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .chat-gift-modal-title {
          font-size: 0.92rem;
          font-weight: 800;
          color: var(--text);
        }

        .chat-gift-modal-close {
          background: rgba(255,255,255,0.07);
          border: 1px solid var(--border);
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.8rem;
          transition: all var(--transition);
        }
        .chat-gift-modal-close:hover { background: rgba(255,255,255,0.12); color: var(--text); }

        .chat-gift-alert-error {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--error);
          background: rgba(244,67,54,0.08);
          border: 1px solid var(--error);
          border-radius: var(--radius-sm);
          padding: 0.4rem 0.65rem;
        }

        .chat-gift-catalog {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.45rem;
        }

        .chat-gift-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          padding: 0.6rem 0.2rem 0.45rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.18s ease;
          font-family: inherit;
          position: relative;
        }
        .chat-gift-item:hover,
        .chat-gift-item.selected {
          border-color: var(--rc, rgba(224,64,251,0.4));
          background: rgba(255,255,255,0.05);
          box-shadow: 0 0 12px var(--rg, rgba(224,64,251,0.2));
        }
        .chat-gift-dot {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--rc, #94a3b8);
        }
        .chat-gift-icon { font-size: 1.5rem; line-height: 1; }
        .chat-gift-name { font-size: 0.6rem; font-weight: 700; color: var(--text-muted); text-align: center; }
        .chat-gift-cost { font-size: 0.6rem; color: #fbbf24; font-weight: 600; }

        /* ── Chat gift animation anchor ─────────── */
        .chat-effect-anchor {
          position: fixed;
          bottom: 90px;
          right: 20px;
          z-index: 250;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
