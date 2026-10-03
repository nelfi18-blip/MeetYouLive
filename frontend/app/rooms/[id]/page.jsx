"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import socket, { configureSocketAuth } from "@/lib/socket";
import GiftPanel from "@/components/GiftPanel";
import SimulationPanel from "@/components/SimulationPanel";
import QuickReactionBar from "@/components/QuickReactionBar";
import FloatingEmojiReactions from "@/components/FloatingEmojiReactions";
import RoomQuestion from "@/components/RoomQuestion";
import { ROOM_CATEGORY_META, getRoomDisplayText } from "@/lib/roomCategories";
import { useLanguage } from "@/contexts/LanguageContext";
import FuturisticCard from "@/components/ui/FuturisticCard";
import NeonBadge from "@/components/ui/NeonBadge";

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

// Ambient reaction emoji allowlist — must stay in sync with the backend
// allowlist in backend/src/lib/socialRoomReactions.js. The backend is
// authoritative and re-validates every reaction server-side.
const ROOM_REACTION_EMOJIS = ["❤️", "🔥", "😂", "👏", "😮", "👍"];

export default function SocialRoomPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useLanguage();
  const prefersReducedMotion = useReducedMotion();

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
  // Authoritative, server-resolved snapshot of who is online right now in
  // THIS room: [{ userId, username, name, avatar }]. Comes exclusively from
  // the `social_room:presence` event (backend/src/lib/socialRoomPresence.js).
  const [onlinePresence, setOnlinePresence] = useState([]);
  const [incomingReactions, setIncomingReactions] = useState([]);

  // Ambient "room question" / icebreaker activity — authoritative snapshot
  // from `social_room:icebreaker` (backend/src/lib/socialRoomIcebreaker.js).
  // Not a second chat, not SimulationPanel: just the single question every
  // participant in this room currently sees, which they discuss via the
  // existing chat below.
  const [roomQuestion, setRoomQuestion] = useState(null); // { category, questionIndex, startedAt }

  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { _id, username, name }
  const [reportReason, setReportReason] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSuccess, setReportSuccess] = useState("");

  // Tab: "chat" | "simulation" — simulation tab only for rooms offering
  // conversation-practice activities (confianza_amor, rompe_hielo)
  const [activeTab, setActiveTab] = useState("chat");

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const meta = room ? (ROOM_CATEGORY_META[room.category] || ROOM_CATEGORY_META.consejos_citas) : null;

  // Centralized condition for enabling the Simulation (conversation practice)
  // activity. Keep this as the single source of truth instead of repeating
  // `room.category === "confianza_amor"` in multiple places.
  const hasConversationPractice =
    room?.category === "confianza_amor" || room?.category === "rompe_hielo";

  // Scope for the ambient room-question/icebreaker activity. Currently the
  // same two categories as conversation practice — reuses the centralized
  // flag above instead of re-checking room.category, but remains logically
  // independent from SimulationPanel/the Simulation tab.
  const hasRoomQuestion = hasConversationPractice;
  const roomQuestionText =
    roomQuestion && roomQuestion.category
      ? t(`rooms.roomQuestion.questions.${roomQuestion.category}.${roomQuestion.questionIndex}`)
      : "";

  const { title: roomTitle, description: roomDescription } = getRoomDisplayText(room, t);

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
      .catch(() => setError(t("rooms.notFound")))
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

    configureSocketAuth(getToken());
    if (!socket.connected) socket.connect();

    const joinedRef = { current: false };

    const joinRoom = () => {
      if (joinedRef.current) return;
      joinedRef.current = true;
      // Identity is resolved server-side from the authenticated socket
      // (socket._userId) — the backend never trusts a client-sent `user`.
      socket.emit("join_social_room", { roomId: id });
    };

    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);

    const handleMessage = (msg) => {
      if (seenMsgIds.current.has(msg._id)) return;
      seenMsgIds.current.add(msg._id);
      setMessages((prev) => [...prev, msg]);
    };

    // Authoritative presence snapshot — replaces local increment/decrement
    // counters to avoid drift after reconnections or multi-tab sessions.
    const handlePresence = (payload) => {
      if (!payload || String(payload.roomId) !== String(id)) return; // extra client-side guard
      setOnlinePresence(Array.isArray(payload.participants) ? payload.participants : []);
      setOnlineCount(typeof payload.count === "number" ? payload.count : 0);
    };

    const handleReaction = (payload) => {
      if (!payload || typeof payload.emoji !== "string") return;
      if (String(payload.roomId) !== String(id)) return; // extra client-side guard
      setIncomingReactions([payload.emoji]);
    };

    // Authoritative snapshot of the room's shared question — identical for
    // every participant, server-picked (backend/src/lib/socialRoomIcebreaker.js).
    const handleRoomQuestion = (payload) => {
      if (!payload || String(payload.roomId) !== String(id)) return; // extra client-side guard
      setRoomQuestion(payload);
    };

    socket.on("ROOM_MESSAGE", handleMessage);
    socket.on("social_room:presence", handlePresence);
    socket.on("social_room:reaction", handleReaction);
    socket.on("social_room:icebreaker", handleRoomQuestion);

    return () => {
      joinedRef.current = false;
      socket.emit("leave_social_room", { roomId: id });
      socket.off("connect", joinRoom);
      socket.off("ROOM_MESSAGE", handleMessage);
      socket.off("social_room:presence", handlePresence);
      socket.off("social_room:reaction", handleReaction);
      socket.off("social_room:icebreaker", handleRoomQuestion);
      setOnlinePresence([]);
      setOnlineCount(0);
      setRoomQuestion(null);
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

  /* ── Send ambient reaction ───────────────────────────────────────────── */
  // Client-side emission only; the backend (socket.js / socialRoomReactions.js)
  // is authoritative: it re-checks auth, room membership, emoji allowlist
  // and per-user cooldown before broadcasting to social_room:<roomId> only.
  const sendRoomReaction = useCallback((emoji) => {
    if (!currentUser) { router.push("/login"); return; }
    socket.emit("social_room:react", { roomId: id, emoji });
  }, [id, currentUser, router]);

  /* ── Request a new room question (icebreaker) ───────────────────────── */
  // Client-side emission only; the backend (socket.js / socialRoomIcebreaker.js)
  // is authoritative: it re-checks auth, room membership, category and a
  // per-room cooldown before broadcasting the new question to the whole room.
  const requestNextRoomQuestion = useCallback(() => {
    if (!currentUser) { router.push("/login"); return; }
    socket.emit("social_room:icebreaker:next", { roomId: id });
  }, [id, currentUser, router]);

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
      setReportSuccess(t("rooms.reportSent"));
    } catch {
      setReportSuccess(t("rooms.reportError"));
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
        <Link href="/rooms" className="btn btn-primary">← {t("rooms.backToRooms")}</Link>
      </div>
    );
  }

  const participantChips = [];
  if (room?.host) {
    participantChips.push({ key: "host", user: room.host, roleIcon: "👑", roleLabel: t("rooms.host") });
  }
  if (Array.isArray(room?.moderators)) {
    room.moderators.forEach((m) => {
      if (m && typeof m === "object") {
        participantChips.push({ key: `mod-${m._id}`, user: m, roleIcon: "🛡️", roleLabel: t("rooms.mod") });
      }
    });
  }
  if (Array.isArray(room?.highlightedUsers)) {
    room.highlightedUsers.forEach((u) => {
      participantChips.push({ key: `hl-${u._id}`, user: u, roleIcon: "⭐", roleLabel: t("rooms.highlighted") });
    });
  }

  // Avoid showing host/mod/highlighted users twice: if they're also present
  // in the live presence snapshot, they already have a dedicated chip above.
  const highlightedUserIds = new Set(
    participantChips.map(({ user }) => String(user?._id || user || ""))
  );
  const MAX_VISIBLE_ONLINE = 8;
  const onlineParticipants = onlinePresence.filter(
    (p) => p && !highlightedUserIds.has(String(p.userId))
  );
  const visibleOnlineParticipants = onlineParticipants.slice(0, MAX_VISIBLE_ONLINE);
  const extraOnlineCount = Math.max(0, onlineParticipants.length - visibleOnlineParticipants.length);

  return (
    <div className="room-page" style={{ "--cat-color": meta?.color, "--cat-glow": meta?.glow }}>
      {/* Header */}
      <FuturisticCard accent={meta?.accent} hover={false} className="room-header-card">
        <div className="room-header">
          <Link href="/rooms" className="back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </Link>
          <div className="room-header-info">
            <div className="room-header-title">
              <span className="room-cat-emoji">{meta?.emoji}</span>
              <h1 className="room-name">{roomTitle}</h1>
            </div>
            <div className="room-header-meta">
              <NeonBadge tone="green">
                <span className="online-dot" />
                {onlineCount} {t("rooms.online")}
              </NeonBadge>
              {isHost && <NeonBadge tone="purple">👑 {t("rooms.host")}</NeonBadge>}
              {isMod && !isHost && <NeonBadge tone="cyan">🛡️ {t("rooms.mod")}</NeonBadge>}
            </div>
            {roomDescription && (
              <p className="room-description">{roomDescription}</p>
            )}
          </div>
          {/* Gift CTA for host */}
          {room?.host && !isHost && currentUser && (
            <button className="gift-cta-btn" onClick={() => setShowGiftPanel(true)} title={t("rooms.sendGiftToHost")}>
              🎁
            </button>
          )}
        </div>
      </FuturisticCard>

      {/* Social presence — host / moderators / highlighted users (existing data only) */}
      {participantChips.length > 0 && (
        <div className="participants-row">
          {participantChips.map(({ key, user, roleIcon, roleLabel }) => (
            <span key={key} className="participant-chip" title={roleLabel}>
              <span className="participant-avatar">
                {user.avatar
                  ? <img src={user.avatar} alt={user.username || user.name || ""} width={22} height={22} style={{ borderRadius: "50%", objectFit: "cover" }} />
                  : <span>{(user.username || user.name || "?")[0]?.toUpperCase()}</span>}
              </span>
              <span className="participant-name">{user.username || user.name}</span>
              <span className="participant-role">{roleIcon}</span>
            </span>
          ))}
        </div>
      )}

      {/* Real-time visual presence — authoritative snapshot from
          `social_room:presence` (backend/src/lib/socialRoomPresence.js).
          Complements, but never duplicates, the host/mod/highlighted row above. */}
      {onlineParticipants.length > 0 && (
        <div className="online-presence-row" aria-label={t("rooms.presence.ariaLabel")}>
          <span className="online-presence-label">{t("rooms.presence.label")}</span>
          <div className="online-presence-avatars">
            {visibleOnlineParticipants.map((p) => (
              <span
                key={p.userId}
                className={`presence-chip${prefersReducedMotion ? " no-motion" : ""}`}
                title={p.username || p.name || t("rooms.defaultUser")}
              >
                <span className="presence-avatar">
                  {p.avatar
                    ? <img src={p.avatar} alt={p.username || p.name || ""} width={20} height={20} style={{ borderRadius: "50%", objectFit: "cover" }} />
                    : <span>{(p.username || p.name || "?")[0]?.toUpperCase()}</span>}
                  <span className="presence-online-dot" aria-hidden="true" />
                </span>
                <span className="presence-name">{p.username || p.name}</span>
              </span>
            ))}
            {extraOnlineCount > 0 && (
              <span
                className="presence-chip presence-overflow"
                title={t("rooms.presence.andMore").replace("{count}", String(extraOnlineCount))}
              >
                +{extraOnlineCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Ambient "room question" / icebreaker — a single shared question for
          every participant in this room, used as a conversation starter.
          Not a second chat and not SimulationPanel: answers happen in the
          existing chat below. Scoped to rompe_hielo / confianza_amor only. */}
      {hasRoomQuestion && roomQuestionText && (
        <RoomQuestion
          questionText={roomQuestionText}
          canRequestNext={!!currentUser}
          onNext={requestNextRoomQuestion}
          reducedMotion={!!prefersReducedMotion}
          labels={{
            label: t("rooms.roomQuestion.label"),
            ariaLabel: t("rooms.roomQuestion.ariaLabel"),
            next: t("rooms.roomQuestion.next"),
          }}
        />
      )}

      {/* Ambient quick reactions — authenticated users only. Rendered inline
          (not fixed) so it never covers chat input, tabs, nav, GiftPanel or
          modals. Reused from the Live component via non-invasive props. */}
      {currentUser && (
        <QuickReactionBar
          variant="inline"
          position="bottom"
          cooldownMs={1200}
          reducedMotion={!!prefersReducedMotion}
          ariaLabel={t("rooms.reactions.ariaLabel")}
          onReact={sendRoomReaction}
          reactions={[
            { emoji: "❤️", label: t("rooms.reactions.love"), color: "#f87171" },
            { emoji: "🔥", label: t("rooms.reactions.fire"), color: "#f97316" },
            { emoji: "😂", label: t("rooms.reactions.laugh"), color: "#fbbf24" },
            { emoji: "👏", label: t("rooms.reactions.clap"), color: "#34d399" },
            { emoji: "😮", label: t("rooms.reactions.wow"), color: "#a78bfa" },
            { emoji: "👍", label: t("rooms.reactions.like"), color: "#60a5fa" },
          ]}
        />
      )}

      {/* Tab bar — only for rooms offering the conversation-practice activity */}
      {hasConversationPractice && (
        <div className="room-tabs">
          <button
            className={`room-tab ${activeTab === "chat" ? "room-tab--active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            💬 {t("rooms.groupChat")}
          </button>
          <button
            className={`room-tab ${activeTab === "simulation" ? "room-tab--active" : ""}`}
            onClick={() => setActiveTab("simulation")}
          >
            {room?.category === "rompe_hielo"
              ? <>🧊 {t("rooms.icebreakerActivity")}</>
              : <>🎯 {t("rooms.practiceConversation")}</>}
          </button>
        </div>
      )}

      {/* Simulation panel */}
      {activeTab === "simulation" && hasConversationPractice && (
        <SimulationPanel currentUser={currentUser} />
      )}

      {/* Chat area */}
      {activeTab === "chat" && (
      <div className="chat-container">
        {/* Ambient floating reactions — rendered within the Room's own
            visual space, never covering the chat input below. */}
        <FloatingEmojiReactions
          reactions={incomingReactions}
          bottomOffset={64}
          reducedMotion={!!prefersReducedMotion}
          ariaLabel={t("rooms.reactions.liveRegionLabel")}
        />
        <div className="messages-list">
          {loadingMsgs && (
            <div className="chat-loading">{t("rooms.loadingMessages")}</div>
          )}
          {!loadingMsgs && messages.length === 0 && (
            <div className="chat-empty">
              <span>{meta?.emoji}</span>
              <p>{t("rooms.emptyChat")}</p>
            </div>
          )}
          {messages.map((msg) => {
            const senderId = String(msg.sender?._id || msg.sender || "");
            const isMe = currentUser && senderId === String(currentUser._id);
            const msgIsHost = room?.host && senderId === String(room.host._id || room.host);
            const msgIsMod = room?.moderators?.some((m) => String(m._id || m) === senderId);
            const senderName = msg.sender?.username || msg.sender?.name || t("rooms.defaultUser");

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
                        title={t("rooms.reportUser")}
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
              placeholder={t("rooms.messagePlaceholder")}
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
              {t("rooms.loginToChat")}
            </Link>
          </div>
        )}
      </div>
      )} {/* end activeTab === "chat" */}

      {/* Monetization CTAs */}
      {currentUser && room?.host && !isHost && (
        <div className="monetization-row">
          <button className="mono-btn gift" onClick={() => setShowGiftPanel(true)}>
            🎁 {t("rooms.sendGiftToHost")}
          </button>
          <Link href={`/creator/${room.host._id || room.host}`} className="mono-btn profile">
            👤 {t("rooms.viewHostProfile")}
          </Link>
        </div>
      )}

      {/* Safety note */}
      <div className="safety-note">
        🛡️ {t("rooms.safetyNote")}
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
            <h3 className="modal-title">{t("rooms.reportUser")}</h3>
            <p className="modal-sub">
              {t("rooms.reportingUser")} <strong>{reportTarget.username || reportTarget.name}</strong>
            </p>
            {reportSuccess ? (
              <p className="report-success">{reportSuccess}</p>
            ) : (
              <>
                <textarea
                  className="report-textarea"
                  placeholder={t("rooms.reportReasonPlaceholder")}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={3}
                  maxLength={300}
                />
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setShowReportModal(false)}>{t("common.cancel")}</button>
                  <button
                    className="btn btn-danger"
                    onClick={submitReport}
                    disabled={reportSending || !reportReason.trim()}
                  >
                    {reportSending ? t("rooms.sending") : t("rooms.report")}
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
        :global(.room-header-card) { padding: 0; }
        .room-header {
          display: flex; align-items: flex-start; gap: 0.75rem;
          padding: 1rem 1.25rem;
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
        .room-header-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.4rem; }
        .room-header-title { display: flex; align-items: center; gap: 0.5rem; }
        .room-cat-emoji { font-size: 1.3rem; flex-shrink: 0; }
        .room-name {
          font-size: 1rem; font-weight: 800; color: var(--text); margin: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .room-header-meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .online-dot {
          display: inline-block; width: 5px; height: 5px; border-radius: 50%;
          background: currentColor; animation: dotPulse 1.4s infinite;
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        .gift-cta-btn {
          background: rgba(244,114,182,0.12); border: 1px solid rgba(244,114,182,0.3);
          border-radius: 999px; padding: 0.4rem 0.8rem; font-size: 1rem;
          cursor: pointer; transition: all 0.2s; flex-shrink: 0;
        }
        .gift-cta-btn:hover { background: rgba(244,114,182,0.22); }

        /* Room description */
        .room-description {
          font-size: 0.85rem; color: var(--text-muted); margin: 0;
        }

        /* Social presence row — host / moderators / highlighted users */
        .participants-row {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
          padding: 0.6rem 1rem;
          border-radius: var(--radius-xs);
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
        }
        .participant-chip {
          display: inline-flex; align-items: center; gap: 0.35rem;
          font-size: 0.72rem; font-weight: 600; color: var(--text);
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px; padding: 0.15rem 0.6rem 0.15rem 0.15rem;
        }
        .participant-avatar {
          width: 22px; height: 22px; border-radius: 50%; overflow: hidden;
          background: var(--bg-3); display: flex; align-items: center; justify-content: center;
          font-size: 0.65rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0;
        }
        .participant-name { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .participant-role { font-size: 0.72rem; }

        /* Real-time visual presence — who is online right now in this room.
           Mobile-first: wraps, never fills the screen, caps visible chips
           and shows a +N overflow instead of an endless list. */
        .online-presence-row {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-xs);
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
        }
        .online-presence-label {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em;
          text-transform: uppercase; color: var(--text-muted); flex-shrink: 0;
        }
        .online-presence-avatars {
          display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;
        }
        .presence-chip {
          display: inline-flex; align-items: center; gap: 0.3rem;
          font-size: 0.68rem; font-weight: 600; color: var(--text);
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px; padding: 0.1rem 0.5rem 0.1rem 0.1rem;
          transition: background 0.2s;
        }
        .presence-chip.no-motion { transition: none; }
        .presence-avatar {
          position: relative; width: 20px; height: 20px; border-radius: 50%; overflow: hidden;
          background: var(--bg-3); display: flex; align-items: center; justify-content: center;
          font-size: 0.6rem; font-weight: 700; color: var(--text-muted); flex-shrink: 0;
        }
        .presence-online-dot {
          position: absolute; bottom: -1px; right: -1px; width: 7px; height: 7px;
          border-radius: 50%; background: #34d399; border: 1.5px solid var(--bg-1, #0a0a12);
        }
        .presence-name {
          max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .presence-overflow {
          color: var(--text-muted); font-weight: 700; padding: 0.1rem 0.55rem;
        }
        @media (max-width: 480px) {
          .presence-name { max-width: 56px; }
          .online-presence-label { display: none; }
        }

        /* Chat container */
        .chat-container {
          display: flex; flex-direction: column;
          position: relative;
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
