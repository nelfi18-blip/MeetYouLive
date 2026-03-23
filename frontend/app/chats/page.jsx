"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";

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
          clearToken();
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
          <h1 className="page-title">Chats</h1>
          <p className="page-subtitle">Tus conversaciones privadas</p>
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {loading && (
        <div className="chats-list">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: "var(--radius)" }} />
          ))}
        </div>
      )}

      {!loading && chats.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)" }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
          <h3>Sin conversaciones</h3>
          <p>Aún no tienes chats. ¡Explora streamers y empieza a conectar!</p>
          <Link href="/explore" className="btn btn-primary">
            Explorar streamers
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
              <Link key={chat._id} href={`/chats/${chat._id}`} className="chat-row">
                <div className="chat-avatar">
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
                <div className="chat-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .chats-page { display: flex; flex-direction: column; gap: 1.75rem; }

        .chats-header {}

        /* List */
        .chats-list { display: flex; flex-direction: column; gap: 0.5rem; }

        .chat-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          cursor: pointer;
          transition: background var(--transition), border-color var(--transition), transform var(--transition-slow);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: rgba(15,8,32,0.7);
        }

        .chat-row:hover {
          border-color: rgba(129,140,248,0.3);
          background: rgba(22,12,45,0.9);
          transform: translateX(4px);
        }

        .chat-row:hover .chat-arrow { opacity: 1; color: var(--accent-3); }

        .chat-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 1.1rem;
          flex-shrink: 0;
          box-shadow: 0 0 0 2px rgba(224,64,251,0.2);
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
          margin-top: 0.18rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-time {
          font-size: 0.72rem;
          color: var(--text-dim);
          flex-shrink: 0;
          font-weight: 500;
        }

        .chat-arrow {
          color: var(--text-dim);
          opacity: 0;
          transition: all var(--transition);
          display: flex;
          flex-shrink: 0;
        }

        /* Banner */
        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        /* Empty */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 4rem 2rem;
          text-align: center;
          border: 1px dashed rgba(139,92,246,0.2);
          border-radius: var(--radius);
          background: rgba(15,8,32,0.4);
        }

        .empty-icon {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-state h3 { color: var(--text); font-size: 1.15rem; margin: 0; }
        .empty-state p  { color: var(--text-muted); font-size: 0.875rem; margin: 0; max-width: 320px; }
      `}</style>
    </div>
  );
}
