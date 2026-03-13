"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ChatDetailPage() {
  const { id } = useParams();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    // Fetch current user id
    fetch(`${API_URL}/api/user/me`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setCurrentUserId(d._id); })
      .catch(() => {});

    // Fetch chat info to get other participant
    fetch(`${API_URL}/api/chats/${id}`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((chat) => {
        if (chat) {
          const other = chat.participants?.find((p) => p._id !== chat.currentUserId);
          setOtherUser(other || null);
        }
      })
      .catch(() => {});

    // Fetch messages
    fetch(`${API_URL}/api/chats/${id}/messages`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la conversación");
        return r.json();
      })
      .then((d) => setMessages(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
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
      if (!res.ok) throw new Error("Error al enviar");
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const otherName = otherUser?.username || otherUser?.name || "Usuario";

  return (
    <div className="chat-page">
      {/* Header */}
      <div className="chat-header card">
        <Link href="/chats" className="back-btn">← Volver</Link>
        <div className="chat-header-user">
          <div className="avatar-placeholder" style={{ width: 38, height: 38, fontSize: "1rem" }}>
            {otherName[0]?.toUpperCase()}
          </div>
          <span className="chat-header-name">{otherName}</span>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Messages */}
      <div className="messages-container">
        {loading ? (
          <div className="loading-msgs">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`skeleton-msg ${i % 2 === 0 ? "left" : "right"}`} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-msgs">
            <span style={{ fontSize: "2.5rem" }}>💬</span>
            <p>Aún no hay mensajes. ¡Empieza la conversación!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender?._id === currentUserId || msg.sender === currentUserId;
            const senderName = msg.sender?.username || msg.sender?.name || "Usuario";
            return (
              <div key={msg._id} className={`msg-wrapper ${isOwn ? "own" : "other"}`}>
                {!isOwn && (
                  <div className="avatar-placeholder msg-avatar" style={{ width: 30, height: 30, fontSize: "0.8rem" }}>
                    {senderName[0]?.toUpperCase()}
                  </div>
                )}
                <div className={`msg-bubble ${isOwn ? "bubble-own" : "bubble-other"}`}>
                  <p className="msg-text">{msg.text}</p>
                  <span className="msg-time">
                    {new Date(msg.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form className="msg-input-row" onSubmit={handleSend}>
        <input
          className="msg-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje…"
          maxLength={2000}
          disabled={sending}
        />
        <button type="submit" className="btn btn-primary send-btn" disabled={sending || !text.trim()}>
          {sending ? "…" : "Enviar"}
        </button>
      </form>

      <style jsx>{`
        .chat-page {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 80px);
          gap: 1rem;
        }

        /* Header */
        .chat-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          flex-shrink: 0;
        }

        .back-btn {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--accent) !important;
          white-space: nowrap;
        }

        .chat-header-user {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
        }

        .chat-header-name {
          font-weight: 600;
          color: var(--text);
          font-size: 0.95rem;
        }

        /* Messages */
        .messages-container {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.5rem 0;
          min-height: 0;
        }

        .msg-wrapper {
          display: flex;
          align-items: flex-end;
          gap: 0.5rem;
        }

        .msg-wrapper.own { justify-content: flex-end; }
        .msg-wrapper.other { justify-content: flex-start; }

        .msg-avatar { flex-shrink: 0; }

        .msg-bubble {
          max-width: 65%;
          padding: 0.6rem 0.9rem;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .bubble-own {
          background: var(--accent);
          border-bottom-right-radius: 4px;
        }

        .bubble-other {
          background: var(--card);
          border: 1px solid var(--border);
          border-bottom-left-radius: 4px;
        }

        .msg-text {
          font-size: 0.9rem;
          color: var(--text);
          word-break: break-word;
          line-height: 1.4;
        }

        .bubble-own .msg-text { color: #fff; }

        .msg-time {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.6);
          align-self: flex-end;
        }

        .bubble-other .msg-time { color: var(--text-muted); }

        /* Loading skeletons */
        .loading-msgs { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem; }

        .skeleton-msg {
          height: 44px;
          border-radius: 12px;
          max-width: 60%;
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        .skeleton-msg.left { align-self: flex-start; }
        .skeleton-msg.right { align-self: flex-end; }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Empty */
        .empty-msgs {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          flex: 1;
          text-align: center;
          color: var(--text-muted);
        }

        /* Input */
        .msg-input-row {
          display: flex;
          gap: 0.75rem;
          flex-shrink: 0;
          padding-bottom: 0.5rem;
        }

        .msg-input {
          flex: 1;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 0.7rem 1rem;
          color: var(--text);
          font-size: 0.95rem;
          outline: none;
          transition: border-color var(--transition);
        }

        .msg-input:focus { border-color: var(--accent); }

        .send-btn { flex-shrink: 0; }

        /* Error */
        .error-banner {
          background: rgba(244,67,54,0.1);
          border: 1px solid var(--error);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
