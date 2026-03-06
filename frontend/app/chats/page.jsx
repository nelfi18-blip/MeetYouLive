"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const GIFT_OPTIONS = [
  { emoji: "🌹", label: "Rosa", cost: 10 },
  { emoji: "🔥", label: "Fuego", cost: 25 },
  { emoji: "💎", label: "Diamante", cost: 100 },
  { emoji: "👑", label: "Corona", cost: 250 },
];

export default function ChatsPage() {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/me`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCurrentUserId(d._id); })
      .catch(() => {});

    fetch(`${API_URL}/api/chats`, { headers })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setChats(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudo cargar los chats"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeChat) return;
    const token = localStorage.getItem("token");
    setLoadingMsgs(true);
    setMessages([]);
    fetch(`${API_URL}/api/chats/${activeChat._id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMessages(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim() || !activeChat) return;
    const token = localStorage.getItem("token");
    setSending(true);
    setSendError("");
    try {
      const res = await fetch(`${API_URL}/api/chats/${activeChat._id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: newMsg.trim() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setNewMsg("");
        setChats((prev) =>
          prev.map((c) =>
            c._id === activeChat._id ? { ...c, lastMessage: msg } : c
          )
        );
      } else {
        setSendError("No se pudo enviar el mensaje");
      }
    } catch {
      setSendError("Error de conexión");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getOther = (chat) =>
    chat.participants?.find((p) => p._id !== currentUserId) || {};

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="chats-layout">
      {/* ===== LEFT: Conversations sidebar ===== */}
      <aside className={`chats-sidebar${activeChat ? " hidden-mobile" : ""}`}>
        <div className="sidebar-header">
          <h1 className="sidebar-title">💬 Chats</h1>
          <p className="sidebar-sub">Conversaciones privadas</p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading && (
          <div className="skeleton-list">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        )}

        {!loading && chats.length === 0 && (
          <div className="sidebar-empty">
            <span>💬</span>
            <p>Sin conversaciones aún</p>
            <Link href="/explore" className="btn btn-primary btn-sm">
              🔍 Explorar streamers
            </Link>
          </div>
        )}

        {!loading && chats.length > 0 && (
          <ul className="chat-list">
            {chats.map((chat) => {
              const other = getOther(chat);
              const displayName = other.username || other.name || "Usuario";
              const initial = displayName[0].toUpperCase();
              const isActive = activeChat?._id === chat._id;
              return (
                <li
                  key={chat._id}
                  className={`chat-item${isActive ? " active" : ""}`}
                  onClick={() => setActiveChat(chat)}
                >
                  <div
                    className="avatar-placeholder"
                    style={{ width: 42, height: 42, fontSize: "1rem", flexShrink: 0 }}
                  >
                    {initial}
                  </div>
                  <div className="chat-info">
                    <div className="chat-name">{displayName}</div>
                    {chat.lastMessage && (
                      <div className="chat-preview">{chat.lastMessage.text}</div>
                    )}
                  </div>
                  {chat.lastMessage?.createdAt && (
                    <div className="chat-time">
                      {formatDate(chat.lastMessage.createdAt)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* ===== RIGHT: Active chat panel ===== */}
      <section className={`chat-panel${!activeChat ? " chat-panel-empty" : ""}`}>
        {!activeChat ? (
          <div className="no-chat-selected">
            <span className="no-chat-icon">💬</span>
            <h2>Selecciona una conversación</h2>
            <p>Elige un chat de la lista para empezar a hablar</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="chat-header">
              <button
                className="btn btn-ghost back-btn"
                aria-label="Volver a la lista de conversaciones"
                onClick={() => setActiveChat(null)}
              >
                ← Volver
              </button>
              <div className="chat-header-info">
                <div
                  className="avatar-placeholder"
                  style={{ width: 38, height: 38, fontSize: "1rem" }}
                >
                  {(getOther(activeChat).username ||
                    getOther(activeChat).name ||
                    "U")[0].toUpperCase()}
                </div>
                <div>
                  <div className="chat-header-name">
                    {getOther(activeChat).username ||
                      getOther(activeChat).name ||
                      "Usuario"}
                  </div>
                  <div className="chat-header-sub">Conversación privada</div>
                </div>
              </div>
            </div>

            {/* Messages area */}
            <div className="messages-area">
              {loadingMsgs && (
                <div className="msgs-center">
                  <div className="spinner" />
                  <span>Cargando mensajes…</span>
                </div>
              )}

              {!loadingMsgs && messages.length === 0 && (
                <div className="msgs-center">
                  <span style={{ fontSize: "2rem" }}>👋</span>
                  <p>¡Sé el primero en decir hola!</p>
                </div>
              )}

              {!loadingMsgs &&
                messages.map((msg, i) => {
                  const isMine =
                    msg.sender === currentUserId ||
                    msg.sender?._id === currentUserId;
                  return (
                    <div
                      key={msg._id || i}
                      className={`msg-bubble ${isMine ? "msg-mine" : "msg-other"}`}
                    >
                      <div className="msg-text">{msg.text}</div>
                      <div className="msg-time">{formatTime(msg.createdAt)}</div>
                    </div>
                  );
                })}
              <div ref={messagesEndRef} />
            </div>

            {/* Gift section — space for gifts and future features */}
            <div className="gifts-bar">
              <span className="gifts-label">🎁 Regalos</span>
              {GIFT_OPTIONS.map((g) => (
                <button
                  key={g.label}
                  className="gift-btn"
                  title={`${g.label} — ${g.cost} monedas`}
                  aria-label={`Enviar regalo ${g.label} por ${g.cost} monedas`}
                >
                  <span className="gift-emoji">{g.emoji}</span>
                  <span className="gift-cost">{g.cost} 💰</span>
                </button>
              ))}
              <Link href="/coins" className="btn btn-ghost btn-sm gift-more">
                Ver más →
              </Link>
            </div>

            {/* Message input */}
            <div className="input-bar">
              {sendError && (
                <div className="send-error">{sendError}</div>
              )}
              <div className="input-row">
                <input
                  className="input msg-input"
                  type="text"
                  placeholder="Escribe un mensaje…"
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                />
                <button
                  className="btn btn-primary send-btn"
                  onClick={handleSend}
                  disabled={sending || !newMsg.trim()}
                >
                  {sending ? "…" : "Enviar"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <style jsx>{`
        /* ===== LAYOUT ===== */
        .chats-layout {
          display: flex;
          height: calc(100vh - 5rem);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
        }

        /* ===== SIDEBAR ===== */
        .chats-sidebar {
          width: 300px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border);
          background: var(--card);
        }

        .sidebar-header {
          padding: 1.25rem 1.25rem 0.75rem;
          border-bottom: 1px solid var(--border);
        }

        .sidebar-title {
          font-size: 1.2rem;
          font-weight: 800;
          color: var(--text);
        }

        .sidebar-sub {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: 0.15rem;
        }

        /* Skeleton */
        .skeleton-list {
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .skeleton-row {
          height: 60px;
          border-radius: var(--radius-sm);
          background: linear-gradient(
            90deg,
            var(--card) 25%,
            var(--card-hover) 50%,
            var(--card) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        /* Sidebar empty */
        .sidebar-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 2rem 1rem;
          color: var(--text-muted);
          font-size: 0.9rem;
          text-align: center;
          flex: 1;
        }

        .sidebar-empty span { font-size: 2.5rem; }

        /* Chat list */
        .chat-list {
          list-style: none;
          overflow-y: auto;
          flex: 1;
          padding: 0.5rem 0;
        }

        .chat-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1.25rem;
          cursor: pointer;
          transition: background var(--transition);
        }

        .chat-item:hover { background: var(--card-hover); }

        .chat-item.active {
          background: var(--accent-dim);
          border-left: 3px solid var(--accent);
        }

        .chat-info { flex: 1; min-width: 0; }

        .chat-name {
          font-weight: 600;
          color: var(--text);
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-preview {
          color: var(--text-muted);
          font-size: 0.78rem;
          margin-top: 0.15rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-time {
          font-size: 0.72rem;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        /* ===== CHAT PANEL ===== */
        .chat-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          min-width: 0;
        }

        .chat-panel-empty {
          align-items: center;
          justify-content: center;
        }

        /* Empty state */
        .no-chat-selected {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-muted);
          text-align: center;
          padding: 2rem;
        }

        .no-chat-icon { font-size: 4rem; opacity: 0.3; }

        .no-chat-selected h2 {
          color: var(--text);
          font-size: 1.2rem;
          font-weight: 700;
        }

        /* Chat header */
        .chat-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1.25rem;
          border-bottom: 1px solid var(--border);
          background: var(--card);
          flex-shrink: 0;
        }

        .back-btn { display: none; }

        .chat-header-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .chat-header-name {
          font-weight: 700;
          color: var(--text);
          font-size: 0.95rem;
        }

        .chat-header-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        /* Messages */
        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .msgs-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          flex: 1;
          color: var(--text-muted);
          font-size: 0.9rem;
          text-align: center;
          min-height: 120px;
        }

        .msg-bubble {
          max-width: 70%;
          padding: 0.5rem 0.875rem;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .msg-mine {
          align-self: flex-end;
          background: var(--accent);
          border-bottom-right-radius: 4px;
        }

        .msg-other {
          align-self: flex-start;
          background: var(--card);
          border: 1px solid var(--border);
          border-bottom-left-radius: 4px;
        }

        .msg-text {
          font-size: 0.9rem;
          color: var(--text);
          word-break: break-word;
        }

        .msg-mine .msg-text { color: #fff; }

        .msg-time {
          font-size: 0.68rem;
          color: rgba(255, 255, 255, 0.5);
          text-align: right;
        }

        .msg-other .msg-time { color: var(--text-muted); }

        /* Gift bar */
        .gifts-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1.25rem;
          border-top: 1px solid var(--border);
          background: var(--card);
          overflow-x: auto;
          flex-shrink: 0;
        }

        .gifts-label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-muted);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .gift-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.1rem;
          background: var(--card-hover);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 0.3rem 0.6rem;
          cursor: pointer;
          transition: all var(--transition);
          flex-shrink: 0;
        }

        .gift-btn:hover {
          border-color: var(--accent);
          background: var(--accent-dim);
        }

        .gift-emoji { font-size: 1.1rem; }

        .gift-cost {
          font-size: 0.65rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .gift-more {
          font-size: 0.78rem;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .btn-sm { padding: 0.4rem 0.875rem; font-size: 0.8rem; }

        /* Input bar */
        .input-bar {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          padding: 0.875rem 1.25rem;
          border-top: 1px solid var(--border);
          background: var(--card);
          flex-shrink: 0;
        }

        .input-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .send-error {
          font-size: 0.78rem;
          color: var(--error);
        }

        .msg-input { margin: 0; }

        .send-btn { flex-shrink: 0; }

        /* Spinner */
        .spinner {
          width: 28px;
          height: 28px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* Error */
        .error-banner {
          margin: 0.75rem;
          background: rgba(244, 67, 54, 0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.6rem 0.875rem;
          font-size: 0.8rem;
        }

        /* Animations */
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 768px) {
          .chats-layout { height: calc(100vh - 4rem); }
          .chats-sidebar { width: 100%; border-right: none; }
          .chats-sidebar.hidden-mobile { display: none; }
          .chat-panel { width: 100%; }
          .back-btn { display: inline-flex; }
        }
      `}</style>
    </div>
  );
}
