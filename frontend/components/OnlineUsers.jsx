"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getInitial(user) {
  return (user.username || user.name || "?")[0].toUpperCase();
}

function UserCard({ user, onChat, onCall, chatLoading }) {
  const isCreator = user.role === "creator" && user.creatorStatus === "approved";

  return (
    <div className="online-card">
      <div className="online-avatar-wrap">
        {user.avatar ? (
          <img src={user.avatar} alt={user.username || user.name} className="online-avatar-img" />
        ) : (
          <div className="online-avatar-initials">{getInitial(user)}</div>
        )}
        <span className="online-dot" />
      </div>

      <div className="online-info">
        <span className="online-username">@{user.username || user.name || "usuario"}</span>
        {isCreator && <span className="online-creator-badge">⭐ Creator</span>}
      </div>

      <div className="online-actions">
        <button
          className="online-btn online-btn-chat"
          onClick={() => onChat(user._id)}
          disabled={chatLoading === user._id}
          title="Hablar ahora"
        >
          💬 <span>Hablar</span>
        </button>
        <button
          className="online-btn online-btn-call"
          onClick={() => onCall(user)}
          title="Llamar ahora"
        >
          📞
        </button>
      </div>

      <style jsx>{`
        .online-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          flex-shrink: 0;
          width: 110px;
          padding: 1rem 0.5rem;
          background: rgba(15, 8, 32, 0.7);
          border: 1px solid rgba(139, 92, 246, 0.18);
          border-radius: 16px;
          cursor: default;
          transition: border-color 0.2s, box-shadow 0.2s;
          position: relative;
          overflow: hidden;
        }
        .online-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at top, rgba(139, 92, 246, 0.06), transparent 70%);
          pointer-events: none;
        }
        .online-card:hover {
          border-color: rgba(139, 92, 246, 0.4);
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.15);
        }

        .online-avatar-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .online-avatar-img {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(139, 92, 246, 0.4);
        }
        .online-avatar-initials {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed, #db2777);
          border: 2px solid rgba(139, 92, 246, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          font-weight: 700;
          color: #fff;
        }
        .online-dot {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #22c55e;
          border: 2px solid #0f0820;
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.8);
          animation: pulse-dot 2s infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 6px rgba(34, 197, 94, 0.8); }
          50%       { box-shadow: 0 0 14px rgba(34, 197, 94, 1); }
        }

        .online-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          width: 100%;
        }
        .online-username {
          font-size: 0.72rem;
          font-weight: 600;
          color: #e2d9f3;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 90px;
        }
        .online-creator-badge {
          font-size: 0.58rem;
          background: rgba(224, 64, 251, 0.15);
          border: 1px solid rgba(224, 64, 251, 0.3);
          color: #e040fb;
          border-radius: 4px;
          padding: 1px 5px;
        }

        .online-actions {
          display: flex;
          gap: 0.35rem;
          width: 100%;
        }
        .online-btn {
          flex: 1;
          border: none;
          border-radius: 8px;
          padding: 0.35rem 0.2rem;
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.2rem;
          white-space: nowrap;
        }
        .online-btn:hover { opacity: 0.85; }
        .online-btn:active { transform: scale(0.96); }
        .online-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .online-btn-chat {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.7), rgba(109, 40, 217, 0.7));
          color: #fff;
        }
        .online-btn-call {
          background: rgba(34, 211, 238, 0.12);
          border: 1px solid rgba(34, 211, 238, 0.3) !important;
          color: #22d3ee;
          flex: 0 0 auto;
          width: 32px;
          padding: 0.35rem;
        }
      `}</style>
    </div>
  );
}

export default function OnlineUsers() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(null);
  const [coinsModal, setCoinsModal] = useState(false);
  const userIdsRef = useRef(new Set());

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const fetchOnline = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const r = await fetch(`${API_URL}/api/user/online`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        const list = data.users || [];
        userIdsRef.current = new Set(list.map((u) => String(u._id)));
        setUsers(list);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOnline();
  }, [fetchOnline]);

  useEffect(() => {
    const handleOnline = ({ userId }) => {
      if (userIdsRef.current.has(userId)) return;
      // Fetch fresh list when someone new comes online
      fetchOnline();
    };

    const handleOffline = ({ userId }) => {
      setUsers((prev) => {
        const next = prev.filter((u) => String(u._id) !== userId);
        userIdsRef.current = new Set(next.map((u) => String(u._id)));
        return next;
      });
    };

    socket.on("USER_ONLINE", handleOnline);
    socket.on("USER_OFFLINE", handleOffline);
    return () => {
      socket.off("USER_ONLINE", handleOnline);
      socket.off("USER_OFFLINE", handleOffline);
    };
  }, [fetchOnline]);

  const handleChat = useCallback(async (recipientId) => {
    const token = getToken();
    if (!token) return;
    setChatLoading(recipientId);
    try {
      const r = await fetch(`${API_URL}/api/chats`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      });
      if (r.ok) {
        const chat = await r.json();
        router.push(`/chats/${chat._id}`);
      }
    } catch {}
    setChatLoading(null);
  }, [router]);

  const handleCall = useCallback(async (user) => {
    const token = getToken();
    if (!token) return;
    // Check if user has coins before initiating call
    try {
      const r = await fetch(`${API_URL}/api/user/coins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        if ((data.coins ?? 0) <= 0) {
          setCoinsModal(true);
          return;
        }
      }
    } catch {}
    router.push(`/call/${user._id}`);
  }, [router]);

  if (!loading && users.length === 0) return null;

  return (
    <div className="online-section">
      <div className="online-header">
        <span className="online-header-dot" />
        <h2 className="online-title">🔥 Personas conectadas ahora</h2>
        {!loading && <span className="online-count">{users.length}</span>}
      </div>

      {loading ? (
        <div className="online-scroll">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton online-skeleton" />
          ))}
        </div>
      ) : (
        <div className="online-scroll">
          {users.map((u) => (
            <UserCard
              key={String(u._id)}
              user={u}
              onChat={handleChat}
              onCall={handleCall}
              chatLoading={chatLoading}
            />
          ))}
        </div>
      )}

      {coinsModal && (
        <div className="coins-modal-overlay" onClick={() => setCoinsModal(false)}>
          <div className="coins-modal" onClick={(e) => e.stopPropagation()}>
            <div className="coins-modal-icon">💎</div>
            <h3 className="coins-modal-title">Necesitas monedas para llamar</h3>
            <p className="coins-modal-sub">Las llamadas privadas requieren monedas. ¡Compra monedas y conecta al instante!</p>
            <div className="coins-modal-actions">
              <button className="coins-modal-btn-primary" onClick={() => { setCoinsModal(false); router.push("/coins"); }}>
                Comprar monedas
              </button>
              <button className="coins-modal-btn-secondary" onClick={() => setCoinsModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .online-section {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .online-header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .online-header-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 10px rgba(34, 197, 94, 0.9);
          animation: pulse-dot 2s infinite;
          flex-shrink: 0;
        }
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 6px rgba(34, 197, 94, 0.8); }
          50%       { box-shadow: 0 0 14px rgba(34, 197, 94, 1); }
        }
        .online-title {
          font-size: 1rem;
          font-weight: 700;
          color: #e2d9f3;
          margin: 0;
        }
        .online-count {
          margin-left: auto;
          font-size: 0.72rem;
          font-weight: 700;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #22c55e;
          border-radius: 999px;
          padding: 2px 10px;
        }

        .online-scroll {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
          scrollbar-width: none;
        }
        .online-scroll::-webkit-scrollbar { display: none; }

        .online-skeleton {
          flex-shrink: 0;
          width: 110px;
          height: 180px;
          border-radius: 16px;
        }

        /* Coins upsell modal */
        .coins-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 1rem;
        }
        .coins-modal {
          background: linear-gradient(135deg, rgba(22, 12, 45, 0.98), rgba(15, 8, 32, 0.99));
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 20px;
          padding: 2rem 1.75rem;
          max-width: 340px;
          width: 100%;
          text-align: center;
          box-shadow: 0 0 60px rgba(139, 92, 246, 0.2);
        }
        .coins-modal-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
        .coins-modal-title { font-size: 1.1rem; font-weight: 700; color: #e2d9f3; margin: 0 0 0.5rem; }
        .coins-modal-sub { font-size: 0.82rem; color: rgba(200, 185, 230, 0.75); margin: 0 0 1.5rem; line-height: 1.5; }
        .coins-modal-actions { display: flex; flex-direction: column; gap: 0.6rem; }
        .coins-modal-btn-primary {
          padding: 0.75rem;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #7c3aed, #db2777);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .coins-modal-btn-primary:hover { opacity: 0.88; }
        .coins-modal-btn-secondary {
          padding: 0.65rem;
          border-radius: 10px;
          border: 1px solid rgba(139, 92, 246, 0.25);
          background: transparent;
          color: rgba(200, 185, 230, 0.7);
          font-size: 0.85rem;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .coins-modal-btn-secondary:hover { opacity: 0.75; }
      `}</style>
    </div>
  );
}
