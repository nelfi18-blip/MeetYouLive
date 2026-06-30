"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import { getDisplayName, getUserImage } from "@/lib/imageHelpers";
import { PROFILE_UPDATED_EVENT } from "@/lib/profileSync";
import { useLanguage } from "@/contexts/LanguageContext";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const formatChatTime = (value, locale, yesterdayLabel) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  if (isYesterday) return yesterdayLabel;
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
};

const getIsoDateTime = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const getMessagePreview = (message, fallback) => {
  const text = message?.text?.trim();
  return text || fallback;
};

export default function ChatsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const locale = t("chatPremium.locale");
  const [chats, setChats] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOnlineUsers = useCallback((token) => {
    if (!token) return;

    fetch(`${API_URL}/api/user/online`, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.users) return;
        setOnlineUserIds(new Set(data.users.map((user) => String(user._id))));
      })
      .catch(() => {});
  }, []);

  const fetchChats = useCallback(({ silent = false } = {}) => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    if (!silent) setLoading(true);
    setError("");
    fetch(`${API_URL}/api/chats`, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
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
        fetchOnlineUsers(token);
      })
      .catch(() => setError(t("chatPremium.loadError")))
      .finally(() => setLoading(false));
  }, [fetchOnlineUsers, router, t]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    const handleProfileUpdated = () => fetchChats({ silent: true });
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
  }, [fetchChats]);

  useEffect(() => {
    const markOnline = ({ userId }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.add(String(userId));
        return next;
      });
    };
    const markOffline = ({ userId }) => {
      if (!userId) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(String(userId));
        return next;
      });
    };

    socket.on("USER_ONLINE", markOnline);
    socket.on("USER_OFFLINE", markOffline);
    return () => {
      socket.off("USER_ONLINE", markOnline);
      socket.off("USER_OFFLINE", markOffline);
    };
  }, []);

  const totalChats = chats.length;
  const activeChats = useMemo(() => chats.filter((chat) => chat.lastMessage).length, [chats]);

  return (
    <div className="chats-page">
      <section className="chat-hero">
        <div className="hero-copy">
          <span className="eyebrow">{t("chatPremium.privateMessaging")}</span>
          <h1 className="page-title">{t("chatPremium.title")}</h1>
          <p className="page-subtitle">{t("chatPremium.subtitle")}</p>
        </div>
        <div className="hero-stats" aria-label="Resumen de conversaciones">
          <div>
            <strong>{totalChats}</strong>
            <span>{t("chatPremium.chats")}</span>
          </div>
          <div>
            <strong>{activeChats}</strong>
            <span>{t("chatPremium.active")}</span>
          </div>
        </div>
      </section>

      {error && <div className="banner-error">{error}</div>}

      {loading && (
        <div className="chats-list" aria-label="Cargando conversaciones">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="chat-row skeleton-row">
              <div className="skeleton skeleton-avatar" />
              <div className="skeleton-lines">
                <div className="skeleton skeleton-line wide" />
                <div className="skeleton skeleton-line" />
              </div>
              <div className="skeleton skeleton-time" />
            </div>
          ))}
        </div>
      )}

      {!loading && chats.length === 0 && (
        <div className="empty-state">
          <div className="empty-orb">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              <path d="M8 9h8M8 13h5" />
            </svg>
          </div>
          <span className="empty-kicker">{t("chatPremium.emptyKicker")}</span>
          <h3>{t("chatPremium.emptyTitle")}</h3>
          <p>{t("chatPremium.emptyText")}</p>
          <Link href="/explore" className="btn btn-primary empty-action">
            {t("chatPremium.exploreCreators")}
          </Link>
        </div>
      )}

      {!loading && chats.length > 0 && (
        <div className="chats-list">
          {chats.map((chat) => {
            const other = chat.participants?.find((p) => p._id !== chat.currentUserId) || {};
            const displayName = getDisplayName(other);
            const initial = displayName?.[0]?.toUpperCase() || "U";
            const lastMsg = chat.lastMessage;
            const userImage = getUserImage(other);
            const isOnline = onlineUserIds.has(String(other._id));
            const lastDate = lastMsg?.createdAt || chat.updatedAt;
            const lastTime = formatChatTime(lastDate, locale, t("chatPremium.yesterday"));

            return (
              <Link key={chat._id} href={`/chats/${chat._id}`} className="chat-row">
                <div className="avatar-ring" data-online={isOnline ? "true" : "false"}>
                  <div className="chat-avatar">
                    {userImage ? (
                      <img src={userImage} alt={displayName} className="chat-avatar-img" />
                    ) : (
                      initial
                    )}
                  </div>
                  {isOnline && <span className="online-dot" aria-label={t("chatPremium.online")} />}
                </div>

                <div className="chat-info">
                  <div className="chat-topline">
                    <div className="chat-name">{displayName}</div>
                    {lastTime && <time className="chat-time" dateTime={getIsoDateTime(lastDate)}>{lastTime}</time>}
                  </div>
                  <div className="chat-preview-row">
                    <span className="chat-preview">{getMessagePreview(lastMsg, t("chatPremium.defaultPreview"))}</span>
                    {isOnline && <span className="online-label">{t("chatPremium.online")}</span>}
                  </div>
                </div>

                <div className="chat-arrow" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .chats-page {
          display: flex;
          flex-direction: column;
          gap: 1.35rem;
          position: relative;
        }

        .chat-hero {
          position: relative;
          overflow: hidden;
          display: flex;
          justify-content: space-between;
          gap: 1.25rem;
          padding: 1.35rem;
          border: 1px solid rgba(236,124,255,0.34);
          border-radius: 28px;
          background:
            radial-gradient(circle at 14% 18%, rgba(224,64,251,0.24), transparent 34%),
            radial-gradient(circle at 86% 0%, rgba(34,211,238,0.18), transparent 35%),
            linear-gradient(145deg, rgba(32,18,68,0.92), rgba(15,8,33,0.96));
          box-shadow: var(--shadow-glass), inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .chat-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 15%, rgba(255,255,255,0.08) 45%, transparent 70%);
          transform: translateX(-100%);
          animation: heroShimmer 7s ease-in-out infinite;
          pointer-events: none;
        }

        .hero-copy { position: relative; z-index: 1; max-width: 680px; }
        .eyebrow {
          display: inline-flex;
          width: fit-content;
          margin-bottom: 0.55rem;
          padding: 0.28rem 0.65rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(34,211,238,0.28);
          background: rgba(34,211,238,0.08);
          color: var(--accent-cyan);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .page-title { margin-bottom: 0.25rem; }
        .page-subtitle { max-width: 620px; margin: 0; }

        .hero-stats {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(2, minmax(84px, 1fr));
          gap: 0.65rem;
          align-self: stretch;
        }
        .hero-stats div {
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 84px;
          padding: 0.8rem;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.055);
          backdrop-filter: blur(12px);
        }
        .hero-stats strong { color: #fff; font-size: 1.3rem; line-height: 1; }
        .hero-stats span { margin-top: 0.25rem; color: var(--text-muted); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }

        .chats-list { display: flex; flex-direction: column; gap: 0.72rem; }

        .chat-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.95rem;
          padding: 0.95rem;
          cursor: pointer;
          overflow: hidden;
          transition: transform var(--transition-slow), border-color var(--transition), box-shadow var(--transition), background var(--transition);
          border: 1px solid rgba(236,124,255,0.22);
          border-radius: 24px;
          background:
            linear-gradient(135deg, rgba(255,255,255,0.06), transparent 38%),
            rgba(15,8,32,0.76);
          box-shadow: 0 14px 32px rgba(4,2,12,0.34), inset 0 1px 0 rgba(255,255,255,0.05);
        }

        .chat-row::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0;
          background: radial-gradient(circle at 10% 50%, rgba(224,64,251,0.18), transparent 35%);
          transition: opacity var(--transition);
          pointer-events: none;
        }
        .chat-row:hover {
          border-color: rgba(34,211,238,0.34);
          background: rgba(22,12,45,0.92);
          box-shadow: 0 18px 44px rgba(4,2,12,0.48), 0 0 22px rgba(124,58,237,0.18);
          transform: translateY(-2px);
        }
        .chat-row:hover::before { opacity: 1; }
        .chat-row:hover .chat-arrow { opacity: 1; color: var(--accent-cyan); transform: translateX(2px); }

        .avatar-ring {
          position: relative;
          width: 58px;
          height: 58px;
          flex-shrink: 0;
          border-radius: 50%;
          padding: 2px;
          background: linear-gradient(135deg, rgba(224,64,251,0.75), rgba(124,58,237,0.35), rgba(34,211,238,0.55));
          box-shadow: 0 0 0 4px rgba(224,64,251,0.06), 0 12px 28px rgba(0,0,0,0.32);
        }
        .avatar-ring[data-online="true"] { box-shadow: 0 0 0 4px rgba(52,211,153,0.08), 0 0 22px rgba(52,211,153,0.16); }

        .chat-avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 900;
          font-size: 1.12rem;
          overflow: hidden;
          border: 2px solid rgba(15,8,33,0.95);
        }

        .chat-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: 50%;
        }
        .online-dot {
          position: absolute;
          right: 3px;
          bottom: 4px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--accent-green);
          border: 3px solid #120a28;
          box-shadow: 0 0 12px rgba(52,211,153,0.8);
        }

        .chat-info { position: relative; z-index: 1; flex: 1; min-width: 0; }
        .chat-topline { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .chat-name {
          font-weight: 800;
          color: var(--text);
          font-size: 1rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chat-preview-row { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.22rem; min-width: 0; }
        .chat-preview {
          color: var(--text-muted);
          font-size: 0.84rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .online-label {
          flex-shrink: 0;
          padding: 0.14rem 0.45rem;
          border-radius: var(--radius-pill);
          color: var(--accent-green);
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.18);
          font-size: 0.64rem;
          font-weight: 800;
        }

        .chat-time {
          flex-shrink: 0;
          color: var(--text-dim);
          font-size: 0.72rem;
          font-weight: 700;
        }
        .chat-arrow {
          position: relative;
          z-index: 1;
          color: var(--text-dim);
          opacity: 0.42;
          transition: all var(--transition);
          display: flex;
          flex-shrink: 0;
        }

        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .empty-state {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.8rem;
          padding: 4rem 2rem;
          text-align: center;
          border: 1px dashed rgba(139,92,246,0.34);
          border-radius: 28px;
          background:
            radial-gradient(circle at 50% 0%, rgba(224,64,251,0.18), transparent 36%),
            rgba(15,8,32,0.54);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .empty-orb {
          width: 84px;
          height: 84px;
          border-radius: 28px;
          background: linear-gradient(135deg, rgba(224,64,251,0.18), rgba(34,211,238,0.12));
          border: 1px solid rgba(236,124,255,0.22);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-2);
          box-shadow: 0 0 32px rgba(224,64,251,0.18);
        }
        .empty-kicker { color: var(--accent-cyan); font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
        .empty-state h3 { color: var(--text); font-size: 1.25rem; margin: 0; }
        .empty-state p  { color: var(--text-muted); font-size: 0.9rem; margin: 0; max-width: 360px; }
        .empty-action { margin-top: 0.35rem; }

        .skeleton-row { pointer-events: none; min-height: 84px; }
        .skeleton {
          border-radius: var(--radius-pill);
          background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%);
          background-size: 220% 100%;
          animation: shimmer 1.4s infinite;
        }
        .skeleton-avatar { width: 58px; height: 58px; flex-shrink: 0; }
        .skeleton-lines { flex: 1; display: flex; flex-direction: column; gap: 0.55rem; }
        .skeleton-line { width: 48%; height: 12px; }
        .skeleton-line.wide { width: 72%; height: 15px; }
        .skeleton-time { width: 44px; height: 12px; flex-shrink: 0; }

        @keyframes shimmer {
          0% { background-position: 220% 0; }
          100% { background-position: -220% 0; }
        }
        @keyframes heroShimmer {
          0%, 68% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        @media (max-width: 720px) {
          .chat-hero { flex-direction: column; border-radius: 24px; padding: 1.15rem; }
          .hero-stats { grid-template-columns: repeat(2, 1fr); }
          .chat-row { border-radius: 22px; padding: 0.85rem; gap: 0.8rem; }
          .avatar-ring { width: 52px; height: 52px; }
          .online-label { display: none; }
          .chat-arrow { display: none; }
        }
      `}</style>
    </div>
  );
}
