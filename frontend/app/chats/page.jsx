"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ChatsPage() {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    fetch(`${API_URL}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch chats");
        return r.json();
      })
      .then((d) => setChats(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudo cargar los chats"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="chats-page">
      <div className="chats-header">
        <div>
          <h1 className="chats-title">💬 Chats</h1>
          <p className="chats-sub">Tus conversaciones privadas</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="chats-list">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      )}

      {!loading && chats.length === 0 && (
        <div className="empty-state card">
          <span style={{ fontSize: "3rem" }}>💬</span>
          <h3 style={{ color: "var(--text)" }}>Sin conversaciones</h3>
          <p>Aún no tienes chats. ¡Explora streamers y empieza a conectar!</p>
          <Link href="/explore" className="btn btn-primary">
            🔍 Explorar streamers
          </Link>
        </div>
      )}

      {!loading && chats.length > 0 && (
        <div className="chats-list">
          {chats.map((chat) => {
            const other = chat.participants?.find((p) => p._id !== chat.currentUserId) || {};
            const displayName = other.username || other.name || "Usuario";
            const initial = displayName[0].toUpperCase();
            const lastMsg = chat.lastMessage;
            return (
              <Link key={chat._id} href={`/chats/${chat._id}`} className="chat-row card">
                <div className="chat-avatar avatar-placeholder">
                  {initial}
                </div>
                <div className="chat-info">
                  <div className="chat-name">{displayName}</div>
                  {lastMsg && (
                    <div className="chat-preview">{lastMsg.text}</div>
                  )}
                </div>
                {lastMsg?.createdAt && (
                  <div className="chat-time">
                    {new Date(lastMsg.createdAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .chats-page { display: flex; flex-direction: column; gap: 1.5rem; }

        .chats-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .chats-title { font-size: 1.75rem; font-weight: 800; color: var(--text); }
        .chats-sub { color: var(--text-muted); margin-top: 0.25rem; }

        /* List */
        .chats-list { display: flex; flex-direction: column; gap: 0.75rem; }

        .chat-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.875rem 1rem;
          cursor: pointer;
          transition: background var(--transition);
        }

        .chat-row:hover { background: var(--card-hover); }

        .chat-avatar {
          width: 46px;
          height: 46px;
          font-size: 1.1rem;
          flex-shrink: 0;
        }

        .chat-info { flex: 1; min-width: 0; }

        .chat-name {
          font-weight: 600;
          color: var(--text);
          font-size: 0.95rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-preview {
          color: var(--text-muted);
          font-size: 0.8rem;
          margin-top: 0.2rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-time {
          font-size: 0.75rem;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        /* Skeleton */
        .skeleton-row {
          height: 66px;
          border-radius: var(--radius);
          background: linear-gradient(90deg, var(--card) 25%, var(--card-hover) 50%, var(--card) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

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
        }
      `}</style>
    </div>
  );
}
