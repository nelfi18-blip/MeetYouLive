"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import GiftPanel from "@/components/GiftPanel";
import PremiumCommunicationActions from "@/components/PremiumCommunicationActions";
import socket, { configureSocketAuth } from "@/lib/socket";
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

const mergeMessagesById = (current, incoming) => {
  const nextMessages = Array.isArray(incoming) ? incoming : [incoming];
  const seen = new Set(current.map((message) => String(message._id)));
  const merged = [...current];
  for (const message of nextMessages) {
    if (!message?._id || seen.has(String(message._id))) continue;
    seen.add(String(message._id));
    merged.push(message);
  }
  return merged.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
};

export default function ChatConversationPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
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
  const [showScrollJump, setShowScrollJump] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const messagesAreaRef = useRef(null);
  const bottomRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const lastMessageCountRef = useRef(0);
  const lastMessageIdRef = useRef(null);
  const getBackendToken = useCallback(
    () =>
      // OAuth users receive the backend JWT from NextAuth; email/password users keep it in localStorage.
      session?.backendToken ||
      (typeof window !== "undefined" ? localStorage.getItem("token") : null),
    [session?.backendToken]
  );
  
  // Context naming note:
  // - Stored context: "private_call" (distinguishes from public chat rooms in data layer)
  // - Displayed context: "chat" (matches "Chat" page terminology for users)
  // - Backend maps "private_call" → "chat" in socket events for UI clarity

  const otherName = otherUser?.username || otherUser?.name || "Usuario";
  const otherImage = getUserImage(otherUser);

  useEffect(() => {
    const token = getBackendToken();
    if (!token) {
      if (sessionStatus === "loading") return;
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
        lastMessageIdRef.current = msgs[msgs.length - 1]?._id || null;

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
  }, [id, router, t, getBackendToken, sessionStatus]);

  useEffect(() => {
    lastMessageIdRef.current = messages[messages.length - 1]?._id || null;
  }, [messages]);

  const scrollToBottom = (behavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
    isNearBottomRef.current = true;
    setShowScrollJump(false);
  };

  const handleMessagesScroll = () => {
    const node = messagesAreaRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const isNearBottom = distanceFromBottom < 120;
    isNearBottomRef.current = isNearBottom;
    setShowScrollJump(!isNearBottom && messages.length > 0);
  };

  useEffect(() => {
    if (loading) return;
    const previousCount = lastMessageCountRef.current;
    const latestMessage = messages[messages.length - 1];
    const latestIsMine = latestMessage?.sender?._id === currentUserId;
    const shouldScroll = previousCount === 0 || isNearBottomRef.current || latestIsMine;

    lastMessageCountRef.current = messages.length;
    if (shouldScroll) scrollToBottom(previousCount === 0 ? "auto" : "smooth");
  }, [messages, currentUserId, loading]);

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

  const fetchNewMessages = useCallback(async () => {
    const token = getBackendToken();
    if (!token) return;
    const after = lastMessageIdRef.current;
    if (!after) return;
    try {
      const res = await fetch(`${API_URL}/api/chats/${id}/messages?after=${encodeURIComponent(after)}`, {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setMessages((prev) => mergeMessagesById(prev, data));
      }
    } catch (err) {
      // Reconnect sync is best-effort; REST remains the source of truth.
      if (process.env.NODE_ENV === "development") console.error("[fetchNewMessages]", err);
    }
  }, [id, getBackendToken]);

  const stopTyping = useCallback(() => {
    if (socket.connected) {
      socket.emit("typing:stop", { chatId: id });
    }
  }, [id]);

  useEffect(() => {
    const token = getBackendToken();
    if (!token || loading) return;

    configureSocketAuth(token);
    if (!socket.connected) socket.connect();

    const joinChat = () => {
      socket.emit("chat:join", { chatId: id }, (response) => {
        if (response && response.ok === false) {
          setError(response.message || t("chatPremium.conversationLoadError"));
        }
      });
      fetchNewMessages();
    };

    const handleRealtimeMessage = ({ chatId, message }) => {
      if (String(chatId) !== String(id) || !message?._id) return;
      setMessages((prev) => mergeMessagesById(prev, message));
    };
    const handleTypingStart = ({ chatId, userId }) => {
      if (!currentUserId) return;
      if (String(chatId) === String(id) && String(userId) !== String(currentUserId)) setIsOtherTyping(true);
    };
    const handleTypingStop = ({ chatId, userId }) => {
      if (!currentUserId) return;
      if (String(chatId) === String(id) && String(userId) !== String(currentUserId)) setIsOtherTyping(false);
    };

    if (socket.connected) joinChat();
    socket.on("connect", joinChat);
    socket.on("message:new", handleRealtimeMessage);
    socket.on("message:sent", handleRealtimeMessage);
    socket.on("typing:start", handleTypingStart);
    socket.on("typing:stop", handleTypingStop);

    return () => {
      stopTyping();
      setIsOtherTyping(false);
      socket.emit("chat:leave", { chatId: id });
      socket.off("connect", joinChat);
      socket.off("message:new", handleRealtimeMessage);
      socket.off("message:sent", handleRealtimeMessage);
      socket.off("typing:start", handleTypingStart);
      socket.off("typing:stop", handleTypingStop);
    };
  }, [id, loading, fetchNewMessages, currentUserId, t, stopTyping, getBackendToken]);

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

    const token = getBackendToken();
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
      setMessages((prev) => mergeMessagesById(prev, msg));
      setText("");
      stopTyping();
    } catch {
      setError(t("chatPremium.sendError"));
    } finally {
      setSending(false);
    }
  };

  const handleTextChange = (e) => {
    const value = e.target.value;
    const wasEmpty = !text.trim();
    setText(value);
    if (!socket.connected) return;
    if (wasEmpty && value.trim()) {
      socket.emit("typing:start", { chatId: id });
    } else if (!value.trim()) {
      stopTyping();
    }
  };

  const handleVideoCall = async (type = "social", callCoins = 0) => {
    if (!otherUser?._id || callLoading) return;
    setCallLoading(true);
    setCallError("");
    const token = getBackendToken();
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
  const getDeliveryLabel = (msg, isLatestMine) => {
    if (msg.readAt || msg.readBy?.length) return t("chatPremium.read");
    return isLatestMine ? t("chatPremium.delivered") : t("chatPremium.sent");
  };

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
                <span className="peer-status">{isOtherOnline ? t("chatPremium.onlineNow") : t("chatPremium.lastSeenUnavailable")}</span>
                {isCreator && <span className="peer-creator-badge">{t("chatPremium.creator")}</span>}
              </div>
            </>
          )}
          {!otherName && <span className="peer-name">{t("chatPremium.conversation")}</span>}
        </div>

        <PremiumCommunicationActions
          isMatch={isMatch}
          // otherUser can be null while chat metadata loads; the contract treats it as a non-creator social flow.
          peer={otherUser}
          className="header-actions"
          buttonClassName="icon-action muted"
        />
      </header>

      {callError && <div className="error-banner">{callError}</div>}
      {error && <div className="error-banner">{error}</div>}

      <main ref={messagesAreaRef} className="messages-area" aria-label={t("chatPremium.messagesAria")} onScroll={handleMessagesScroll}>
        {loading && (
          <div className="messages-loading">
            <div className="skeleton-header-card">
              <div className="skeleton skeleton-avatar-sm" />
              <div className="skeleton-stack">
                <div className="skeleton skeleton-line wide" />
                <div className="skeleton skeleton-line short" />
              </div>
            </div>
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

        {!loading && messages.map((msg, index) => {
          const isMine = msg.sender?._id === currentUserId;
          const senderImage = getUserImage(msg.sender);
          const senderName = msg.sender?.username || msg.sender?.name || "Usuario";
          const isLatestMine = isMine && index === messages.length - 1;
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
                <div className="bubble-meta">
                  <time className="bubble-time" dateTime={getIsoDateTime(msg.createdAt)}>
                    {formatMessageTime(msg.createdAt, locale)}
                  </time>
                  {isMine && (
                    <span
                      className={`delivery-state ${msg.readAt || msg.readBy?.length ? "read" : ""}`}
                      aria-label={`${t("chatPremium.messageStatus")}: ${getDeliveryLabel(msg, isLatestMine)}`}
                    >
                      <span className="delivery-check" aria-hidden="true">✓✓</span>
                      {getDeliveryLabel(msg, isLatestMine)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && isOtherTyping && (
          <div className="typing-indicator" aria-live="polite">
            <span>{t("chatPremium.typing")}</span>
            <i />
            <i />
            <i />
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {showScrollJump && (
        <button type="button" className="scroll-jump" onClick={() => scrollToBottom()} aria-label={t("chatPremium.scrollToLatest")}>
          {t("chatPremium.newMessages")}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
        </button>
      )}

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
          <button type="button" className="composer-btn muted" title={t("chatPremium.emojiSoon")} aria-label={t("chatPremium.emojiSoon")} disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button type="button" className="composer-btn muted" title={t("chatPremium.imageSoon")} aria-label={t("chatPremium.imageSoon")} disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          </button>
          <button type="button" className="composer-btn muted" title={t("chatPremium.cameraSoon")} aria-label={t("chatPremium.cameraSoon")} disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h3l2-3h8l2 3h3a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
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
            onChange={handleTextChange}
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
          gap: 0.82rem;
          position: relative;
        }

        .chat-header {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 0.9rem;
          padding: 0.95rem 1rem;
          background:
            radial-gradient(circle at 18% 0%, rgba(224,64,251,0.28), transparent 34%),
            radial-gradient(circle at 92% 12%, rgba(34,211,238,0.18), transparent 32%),
            linear-gradient(145deg, rgba(32,18,68,0.94), rgba(15,8,33,0.98));
          border: 1px solid rgba(236,124,255,0.34);
          border-radius: 30px;
          box-shadow: 0 20px 52px rgba(4,2,12,0.48), inset 0 1px 0 rgba(255,255,255,0.1);
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
          padding: 0.62rem 0.72rem;
          border-radius: 16px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          transition: color var(--transition), transform var(--transition);
        }
        .back-btn:hover { color: var(--accent-cyan); transform: translateX(-2px); border-color: rgba(34,211,238,0.24); }

        .chat-peer { display: flex; align-items: center; gap: 0.72rem; flex: 1; min-width: 0; }
        .peer-avatar-wrap {
          position: relative;
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          padding: 2px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(224,64,251,0.75), rgba(124,58,237,0.38), rgba(34,211,238,0.55));
          box-shadow: 0 0 0 5px rgba(224,64,251,0.06), 0 12px 24px rgba(0,0,0,0.3);
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
        .peer-info { display: flex; flex-direction: column; gap: 0.14rem; min-width: 0; }
        .peer-name { font-weight: 900; color: var(--text); font-size: 1.04rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.02em; }
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

        .header-actions {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-shrink: 0;
          padding: 0.28rem;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.045);
        }
        .icon-action,
        .composer-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 16px;
          border: 1px solid rgba(236,124,255,0.22);
          background:
            linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025)),
            rgba(255,255,255,0.045);
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
        .composer-btn:disabled { cursor: not-allowed; opacity: 0.58; }
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
          gap: 0.76rem;
          padding: 0.8rem 0.28rem 1rem;
          scroll-behavior: smooth;
          border-radius: 28px;
          background:
            radial-gradient(circle at 12% 0%, rgba(224,64,251,0.06), transparent 34%),
            radial-gradient(circle at 88% 100%, rgba(34,211,238,0.05), transparent 34%);
        }
        .messages-area::-webkit-scrollbar { width: 8px; }
        .messages-area::-webkit-scrollbar-thumb { background: rgba(236,124,255,0.22); border-radius: var(--radius-pill); }

        .bubble-wrap {
          display: flex;
          align-items: flex-end;
          gap: 0.55rem;
          animation: bubbleIn 0.28s ease both;
          padding-inline: 0.2rem;
        }
        .bubble-wrap.mine { flex-direction: row-reverse; }
        .bubble-avatar {
          width: 32px;
          height: 32px;
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
          box-shadow: 0 0 0 2px rgba(224,64,251,0.14), 0 8px 18px rgba(0,0,0,0.26);
        }

        .bubble {
          max-width: min(74%, 620px);
          padding: 0.78rem 0.98rem 0.58rem;
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          gap: 0.22rem;
          position: relative;
          box-shadow: 0 14px 34px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .bubble-mine {
          background:
            radial-gradient(circle at 20% 0%, rgba(255,255,255,0.22), transparent 38%),
            linear-gradient(135deg, #b937ff 0%, #ff4fa3 100%);
          border-bottom-right-radius: 7px;
          color: #fff;
        }
        .bubble-theirs {
          background:
            linear-gradient(145deg, rgba(255,255,255,0.055), transparent 38%),
            linear-gradient(145deg, rgba(42,18,82,0.94), rgba(21,12,46,0.96));
          border: 1px solid rgba(236,124,255,0.22);
          border-bottom-left-radius: 7px;
        }
        .bubble-text {
          font-size: 0.94rem;
          color: var(--text);
          word-break: break-word;
          line-height: 1.48;
          margin: 0;
        }
        .bubble-mine .bubble-text { color: #fff; }
        .bubble-meta {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.38rem;
          flex-wrap: wrap;
        }
        .bubble-time {
          font-size: 0.63rem;
          color: rgba(255,255,255,0.62);
          font-weight: 700;
        }
        .bubble-theirs .bubble-time { color: var(--text-dim); }
        .delivery-state {
          display: inline-flex;
          align-items: center;
          gap: 0.18rem;
          color: rgba(255,255,255,0.72);
          font-size: 0.61rem;
          font-weight: 800;
          line-height: 1;
        }
        .delivery-state.read { color: var(--accent-cyan); }
        .delivery-check { letter-spacing: -0.22em; margin-right: 0.08rem; }

        .typing-indicator {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 0.34rem;
          margin-left: 2.45rem;
          padding: 0.48rem 0.7rem;
          border: 1px solid rgba(236,124,255,0.18);
          border-radius: var(--radius-pill);
          color: var(--text-muted);
          background:
            linear-gradient(135deg, rgba(255,255,255,0.07), transparent 45%),
            rgba(255,255,255,0.055);
          font-size: 0.74rem;
          font-weight: 800;
          animation: bubbleIn 0.24s ease both;
        }
        .typing-indicator i {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent-cyan);
          animation: typingDot 1s ease-in-out infinite;
        }
        .typing-indicator i:nth-child(3) { animation-delay: 0.14s; }
        .typing-indicator i:nth-child(4) { animation-delay: 0.28s; }

        .scroll-jump {
          position: absolute;
          left: 50%;
          bottom: 88px;
          z-index: 5;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.58rem 0.85rem;
          border: 1px solid rgba(34,211,238,0.34);
          border-radius: var(--radius-pill);
          color: #fff;
          background: rgba(15,8,33,0.92);
          box-shadow: 0 12px 30px rgba(0,0,0,0.34), 0 0 18px rgba(34,211,238,0.16);
          backdrop-filter: blur(12px);
          font-size: 0.78rem;
          font-weight: 900;
          cursor: pointer;
          animation: bubbleIn 0.24s ease both;
          transition: transform var(--transition), border-color var(--transition);
        }
        .scroll-jump:hover { transform: translateX(-50%) translateY(-1px); border-color: rgba(34,211,238,0.56); }

        .chat-input-bar {
          display: flex;
          gap: 0.7rem;
          padding: 0.72rem;
          align-items: center;
          background:
            radial-gradient(circle at 8% 0%, rgba(224,64,251,0.14), transparent 36%),
            linear-gradient(145deg, rgba(32,18,68,0.94), rgba(15,8,33,0.98));
          border: 1px solid rgba(236,124,255,0.34);
          border-radius: 28px;
          box-shadow: 0 18px 46px rgba(4,2,12,0.46), inset 0 1px 0 rgba(255,255,255,0.09);
          backdrop-filter: blur(18px);
        }
        .composer-actions {
          display: flex;
          align-items: center;
          gap: 0.38rem;
          flex-shrink: 0;
          padding: 0.24rem;
          border-radius: 20px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .input-shell {
          flex: 1;
          min-width: 0;
          border-radius: 20px;
          padding: 1px;
          background: linear-gradient(135deg, rgba(224,64,251,0.42), rgba(34,211,238,0.22));
          box-shadow: 0 0 0 4px rgba(124,58,237,0.05);
        }
        .chat-input {
          width: 100%;
          min-width: 0;
          height: 46px;
          border: 0;
          outline: none;
          color: var(--text);
          background: rgba(15,8,33,0.92);
          border-radius: 19px;
          padding: 0 1rem;
          font: inherit;
          font-weight: 700;
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
          height: 46px;
          border: 0;
          border-radius: 18px;
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
        .skeleton {
          border-radius: var(--radius-pill);
          background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.06) 75%);
          background-size: 220% 100%;
          animation: shimmer 1.45s infinite;
        }
        .skeleton-header-card {
          display: flex;
          align-items: center;
          gap: 0.72rem;
          width: min(100%, 360px);
          padding: 0.72rem;
          border: 1px solid rgba(236,124,255,0.16);
          border-radius: 22px;
          background: rgba(255,255,255,0.045);
        }
        .skeleton-avatar-sm { width: 38px; height: 38px; flex-shrink: 0; }
        .skeleton-stack { flex: 1; display: flex; flex-direction: column; gap: 0.45rem; }
        .skeleton-line { width: 48%; height: 10px; }
        .skeleton-line.wide { width: 74%; height: 13px; }
        .skeleton-line.short { width: 38%; }
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
        @keyframes typingDot { 0%, 80%, 100% { opacity: 0.35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
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
          .header-actions .camera-action,
          .header-actions .voice-action { display: none; }
          .chat-input-bar { gap: 0.48rem; border-radius: 22px; padding: 0.58rem; }
          .composer-actions { gap: 0.32rem; }
          .composer-btn { width: 36px; height: 36px; border-radius: 13px; }
          .composer-actions .muted { display: none; }
          .send-btn { min-width: 48px; width: 48px; }
          .send-btn span:not(.send-dots) { display: none; }
          .bubble { max-width: 82%; }
          .typing-indicator { margin-left: 0.5rem; }
          .scroll-jump { bottom: 76px; }
        }
      `}</style>
    </div>
  );
}
