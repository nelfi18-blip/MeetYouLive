"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import socket from "@/lib/socket";
import GiftPanel from "@/components/GiftPanel";
import SimulationPanel from "@/components/SimulationPanel";
import { ROOM_CATEGORY_META } from "@/lib/roomCategories";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function parseJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export default function SocialRoomPage() {
  const { id } = useParams();
  const router = useRouter();

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const seenMsgIds = useRef(new Set());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(true);

  const [currentUser, setCurrentUser] = useState(null); // { _id, username, name, avatar }
  const [onlineCount, setOnlineCount] = useState(0);

  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { _id, username, name }
  const [reportReason, setReportReason] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSuccess, setReportSuccess] = useState("");

  // Tab: "chat" | "simulation" — simulation tab only for confianza_amor rooms
  const [activeTab, setActiveTab] = useState("chat");

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const meta = room ? (ROOM_CATEGORY_META[room.category] || ROOM_CATEGORY_META.consejos_citas) : null;

  /* ── Load current user ───────────────────────────────────────────────── */
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/user/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?._id) setCurrentUser(d); })
      .catch(() => {});
  }, []);

  /* ── Load room ───────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch(`${API_URL}/api/rooms/${id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setRoom(d))
      .catch(() => setError("Sala no encontrada"))
      .finally(() => setLoadingRoom(false));
  }, [id]);

  /* ── Load messages ──────────────────────────────────────────────────── */
  useEffect(() => {
    fetch(`${API_URL}/api/rooms/${id}/messages?limit=50`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => {
        const msgs = Array.isArray(data) ? data : [];
        msgs.forEach((m) => seenMsgIds.current.add(m._id));
        setMessages(msgs);
      })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [id]);

  /* ── Socket.io real-time ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!currentUser) return;

    if (!socket.connected) socket.connect();

    const joinedRef = { current: false };

    const joinRoom = () => {
      if (joinedRef.current) return;
      joinedRef.current = true;
      socket.emit("join_social_room", {
        roomId: id,
        user: { _id: currentUser._id, username: currentUser.username, name: currentUser.name, avatar: currentUser.avatar },
      });
      // Count starts at 1 (self). Others trigger ROOM_USER_JOINED increments.
      setOnlineCount(1);
    };

    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);

    const handleMessage = (msg) => {
      if (seenMsgIds.current.has(msg._id)) return;
      seenMsgIds.current.add(msg._id);
      setMessages((prev) => [...prev, msg]);
    };

    const handleUserJoined = () => setOnlineCount((c) => c + 1);
    const handleUserLeft   = () => setOnlineCount((c) => Math.max(0, c - 1));

    socket.on("ROOM_MESSAGE", handleMessage);
    socket.on("ROOM_USER_JOINED", handleUserJoined);
    socket.on("ROOM_USER_LEFT", handleUserLeft);

    return () => {
      joinedRef.current = false;
      socket.emit("leave_social_room", { roomId: id });
      socket.off("connect", joinRoom);
      socket.off("ROOM_MESSAGE", handleMessage);
      socket.off("ROOM_USER_JOINED", handleUserJoined);
      socket.off("ROOM_USER_LEFT", handleUserLeft);
    };
  }, [id, currentUser]);

  /* ── Auto-scroll ─────────────────────────────────────────────────────── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Send message ────────────────────────────────────────────────────── */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const token = getToken();
    if (!token) { router.push("/login"); return; }

    setSending(true);
    setInput("");
    try {
      const res = await fetch(`${API_URL}/api/rooms/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setInput(text); // restore input on failure
        setError(body.message || "Error al enviar mensaje");
      }
      // Message arrives via socket ROOM_MESSAGE event
    } catch {
      setInput(text);
      setError("Error de red al enviar mensaje");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [id, input, sending, router]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ── Report user ─────────────────────────────────────────────────────── */
  const openReport = (user) => {
    setReportTarget(user);
    setReportReason("");
    setReportSuccess("");
    setShowReportModal(true);
  };

  const submitReport = async () => {
    if (!reportReason.trim()) return;
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    setReportSending(true);
    try {
      await fetch(`${API_URL}/api/moderation/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetType: "user", targetId: reportTarget._id, reason: reportReason.trim() }),
      });
      setReportSuccess("Reporte enviado. Gracias por mantener la sala respetuosa.");
    } catch {
      setReportSuccess("Error al enviar el reporte.");
    } finally {
      setReportSending(false);
    }
  };

  const isHost = room && currentUser && room.host && String(room.host._id) === String(currentUser._id);
  const isMod  = room && currentUser && Array.isArray(room.moderators) && room.moderators.some((m) => String(m._id || m) === String(currentUser._id));

  if (loadingRoom) {
    return (
      <div className="room-loading">
        <div className="skeleton" style={{ height: 120, borderRadius: "var(--radius)" }} />
        <div className="skeleton" style={{ height: 400, borderRadius: "var(--radius)" }} />
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="room-error">
        <p>{error}</p>
        <Link href="/rooms" className="btn btn-primary">← Volver a salas</Link>
      </div>
    );
  }

  return (
    <div className="room-page" style={{ "--cat-color": meta?.color, "--cat-glow": meta?.glow }}>
      {/* Header */}
      <div className="room-header">
        <Link href="/rooms" className="back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="room-header-info">
          <div className="room-header-title">
            <span className="room-cat-emoji">{meta?.emoji}</span>
            <h1 className="room-name">{room?.title}</h1>
          </div>
          <div className="room-header-meta">
            <span className="online-badge">
              <span className="online-dot" />
              {onlineCount} en línea
            </span>
            {isHost && <span className="role-badge host">👑 Host</span>}
            {isMod && !isHost && <span className="role-badge mod">🛡️ Mod</span>}
          </div>
        </div>
        {/* Gift CTA for host */}
        {room?.host && !isHost && currentUser && (
          <button className="gift-cta-btn" onClick={() => setShowGiftPanel(true)} title="Enviar regalo al host">
            🎁
          </button>
        )}
      </div>

      {room?.description && (
        <p className="room-description">{room.description}</p>
      )}

      {/* Highlighted users */}
      {room?.highlightedUsers?.length > 0 && (
        <div className="highlighted-users">
          <span className="highlighted-label">⭐ Destacados</span>
          {room.highlightedUsers.map((u) => (
            <span key={u._id} className="highlighted-user">
              {u.username || u.name}
            </span>
          ))}
        </div>
      )}

      {/* Tab bar — only for confianza_amor rooms */}
      {room?.category === "confianza_amor" && (
        <div className="room-tabs">
          <button
            className={`room-tab ${activeTab === "chat" ? "room-tab--active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            💬 Chat grupal
          </button>
          <button
            className={`room-tab ${activeTab === "simulation" ? "room-tab--active" : ""}`}
            onClick={() => setActiveTab("simulation")}
          >
            🎯 Practicar conversación
          </button>
        </div>
      )}

      {/* Simulation panel */}
      {activeTab === "simulation" && room?.category === "confianza_amor" && (
        <SimulationPanel currentUser={currentUser} />
      )}

      {/* Chat area */}
      {activeTab === "chat" && (
      <div className="chat-container">
        <div className="messages-list">
          {loadingMsgs && (
            <div className="chat-loading">Cargando mensajes…</div>
          )}
          {!loadingMsgs && messages.length === 0 && (
            <div className="chat-empty">
              <span>{meta?.emoji}</span>
              <p>Sé el primero en escribir. ¡Esta sala te espera!</p>
            </div>
          )}
          {messages.map((msg) => {
            const senderId = String(msg.sender?._id || msg.sender || "");
            const isMe = currentUser && senderId === String(currentUser._id);
            const msgIsHost = room?.host && senderId === String(room.host._id || room.host);
            const msgIsMod = room?.moderators?.some((m) => String(m._id || m) === senderId);
            const senderName = msg.sender?.username || msg.sender?.name || "Usuario";

            return (
              <div key={msg._id} className={`message ${isMe ? "message-me" : "message-other"} ${msg.isHighlighted ? "message-highlighted" : ""}`}>
                {!isMe && (
                  <div className="msg-sender-row">
                    <div className="msg-avatar">
                      {msg.sender?.avatar
                        ? <img src={msg.sender.avatar} alt={senderName} width={24} height={24} style={{ borderRadius: "50%", objectFit: "cover" }} />
                        : <span>{senderName[0]?.toUpperCase()}</span>}
                    </div>
                    <span className="msg-sender-name">{senderName}</span>
                    {msgIsHost && <span className="msg-role host">👑</span>}
                    {msgIsMod && !msgIsHost && <span className="msg-role mod">🛡️</span>}
                    {!isMe && currentUser && (
                      <button
                        className="report-btn"
                        onClick={() => openReport(msg.sender)}
                        title="Reportar usuario"
                      >
                        ⚑
                      </button>
                    )}
                  </div>
                )}
                <div className="msg-bubble">
                  <p className="msg-text">{msg.text}</p>
                  <span className="msg-time">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        {currentUser ? (
          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              placeholder="Escribe un mensaje…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={500}
              disabled={sending}
            />
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || sending}
            >
              {sending ? "…" : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          </div>
        ) : (
          <div className="chat-login-prompt">
            <Link href="/login" className="btn btn-primary" style={{ fontSize: "0.85rem", padding: "0.55rem 1.25rem" }}>
              Inicia sesión para chatear
            </Link>
          </div>
        )}
      </div>
      )} {/* end activeTab === "chat" */}

      {/* Monetization CTAs */}
      {currentUser && room?.host && !isHost && (
        <div className="monetization-row">
          <button className="mono-btn gift" onClick={() => setShowGiftPanel(true)}>
            🎁 Enviar regalo al host
          </button>
          <Link href={`/creator/${room.host._id || room.host}`} className="mono-btn profile">
            👤 Ver perfil del host
          </Link>
        </div>
      )}

      {/* Safety note */}
      <div className="safety-note">
        🛡️ Esta sala tiene normas de respeto. Usa el botón ⚑ para reportar comportamientos inapropiados.
      </div>

      {/* Gift panel */}
      {showGiftPanel && room?.host && (
        <GiftPanel
          receiverId={String(room.host._id || room.host)}
          context="room"
          onClose={() => setShowGiftPanel(false)}
          onGiftSent={() => setShowGiftPanel(false)}
        />
      )}

      {/* Report modal */}
      {showReportModal && reportTarget && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Reportar usuario</h3>
            <p className="modal-sub">
              Reportando a <strong>{reportTarget.username || reportTarget.name}</strong>
            </p>
            {reportSuccess ? (
              <p className="report-success">{reportSuccess}</p>
            ) : (
              <>
                <textarea
                  className="report-textarea"
                  placeholder="Describe el motivo del reporte…"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={3}
                  maxLength={300}
                />
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setShowReportModal(false)}>Cancelar</button>
                  <button
                    className="btn btn-danger"
                    onClick={submitReport}
                    disabled={reportSending || !reportReason.trim()}
                  >
                    {reportSending ? "Enviando…" : "Reportar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .room-page { display: flex; flex-direction: column; gap: 1rem; }

        /* Tab bar */
        .room-tabs {
          display: flex; gap: 0.4rem;
          padding: 0.3rem; border-radius: var(--radius-xs, 8px);
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
        }
        .room-tab {
          flex: 1; padding: 0.5rem 0.75rem; border-radius: 6px;
          border: none; background: transparent;
          font-size: 0.78rem; font-weight: 700; color: var(--text-muted);
          cursor: pointer; transition: all 0.18s;
        }
        .room-tab:hover { background: rgba(255,255,255,0.06); color: var(--text); }
        .room-tab--active {
          background: linear-gradient(135deg, rgba(244,114,182,0.18) 0%, rgba(168,85,247,0.18) 100%);
          color: #f472b6; border: 1px solid rgba(244,114,182,0.25);
        }

        /* Header */
        .room-header {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(255,255,255,0.07);
          background: var(--card);
        }
        .back-btn {
          display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: var(--text-muted); text-decoration: none; flex-shrink: 0;
          transition: all 0.2s;
        }
        .back-btn:hover { background: rgba(255,255,255,0.08); color: var(--text); }
        .room-header-info { flex: 1; min-width: 0; }
        .room-header-title { display: flex; align-items: center; gap: 0.5rem; }
        .room-cat-emoji { font-size: 1.3rem; flex-shrink: 0; }
        .room-name {
          font-size: 1rem; font-weight: 800; color: var(--text); margin: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .room-header-meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; flex-wrap: wrap; }
        .online-badge {
          display: inline-flex; align-items: center; gap: 0.3rem;
          font-size: 0.68rem; font-weight: 700; color: var(--accent-green);
          background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.22);
          border-radius: 999px; padding: 0.1rem 0.5rem;
        }
        .online-dot {
          display: inline-block; width: 5px; height: 5px; border-radius: 50%;
          background: var(--accent-green); animation: dotPulse 1.4s infinite;
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        .role-badge {
          font-size: 0.68rem; font-weight: 700; border-radius: 999px; padding: 0.1rem 0.5rem;
        }
        .role-badge.host { color: #fbbf24; background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.25); }
        .role-badge.mod  { color: #60a5fa; background: rgba(96,165,250,0.1);  border: 1px solid rgba(96,165,250,0.2);  }
        .gift-cta-btn {
          background: rgba(244,114,182,0.12); border: 1px solid rgba(244,114,182,0.3);
          border-radius: 999px; padding: 0.4rem 0.8rem; font-size: 1rem;
          cursor: pointer; transition: all 0.2s; flex-shrink: 0;
        }
        .gift-cta-btn:hover { background: rgba(244,114,182,0.22); }

        /* Room description */
        .room-description {
          font-size: 0.85rem; color: var(--text-muted); margin: 0;
          padding: 0 0.25rem;
        }

        /* Highlighted users */
        .highlighted-users {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
          padding: 0.6rem 1rem;
          border-radius: var(--radius-xs);
          background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.2);
        }
        .highlighted-label { font-size: 0.72rem; font-weight: 800; color: #fbbf24; }
        .highlighted-user {
          font-size: 0.72rem; font-weight: 600; color: var(--text);
          background: rgba(251,191,36,0.1); border-radius: 999px; padding: 0.1rem 0.5rem;
        }

        /* Chat container */
        .chat-container {
          display: flex; flex-direction: column;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(8,3,20,0.7);
          overflow: hidden;
          min-height: 420px;
        }
        .messages-list {
          flex: 1; overflow-y: auto; padding: 1rem;
          display: flex; flex-direction: column; gap: 0.75rem;
          max-height: 460px;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .chat-loading { font-size: 0.82rem; color: var(--text-dim); text-align: center; padding: 2rem 0; }
        .chat-empty {
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
          padding: 3rem 1rem; color: var(--text-dim); font-size: 0.85rem; text-align: center;
        }
        .chat-empty span { font-size: 2rem; }

        /* Messages */
        .message { display: flex; flex-direction: column; gap: 0.2rem; max-width: 80%; }
        .message-me { align-self: flex-end; align-items: flex-end; }
        .message-other { align-self: flex-start; align-items: flex-start; }
        .message-highlighted .msg-bubble {
          border-color: rgba(251,191,36,0.4);
          background: rgba(251,191,36,0.07);
        }

        .msg-sender-row { display: flex; align-items: center; gap: 0.35rem; }
        .msg-avatar {
          width: 22px; height: 22px; border-radius: 50%; overflow: hidden;
          background: var(--bg-3); display: flex; align-items: center; justify-content: center;
          font-size: 0.7rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0;
        }
        .msg-sender-name { font-size: 0.72rem; font-weight: 700; color: var(--text-muted); }
        .msg-role { font-size: 0.72rem; }

        .report-btn {
          background: none; border: none; cursor: pointer;
          font-size: 0.68rem; color: var(--text-dim);
          padding: 0 0.15rem; opacity: 0.5; transition: opacity 0.2s;
          margin-left: auto;
        }
        .report-btn:hover { opacity: 1; color: var(--error); }

        .msg-bubble {
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius-xs);
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.04);
          display: flex; flex-direction: column; gap: 0.2rem;
        }
        .message-me .msg-bubble {
          background: var(--cat-glow, rgba(244,114,182,0.15));
          border-color: rgba(255,255,255,0.1);
        }
        .msg-text { font-size: 0.875rem; color: var(--text); margin: 0; line-height: 1.45; word-break: break-word; }
        .msg-time { font-size: 0.62rem; color: var(--text-dim); align-self: flex-end; }

        /* Input */
        .chat-input-row {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .chat-input {
          flex: 1; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-xs); padding: 0.55rem 0.85rem;
          color: var(--text); font-size: 0.875rem; outline: none;
          transition: border-color 0.2s;
        }
        .chat-input::placeholder { color: var(--text-dim); }
        .chat-input:focus { border-color: var(--cat-color, #f472b6); }
        .send-btn {
          width: 38px; height: 38px; border-radius: 50%;
          background: var(--cat-color, #f472b6);
          border: none; cursor: pointer; color: #fff;
          display: flex; align-items: center; justify-content: center;
          transition: opacity 0.2s; flex-shrink: 0;
        }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .send-btn:not(:disabled):hover { opacity: 0.85; }
        .chat-login-prompt {
          display: flex; justify-content: center; padding: 1rem;
          border-top: 1px solid rgba(255,255,255,0.07);
        }

        /* Monetization row */
        .monetization-row {
          display: flex; gap: 0.75rem; flex-wrap: wrap;
        }
        .mono-btn {
          flex: 1; min-width: 160px; display: flex; align-items: center; justify-content: center;
          gap: 0.4rem; padding: 0.65rem 1rem; border-radius: var(--radius-xs);
          font-size: 0.82rem; font-weight: 700; cursor: pointer; text-decoration: none;
          transition: all 0.2s;
        }
        .mono-btn.gift {
          background: rgba(244,114,182,0.12); border: 1px solid rgba(244,114,182,0.3);
          color: #f472b6;
        }
        .mono-btn.gift:hover { background: rgba(244,114,182,0.2); }
        .mono-btn.profile {
          background: rgba(129,140,248,0.1); border: 1px solid rgba(129,140,248,0.25);
          color: #818cf8;
        }
        .mono-btn.profile:hover { background: rgba(129,140,248,0.18); }

        /* Safety note */
        .safety-note {
          font-size: 0.75rem; color: var(--text-dim); text-align: center;
          padding: 0.5rem; border-radius: var(--radius-xs);
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
        }

        /* Report modal */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 1rem;
        }
        .modal-box {
          background: var(--bg-2); border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-sm); padding: 1.5rem;
          width: 100%; max-width: 400px;
          display: flex; flex-direction: column; gap: 0.75rem;
        }
        .modal-title { font-size: 1rem; font-weight: 800; color: var(--text); margin: 0; }
        .modal-sub   { font-size: 0.85rem; color: var(--text-muted); margin: 0; }
        .report-textarea {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-xs); padding: 0.6rem 0.8rem;
          color: var(--text); font-size: 0.85rem; width: 100%; resize: vertical; outline: none;
        }
        .report-textarea:focus { border-color: var(--error); }
        .report-success { font-size: 0.85rem; color: var(--accent-green); text-align: center; }
        .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
        .btn-ghost {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
          color: var(--text-muted); border-radius: var(--radius-xs);
          padding: 0.5rem 1rem; font-size: 0.82rem; cursor: pointer;
        }
        .btn-danger {
          background: rgba(248,113,113,0.15); border: 1px solid rgba(248,113,113,0.35);
          color: var(--error); border-radius: var(--radius-xs);
          padding: 0.5rem 1rem; font-size: 0.82rem; cursor: pointer; font-weight: 700;
        }
        .btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Loading / error */
        .room-loading { display: flex; flex-direction: column; gap: 1rem; }
        .room-error {
          display: flex; flex-direction: column; align-items: center; gap: 1rem;
          padding: 4rem 2rem; text-align: center; color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
