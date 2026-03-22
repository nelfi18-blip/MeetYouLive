"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ChatsPage() {
  const router = useRouter();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          localStorage.removeItem("token");
          router.replace("/login");
          return null;
        }
        if (!r.ok) throw new Error("Failed to fetch chats");
        return r.json();
      })
      .then((d) => {
        if (d !== null) setChats(Array.isArray(d) ? d : []);
      })
      .catch(() => setError("No se pudo cargar los chats"))
      .finally(() => setLoading(false));
  }, [router]);

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

        .chats-title {
          font-size: 1.9rem;
          font-weight: 800;
          background: linear-gradient(135deg, #F8F4FF, #FF4FD8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .chats-sub { color: var(--text-muted); margin-top: 0.25rem; font-weight: 500; }

        /* List */
        .chats-list { display: flex; flex-direction: column; gap: 0.6rem; }

        .chat-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.1rem;
          cursor: pointer;
          transition: all var(--transition);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--grad-card);
        }

        .chat-row:hover {
          border-color: rgba(255,15,138,0.3);
          box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,79,216,0.1);
          background: rgba(36,16,64,0.9);
        }

        .chat-avatar {
          width: 50px;
          height: 50px;
          font-size: 1.15rem;
          flex-shrink: 0;
          background: linear-gradient(135deg, #FF0F8A, #7A2BFF);
          box-shadow: 0 0 16px rgba(255,15,138,0.4);
        }

        .chat-info { flex: 1; min-width: 0; }

        .chat-name {
          font-weight: 700;
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
          font-size: 0.72rem;
          color: var(--text-muted);
          flex-shrink: 0;
          font-weight: 500;
        }

        /* Skeleton */
        .skeleton-row {
          height: 70px;
          border-radius: var(--radius);
          background: linear-gradient(90deg, rgba(26,11,46,0.8) 25%, rgba(42,18,82,0.8) 50%, rgba(26,11,46,0.8) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border: 1px solid var(--border);
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
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--grad-card);
        }
      `}</style>
    </div>
  );
}
