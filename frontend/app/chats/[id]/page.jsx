"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import GiftPanel from "@/components/GiftPanel";
import socket from "@/lib/socket";
import { getUserImage } from "@/lib/imageHelpers";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const formatMessageTime = (value, locale) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
};

const getIsoDateTime = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export default function ChatConversationPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useLanguage();
  const locale = t("chatPremium.locale");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [otherUser, setOtherUser] = useState(null); // { _id, username, name, avatar, role }
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const [isMatch, setIsMatch] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState("");
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [chatGiftNotif, setChatGiftNotif] = useState(null); // For displaying gift notifications
  const bottomRef = useRef(null);
  
  // Context naming note:
  // - Stored context: "private_call" (distinguishes from public chat rooms in data layer)
  // - Displayed context: "chat" (matches "Chat" page terminology for users)
  // - Backend maps "private_call" → "chat" in socket events for UI clarity

  const otherName = otherUser?.username || otherUser?.name || "Usuario";
  const otherImage = getUserImage(otherUser);

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
        setError(t("chatPremium.conversationLoadError"));
      })
      .finally(() => setLoading(false));
  }, [id, router, t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!otherUser?._id) return;

    const handleOnline = ({ userId }) => {
      if (String(userId) === String(otherUser._id)) setIsOtherOnline(true);
    };
    const handleOffline = ({ userId }) => {
      if (String(userId) === String(otherUser._id)) setIsOtherOnline(false);
    };

    socket.on("USER_ONLINE", handleOnline);
    socket.on("USER_OFFLINE", handleOffline);
    return () => {
      socket.off("USER_ONLINE", handleOnline);
      socket.off("USER_OFFLINE", handleOffline);
    };
  }, [otherUser?._id]);

  // Socket listener for chat gifts
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    let mounted = true;
    let timeoutId = null;
    if (!socket) return;
    
    const handleChatGift = (data) => {
      if (!mounted) return;
      setChatGiftNotif(data);
      timeoutId = setTimeout(() => {
        if (mounted) setChatGiftNotif(null);
      }, 5000);
    };
    
    socket.on("CHAT_GIFT_SENT", handleChatGift);
    
    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      socket.off("CHAT_GIFT_SENT", handleChatGift);
    };
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    const token = localStorage.getItem("token");
    setSending(true);
    setError("");
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
      setError(t("chatPremium.sendError"));
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

  return (
    <div className="chat-page">
      <header className="chat-header">
        <Link href="/chats" className="back-btn" aria-label={t("chatPremium.backToChats")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          <span>{t("chatPremium.backToChats")}</span>
        </Link>

        <div className="chat-peer">
          {otherName && (
            <>
              <div className="peer-avatar-wrap" data-online={isOtherOnline}>
                <div className="peer-avatar avatar-placeholder">
                  {otherImage ? (
                    <img src={otherImage} alt={otherName} className="peer-avatar-img" />
                  ) : (
                    otherName[0].toUpperCase()
                  )}
                </div>
                {isOtherOnline && <span className="peer-online-dot" aria-label={t("chatPremium.online")} />}
              </div>
              <div className="peer-info">
                <span className="peer-name">{otherName}</span>
                <span className="peer-status">{isOtherOnline ? t("chatPremium.onlineNow") : t("chatPremium.privateChat")}</span>
                {isCreator && <span className="peer-creator-badge">{t("chatPremium.creator")}</span>}
              </div>
            </>
          )}
          {!otherName && <span className="peer-name">{t("chatPremium.conversation")}</span>}
        </div>

        <div className="header-actions">
          <button type="button" className="icon-action muted" title={t("chatPremium.imageSoon")} aria-label={t("chatPremium.imageSoon")} disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          </button>
          <button type="button" className="icon-action muted" title={t("chatPremium.voiceSoon")} aria-label={t("chatPremium.voiceSoon")} disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </button>
          <button
            type="button"
            className={`icon-action video ${canVideoCall ? "active" : "muted"}`}
            onClick={() => canVideoCall && handleVideoCall(isCreator ? "paid_creator" : "social")}
            disabled={!canVideoCall || callLoading}
            title={canVideoCall ? (isCreator ? t("chatPremium.privateCreatorCall") : t("chatPremium.videoCall")) : t("chatPremium.videoSoon")}
            aria-label={canVideoCall ? t("chatPremium.startVideoCall") : t("chatPremium.videoSoon")}
          >
            {callLoading ? (
              <span className="call-spinner-sm" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            )}
          </button>
        </div>
      </header>

      {callError && <div className="error-banner">{callError}</div>}
      {error && <div className="error-banner">{error}</div>}

      <main className="messages-area" aria-label={t("chatPremium.messagesAria")}>
        {loading && (
          <div className="messages-loading">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`skeleton-bubble ${i % 2 === 0 ? "left" : "right"}`} />
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-orb">💬</div>
            <span>{t("chatPremium.premiumReady")}</span>
            <h3>{t("chatPremium.startConversation")}</h3>
            <p>{t("chatPremium.emptyConversationText")}</p>
          </div>
        )}

        {!loading && messages.map((msg) => {
          const isMine = msg.sender?._id === currentUserId;
          const senderImage = getUserImage(msg.sender);
          const senderName = msg.sender?.username || msg.sender?.name || "Usuario";
          return (
            <div key={msg._id} className={`bubble-wrap ${isMine ? "mine" : "theirs"}`}>
              {!isMine && (
                <div className="bubble-avatar avatar-placeholder">
                  {senderImage ? (
                    <img src={senderImage} alt={senderName} className="bubble-avatar-img" />
                  ) : (
                    senderName[0].toUpperCase()
                  )}
                </div>
              )}
              <div className={`bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
                <p className="bubble-text">{msg.text}</p>
                <time className="bubble-time" dateTime={getIsoDateTime(msg.createdAt)}>
                  {formatMessageTime(msg.createdAt, locale)}
                </time>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </main>

      <form className="chat-input-bar" onSubmit={sendMessage}>
        <div className="composer-actions">
          {otherUser?._id && currentUserId && String(otherUser._id) !== String(currentUserId) && (
            <button
              type="button"
              className="composer-btn gift-btn-chat"
              onClick={() => setShowGiftPanel(true)}
              aria-label={t("chatPremium.sendGift")}
              title={`${t("chatPremium.sendGift")} 🎁`}
            >
              🎁
            </button>
          )}
          <button type="button" className="composer-btn muted" title={t("chatPremium.imageSoon")} aria-label={t("chatPremium.imageSoon")} disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          </button>
          <button type="button" className="composer-btn muted" title={t("chatPremium.voiceSoon")} aria-label={t("chatPremium.voiceSoon")} disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
          </button>
        </div>
        <div className="input-shell">
          <input
            className="chat-input"
            type="text"
            placeholder={t("chatPremium.messagePlaceholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            disabled={sending}
          />
        </div>
        <button
          type="submit"
          className="send-btn"
          disabled={!text.trim() || sending}
          aria-label={t("chatPremium.send")}
        >
          {sending ? (
            <span className="send-dots">…</span>
          ) : (
            <>
              <span>{t("chatPremium.send")}</span>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </>
          )}
        </button>
      </form>

      {showGiftPanel && otherUser?._id && (
        <GiftPanel
          receiverId={String(otherUser._id)}
          context="private_call"
          onClose={() => setShowGiftPanel(false)}
          onGiftSent={(gift) => {
            setShowGiftPanel(false);
            // Show gift notification in chat
            setChatGiftNotif({
              senderName: "Tú",
              giftName: gift.giftCatalogItem?.name || "un regalo",
              giftIcon: gift.giftCatalogItem?.icon || "🎁",
              quantity: gift.quantity || 1,
            });
            // Note: This timeout is user-triggered and brief (5s), but we could track
            // it for consistency if needed. For now, keeping it simple.
            setTimeout(() => setChatGiftNotif(null), 5000);
          }}
        />
      )}

      {/* Chat gift notification */}
      {chatGiftNotif && (
        <div className="chat-gift-notif">
          <span className="chat-gift-icon">{chatGiftNotif.giftIcon}</span>
          <span className="chat-gift-text">
            🎁 <strong>{chatGiftNotif.senderName}</strong> envió{" "}
            {chatGiftNotif.quantity > 1 ? `${chatGiftNotif.quantity}x ` : ""}
            <strong>{chatGiftNotif.giftName}</strong>
          </span>
        </div>
      )}

      <style jsx>{`
        .chat-page {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 140px);
          min-height: 560px;
          gap: 0.85rem;
          position: relative;
        }

        .chat-header {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 0.9rem;
          padding: 0.9rem 1rem;
          background:
            radial-gradient(circle at 18% 0%, rgba(224,64,251,0.18), transparent 34%),
            linear-gradient(145deg, rgba(32,18,68,0.94), rgba(15,8,33,0.98));
          border: 1px solid rgba(236,124,255,0.34);
          border-radius: 26px;
          box-shadow: var(--shadow-glass), inset 0 1px 0 rgba(255,255,255,0.08);
          backdrop-filter: blur(18px);
        }
        .chat-header::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 15%, rgba(255,255,255,0.07) 45%, transparent 72%);
          transform: translateX(-100%);
          animation: headerShimmer 8s ease-in-out infinite;
          pointer-events: none;
        }

        .back-btn,
        .icon-action,
        .chat-peer { position: relative; z-index: 1; }

        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 800;
          flex-shrink: 0;
          transition: color var(--transition), transform var(--transition);
        }
        .back-btn:hover { color: var(--accent-cyan); transform: translateX(-2px); }

        .chat-peer { display: flex; align-items: center; gap: 0.72rem; flex: 1; min-width: 0; }
        .peer-avatar-wrap {
          position: relative;
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          padding: 2px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(224,64,251,0.75), rgba(124,58,237,0.38), rgba(34,211,238,0.55));
          box-shadow: 0 0 0 4px rgba(224,64,251,0.06), 0 12px 24px rgba(0,0,0,0.28);
        }
        .peer-avatar-wrap[data-online="true"] { box-shadow: 0 0 0 4px rgba(52,211,153,0.08), 0 0 22px rgba(52,211,153,0.18); }
        .peer-avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 900;
          overflow: hidden;
          border: 2px solid rgba(15,8,33,0.96);
        }
        .peer-avatar-img,
        .bubble-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
          display: block;
        }
        .peer-online-dot {
          position: absolute;
          right: 2px;
          bottom: 3px;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: var(--accent-green);
          border: 3px solid #120a28;
          box-shadow: 0 0 12px rgba(52,211,153,0.8);
        }
        .peer-info { display: flex; flex-direction: column; gap: 0.12rem; min-width: 0; }
        .peer-name { font-weight: 900; color: var(--text); font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .peer-status { color: var(--text-muted); font-size: 0.72rem; font-weight: 700; }
        .peer-creator-badge {
          display: inline-block;
          font-size: 0.6rem;
          padding: 0.12rem 0.45rem;
          border-radius: var(--radius-pill);
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.2);
          color: var(--accent-green);
          font-weight: 900;
          width: fit-content;
        }

        .header-actions { position: relative; z-index: 1; display: flex; align-items: center; gap: 0.45rem; flex-shrink: 0; }
        .icon-action,
        .composer-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 15px;
          border: 1px solid rgba(236,124,255,0.24);
          background: rgba(255,255,255,0.06);
          color: var(--text-muted);
          cursor: pointer;
          transition: transform var(--transition), border-color var(--transition), box-shadow var(--transition), background var(--transition), color var(--transition);
        }
        .icon-action.active {
          color: #fff;
          border-color: rgba(34,211,238,0.45);
          background: linear-gradient(135deg, rgba(124,58,237,0.34), rgba(34,211,238,0.18));
          box-shadow: 0 0 18px rgba(34,211,238,0.18);
        }
        .icon-action:hover:not(:disabled),
        .composer-btn:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(34,211,238,0.5); color: #fff; }
        .icon-action:disabled,
        .composer-btn:disabled { cursor: not-allowed; opacity: 0.52; }
        .muted { opacity: 0.68; }

        .call-spinner-sm {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(129,140,248,0.3);
          border-top-color: var(--accent-cyan);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }

        .messages-area {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.72rem;
          padding: 0.7rem 0.2rem 0.9rem;
          scroll-behavior: smooth;
        }
        .messages-area::-webkit-scrollbar { width: 8px; }
        .messages-area::-webkit-scrollbar-thumb { background: rgba(236,124,255,0.22); border-radius: var(--radius-pill); }

        .bubble-wrap {
          display: flex;
          align-items: flex-end;
          gap: 0.5rem;
          animation: bubbleIn 0.28s ease both;
        }
        .bubble-wrap.mine { flex-direction: row-reverse; }
        .bubble-avatar {
          width: 30px;
          height: 30px;
          flex-shrink: 0;
          border-radius: 50%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.76rem;
          font-weight: 900;
          box-shadow: 0 0 0 2px rgba(224,64,251,0.14);
        }

        .bubble {
          max-width: min(74%, 620px);
          padding: 0.72rem 0.95rem 0.55rem;
          border-radius: 22px;
          display: flex;
          flex-direction: column;
          gap: 0.22rem;
          position: relative;
          box-shadow: 0 12px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .bubble-mine {
          background: linear-gradient(135deg, #c040ff 0%, #ff4fa3 100%);
          border-bottom-right-radius: 7px;
          color: #fff;
        }
        .bubble-theirs {
          background: linear-gradient(145deg, rgba(42,18,82,0.94), rgba(21,12,46,0.96));
          border: 1px solid rgba(236,124,255,0.22);
          border-bottom-left-radius: 7px;
        }
        .bubble-text {
          font-size: 0.92rem;
          color: var(--text);
          word-break: break-word;
          line-height: 1.48;
          margin: 0;
        }
        .bubble-mine .bubble-text { color: #fff; }
        .bubble-time {
          font-size: 0.63rem;
          color: rgba(255,255,255,0.62);
          align-self: flex-end;
          font-weight: 700;
        }
        .bubble-theirs .bubble-time { color: var(--text-dim); }

        .chat-input-bar {
          display: flex;
          gap: 0.7rem;
          padding: 0.78rem;
          align-items: center;
          background:
            linear-gradient(145deg, rgba(32,18,68,0.94), rgba(15,8,33,0.98));
          border: 1px solid rgba(236,124,255,0.34);
          border-radius: 26px;
          box-shadow: var(--shadow-glass), inset 0 1px 0 rgba(255,255,255,0.08);
          backdrop-filter: blur(18px);
        }
        .composer-actions { display: flex; align-items: center; gap: 0.42rem; flex-shrink: 0; }
        .input-shell {
          flex: 1;
          min-width: 0;
          border-radius: 18px;
          padding: 1px;
          background: linear-gradient(135deg, rgba(224,64,251,0.34), rgba(34,211,238,0.18));
        }
        .chat-input {
          width: 100%;
          min-width: 0;
          height: 44px;
          border: 0;
          outline: none;
          color: var(--text);
          background: rgba(15,8,33,0.92);
          border-radius: 17px;
          padding: 0 0.95rem;
          font: inherit;
        }
        .chat-input::placeholder { color: var(--text-dim); }
        .chat-input:disabled { opacity: 0.65; }

        .send-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          flex-shrink: 0;
          min-width: 106px;
          height: 44px;
          border: 0;
          border-radius: 17px;
          color: #fff;
          font-weight: 900;
          background: var(--grad-primary);
          box-shadow: 0 8px 22px rgba(224,64,251,0.28);
          cursor: pointer;
          transition: transform var(--transition), box-shadow var(--transition), opacity var(--transition);
        }
        .send-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(224,64,251,0.36); }
        .send-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .send-dots { font-size: 1.3rem; line-height: 1; }

        .gift-btn-chat {
          border-color: rgba(251,191,36,0.4);
          background: rgba(251,191,36,0.1);
          color: #fff;
          animation: chatGiftGlow 2.5s ease-in-out infinite;
          font-family: inherit;
          font-size: 1.05rem;
        }
        .gift-btn-chat:hover { box-shadow: 0 0 16px rgba(251,191,36,0.3); }

        .chat-gift-notif {
          position: fixed;
          top: 100px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 150;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1.25rem;
          background: linear-gradient(135deg, rgba(224,64,251,0.95), rgba(139,92,246,0.95));
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: var(--radius);
          box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 20px rgba(224,64,251,0.4);
          backdrop-filter: blur(8px);
          animation: giftNotifSlideDown 0.3s ease, giftNotifPulse 0.5s ease 0.3s;
        }
        .chat-gift-icon { font-size: 2rem; line-height: 1; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3)); animation: giftIconBounce 0.6s ease; }
        .chat-gift-text { font-size: 0.9rem; font-weight: 600; color: #fff; line-height: 1.3; }
        .chat-gift-text strong { font-weight: 800; }

        .messages-loading { display: flex; flex-direction: column; gap: 0.75rem; }
        .skeleton-bubble {
          height: 54px;
          width: 55%;
          border-radius: 22px;
          background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.06) 75%);
          background-size: 220% 100%;
          animation: shimmer 1.45s infinite;
          border: 1px solid rgba(236,124,255,0.18);
        }
        .skeleton-bubble.right { align-self: flex-end; }

        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .empty-state {
          margin: auto;
          width: min(100%, 420px);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.65rem;
          padding: 2.6rem 1.5rem;
          text-align: center;
          color: var(--text-muted);
          border: 1px dashed rgba(139,92,246,0.34);
          border-radius: 28px;
          background: radial-gradient(circle at 50% 0%, rgba(224,64,251,0.16), transparent 40%), rgba(15,8,32,0.46);
        }
        .empty-orb {
          width: 74px;
          height: 74px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 26px;
          background: rgba(224,64,251,0.1);
          border: 1px solid rgba(236,124,255,0.2);
          font-size: 2.1rem;
        }
        .empty-state span { color: var(--accent-cyan); font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
        .empty-state h3 { margin: 0; font-size: 1.2rem; }
        .empty-state p { margin: 0; font-size: 0.9rem; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 220% 0; } 100% { background-position: -220% 0; } }
        @keyframes headerShimmer { 0%, 70% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes bubbleIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes chatGiftGlow { 0%, 100% { box-shadow: 0 0 6px rgba(251,191,36,0.16); } 50% { box-shadow: 0 0 16px rgba(251,191,36,0.4); } }
        @keyframes giftNotifSlideDown { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes giftNotifPulse { 0%, 100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.05); } }
        @keyframes giftIconBounce { 0%, 100% { transform: scale(1); } 25% { transform: scale(1.2) rotate(-10deg); } 50% { transform: scale(1.1) rotate(10deg); } 75% { transform: scale(1.15) rotate(-5deg); } }

        @media (max-width: 720px) {
          .chat-page { height: calc(100vh - 120px); min-height: 520px; }
          .chat-header { border-radius: 22px; padding: 0.78rem; }
          .back-btn span { display: none; }
          .peer-avatar-wrap { width: 44px; height: 44px; }
          .header-actions { gap: 0.32rem; }
          .icon-action { width: 36px; height: 36px; border-radius: 13px; }
          .chat-input-bar { gap: 0.48rem; border-radius: 22px; padding: 0.58rem; }
          .composer-actions { gap: 0.32rem; }
          .composer-btn { width: 36px; height: 36px; border-radius: 13px; }
          .composer-actions .muted { display: none; }
          .send-btn { min-width: 48px; width: 48px; }
          .send-btn span:not(.send-dots) { display: none; }
          .bubble { max-width: 82%; }
        }
      `}</style>
    </div>
  );
}
