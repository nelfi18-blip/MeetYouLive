"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  );
}

export default function MatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/matches`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d) setMatches(d.matches || []);
      })
      .catch(() => setError("No se pudieron cargar los matches"))
      .finally(() => setLoading(false));
  }, [router]);

  const startChat = async (userId) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ participantId: userId }),
      });
      if (res.ok) {
        const chat = await res.json();
        router.push(`/chats/${chat._id}`);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="matches-page">
      <div className="matches-header">
        <div className="matches-header-icon">
          <HeartIcon />
        </div>
        <div>
          <h1 className="page-title">Tus Matches</h1>
          <p className="page-subtitle">Conexiones mutuas con otros usuarios</p>
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {loading && (
        <div className="matches-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 200, borderRadius: "var(--radius)" }} />
          ))}
        </div>
      )}

      {!loading && matches.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon" style={{ color: "var(--accent)" }}>
            <HeartIcon />
          </div>
          <h3>Sin matches aún</h3>
          <p>Explora perfiles y dale like a quienes te llamen la atención. ¡Cuando sea mutuo, aparecerán aquí!</p>
          <Link href="/explore" className="btn btn-primary">
            Explorar perfiles
          </Link>
        </div>
      )}

      {!loading && matches.length > 0 && (
        <div className="matches-grid">
          {matches.map((user) => {
            const displayName = user.username || user.name || "Usuario";
            const initial = displayName[0].toUpperCase();
            const roleLabel = user.role === "creator" ? "Creador" : user.role === "admin" ? "Admin" : "Usuario";
            return (
              <div key={user._id} className="match-card">
                <div className="match-avatar-wrap">
                  {user.avatar ? (
                    <img src={user.avatar} alt={displayName} className="match-avatar-img" />
                  ) : (
                    <div className="match-avatar-placeholder">{initial}</div>
                  )}
                  <div className="match-badge-heart">
                    <HeartIcon />
                  </div>
                </div>
                <div className="match-body">
                  <div className="match-name">{displayName}</div>
                  {user.role === "creator" && (
                    <span className="badge badge-creator">{roleLabel}</span>
                  )}
                  {user.bio && <p className="match-bio">{user.bio}</p>}
                  {user.interests?.length > 0 && (
                    <div className="match-interests">
                      {user.interests.slice(0, 3).map((i) => (
                        <span key={i} className="match-interest-tag">{i}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-primary match-chat-btn"
                  onClick={() => startChat(user._id)}
                >
                  <ChatIcon /> Chatear
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .matches-page { display: flex; flex-direction: column; gap: 1.75rem; }

        .matches-header {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .matches-header-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-sm);
          background: rgba(255,45,120,0.1);
          border: 1px solid rgba(255,45,120,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          flex-shrink: 0;
        }

        .matches-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1rem;
        }

        .match-card {
          background: rgba(15,8,32,0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.9rem;
          transition: all var(--transition-slow);
        }
        .match-card:hover {
          border-color: rgba(255,45,120,0.3);
          box-shadow: var(--shadow), 0 0 24px rgba(255,45,120,0.1);
          transform: translateY(-3px);
        }

        .match-avatar-wrap {
          position: relative;
          width: 80px;
          height: 80px;
        }
        .match-avatar-img {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(255,45,120,0.3);
        }
        .match-avatar-placeholder {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          font-weight: 800;
          color: #fff;
        }
        .match-badge-heart {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          box-shadow: 0 2px 8px rgba(255,45,120,0.5);
        }
        .match-badge-heart :global(svg) { width: 12px; height: 12px; }

        .match-body { text-align: center; width: 100%; }
        .match-name {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text);
          margin-bottom: 0.3rem;
        }
        .match-bio {
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0.35rem 0 0;
        }
        .match-interests {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          justify-content: center;
          margin-top: 0.5rem;
        }
        .match-interest-tag {
          font-size: 0.65rem;
          padding: 0.2rem 0.55rem;
          border-radius: var(--radius-pill);
          background: rgba(224,64,251,0.08);
          border: 1px solid rgba(224,64,251,0.18);
          color: var(--accent-2);
          font-weight: 600;
        }

        .match-chat-btn {
          width: 100%;
          padding: 0.65rem;
          font-size: 0.82rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
        }

        .badge-creator {
          display: inline-block;
          font-size: 0.65rem;
          padding: 0.18rem 0.55rem;
          border-radius: var(--radius-pill);
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.25);
          color: var(--accent-green);
          font-weight: 700;
          margin-bottom: 0.25rem;
        }
      `}</style>
    </div>
  );
}
