"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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
  const [otherName, setOtherName] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    // Fetch current user and messages in parallel, then resolve otherName
    Promise.all([
      fetch(`${API_URL}/api/user/me`, { headers }).then((r) => {
        if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
        return r.ok ? r.json() : null;
      }),
      fetch(`${API_URL}/api/chats/${id}/messages`, { headers }).then((r) => {
        if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
        if (!r.ok) throw new Error("Error al cargar mensajes");
        return r.json();
      }),
    ])
      .then(([me, data]) => {
        const myId = me?._id ?? null;
        setCurrentUserId(myId);
        const msgs = Array.isArray(data) ? data : [];
        setMessages(msgs);
        const other = msgs.find((m) => m.sender?._id !== myId);
        if (other) {
          setOtherName(other.sender?.username || other.sender?.name || "Usuario");
        }
      })
      .catch((err) => {
        if (err.status === 401) {
          localStorage.removeItem("token");
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

  return (
    <div className="chat-page">
      <div className="chat-header card">
        <Link href="/chats" className="back-btn">← Chats</Link>
        <div className="chat-peer">
          {otherName && (
            <>
              <div className="peer-avatar avatar-placeholder">
                {otherName[0].toUpperCase()}
              </div>
              <span className="peer-name">{otherName}</span>
            </>
          )}
          {!otherName && <span className="peer-name">Conversación</span>}
        </div>
      </div>

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

      <form className="chat-input-bar card" onSubmit={sendMessage}>
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

        .chat-peer { display: flex; align-items: center; gap: 0.6rem; }
        .peer-avatar { flex-shrink: 0; }
        .peer-name { font-weight: 700; color: var(--text); font-size: 0.95rem; }

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
      `}</style>
    </div>
  );
}
