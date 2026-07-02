"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const refreshTimerRef = useRef(null);

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
      headers: { Authorization: `Bearer ${token}` },
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
      })
      .catch(() => setError(t("chatPremium.loadError")))
      .finally(() => setLoading(false));
  }, [router, t]);

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

    const refreshChats = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        fetchChats({ silent: true });
      }, 1000);
    };

    socket.on("USER_ONLINE", markOnline);
    socket.on("USER_OFFLINE", markOffline);
    socket.on("message:new", refreshChats);
    socket.on("message:sent", refreshChats);
    socket.on("chat:unread_count_updated", refreshChats);
    return () => {
      socket.off("USER_ONLINE", markOnline);
      socket.off("USER_OFFLINE", markOffline);
      socket.off("message:new", refreshChats);
      socket.off("message:sent", refreshChats);
      socket.off("chat:unread_count_updated", refreshChats);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchChats]);

  const totalChats = chats.length;
  const chatsWithMessages = useMemo(() => chats.filter((chat) => chat.lastMessage).length, [chats]);
  const filteredChats = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return chats;
    return chats.filter((chat) => {
      const other = chat.participants?.find((p) => p._id !== chat.currentUserId) || {};
      const displayName = getDisplayName(other).toLowerCase();
      const lastMessage = getMessagePreview(chat.lastMessage, "").toLowerCase();
      return displayName.includes(query) || lastMessage.includes(query);
    });
  }, [chats, searchTerm]);

  return (
    <div className="chats-page">
      <section className="chat-hero">
        <div className="hero-copy">
          <span className="eyebrow">{t("chatPremium.privateMessaging")}</span>
          <h1 className="page-title">{t("chatPremium.title")}</h1>
          <p className="page-subtitle">{t("chatPremium.subtitle")}</p>
          <div className="hero-pills" aria-hidden="true">
            <span>{t("chatPremium.premiumUI")}</span>
            <span>{t("chatPremium.realtime")}</span>
            <span>{t("chatPremium.private")}</span>
          </div>
        </div>
        <div className="hero-stats" aria-label={t("chatPremium.summaryAria")}>
          <div>
            <strong>{totalChats}</strong>
            <span>{t("chatPremium.chats")}</span>
          </div>
          <div>
            <strong>{chatsWithMessages}</strong>
            <span>{t("chatPremium.withMessages")}</span>
          </div>
        </div>
      </section>

      <section className="chat-toolbar" aria-label={t("chatPremium.searchConversationsAria")}>
        <div className="search-shell">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("chatPremium.searchPlaceholder")}
            aria-label={t("chatPremium.searchConversationsAria")}
          />
        </div>
        <div className="toolbar-badge" aria-hidden="true">
          <span className="pulse-dot" />
          {chatsWithMessages} {t("chatPremium.active")}
        </div>
      </section>

      {error && <div className="banner-error">{error}</div>}

      {loading && (
        <div className="chats-list" aria-label={t("chatPremium.loadingConversations")}>
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

      {!loading && chats.length > 0 && filteredChats.length === 0 && (
        <div className="empty-state compact">
          <div className="empty-orb">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <span className="empty-kicker">{t("chatPremium.noResults")}</span>
          <h3>{t("chatPremium.conversationNotFound")}</h3>
          <p>{t("chatPremium.tryDifferentSearch")}</p>
        </div>
      )}

      {!loading && filteredChats.length > 0 && (
        <div className="chats-list">
          {filteredChats.map((chat) => {
            const other = chat.participants?.find((p) => p._id !== chat.currentUserId) || {};
            const displayName = getDisplayName(other);
            const initial = displayName[0].toUpperCase();
            const lastMsg = chat.lastMessage;
            const userImage = getUserImage(other);
            const isOnline = onlineUserIds.has(String(other._id));
            const lastDate = lastMsg?.createdAt || chat.updatedAt;
            const lastTime = formatChatTime(lastDate, locale, t("chatPremium.yesterday"));

            return (
              <Link key={chat._id} href={`/chats/${chat._id}`} className="chat-row">
                <div className="avatar-ring" data-online={isOnline}>
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
                  </div>
                  <div className="chat-meta-row">
                    <span>{isOnline ? t("chatPremium.online") : t("chatPremium.privateChat")}</span>
                    <span className="meta-separator" />
                    <span>{lastMsg ? t("chatPremium.withMessages") : t("chatPremium.defaultPreview")}</span>
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
          gap: 1rem;
          position: relative;
        }

        .chat-hero {
          position: relative;
          overflow: hidden;
          display: flex;
          justify-content: space-between;
          gap: 1.25rem;
          padding: 1.45rem;
          border: 1px solid rgba(236,124,255,0.34);
          border-radius: 32px;
          background:
            radial-gradient(circle at 12% 16%, rgba(224,64,251,0.34), transparent 34%),
            radial-gradient(circle at 88% 4%, rgba(34,211,238,0.24), transparent 36%),
            radial-gradient(circle at 74% 86%, rgba(124,58,237,0.24), transparent 38%),
            linear-gradient(145deg, rgba(32,18,68,0.92), rgba(15,8,33,0.96));
          box-shadow: 0 22px 58px rgba(4,2,12,0.46), inset 0 1px 0 rgba(255,255,255,0.1);
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

        .page-title {
          margin-bottom: 0.25rem;
          font-size: clamp(2rem, 4vw, 3.3rem);
          letter-spacing: -0.05em;
        }
        .page-subtitle { max-width: 620px; margin: 0; color: rgba(237,231,255,0.74); }
        .hero-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 1rem;
        }
        .hero-pills span {
          padding: 0.34rem 0.62rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.78);
          font-size: 0.72rem;
          font-weight: 800;
        }

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
          background: linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035));
          backdrop-filter: blur(12px);
        }
        .hero-stats strong { color: #fff; font-size: 1.3rem; line-height: 1; }
        .hero-stats span { margin-top: 0.25rem; color: var(--text-muted); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }

        .chat-toolbar {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          padding: 0.75rem;
          border: 1px solid rgba(236,124,255,0.2);
          border-radius: 24px;
          background: rgba(15,8,32,0.58);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
          backdrop-filter: blur(16px);
        }
        .search-shell {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 0.62rem;
          height: 48px;
          padding: 0 0.9rem;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 18px;
          color: var(--text-dim);
          background:
            linear-gradient(135deg, rgba(255,255,255,0.07), transparent 45%),
            rgba(7,4,18,0.58);
          transition: border-color var(--transition), box-shadow var(--transition), background var(--transition);
        }
        .search-shell:focus-within {
          border-color: rgba(34,211,238,0.42);
          box-shadow: 0 0 0 4px rgba(34,211,238,0.08), 0 0 24px rgba(124,58,237,0.14);
          background: rgba(10,5,26,0.78);
        }
        .search-shell input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--text);
          font: inherit;
          font-weight: 700;
        }
        .search-shell input::placeholder { color: var(--text-dim); }
        .toolbar-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.46rem;
          flex-shrink: 0;
          height: 48px;
          padding: 0 0.9rem;
          border: 1px solid rgba(52,211,153,0.18);
          border-radius: 18px;
          color: var(--accent-green);
          background: rgba(52,211,153,0.08);
          font-size: 0.76rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent-green);
          box-shadow: 0 0 0 0 rgba(52,211,153,0.42);
          animation: pulseDot 1.8s ease-out infinite;
        }

        .chats-list { display: flex; flex-direction: column; gap: 0.78rem; }

        .chat-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          cursor: pointer;
          overflow: hidden;
          transition: transform var(--transition-slow), border-color var(--transition), box-shadow var(--transition), background var(--transition);
          border: 1px solid rgba(236,124,255,0.2);
          border-radius: 26px;
          background:
            radial-gradient(circle at 0% 50%, rgba(224,64,251,0.12), transparent 38%),
            linear-gradient(135deg, rgba(255,255,255,0.07), transparent 40%),
            rgba(15,8,32,0.82);
          box-shadow: 0 14px 34px rgba(4,2,12,0.36), inset 0 1px 0 rgba(255,255,255,0.06);
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
          border-color: rgba(34,211,238,0.38);
          background: rgba(22,12,45,0.92);
          box-shadow: 0 20px 48px rgba(4,2,12,0.5), 0 0 26px rgba(124,58,237,0.2);
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
          box-shadow: 0 0 0 5px rgba(224,64,251,0.055), 0 12px 28px rgba(0,0,0,0.34);
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
          font-weight: 900;
          color: var(--text);
          font-size: 1.02rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chat-preview-row { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.24rem; min-width: 0; }
        .chat-preview {
          color: var(--text-muted);
          font-size: 0.84rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .chat-meta-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-top: 0.42rem;
          color: var(--text-dim);
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .meta-separator {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
        }

        .chat-time {
          flex-shrink: 0;
          color: rgba(255,255,255,0.72);
          font-size: 0.72rem;
          font-weight: 900;
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-pill);
          background: rgba(255,255,255,0.055);
          border: 1px solid rgba(255,255,255,0.07);
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
        .empty-state.compact { padding: 3rem 2rem; }
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
        @keyframes pulseDot {
          0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.42); }
          70% { box-shadow: 0 0 0 9px rgba(52,211,153,0); }
          100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
        }

        @media (max-width: 720px) {
          .chat-hero { flex-direction: column; border-radius: 24px; padding: 1.15rem; }
          .hero-stats { grid-template-columns: repeat(2, 1fr); }
          .chat-toolbar { flex-direction: column; align-items: stretch; border-radius: 22px; }
          .toolbar-badge { width: 100%; justify-content: center; height: 42px; }
          .chat-row { border-radius: 22px; padding: 0.85rem; gap: 0.8rem; }
          .avatar-ring { width: 52px; height: 52px; }
          .chat-arrow { display: none; }
          .chat-meta-row { display: none; }
          .chat-time { padding: 0; border: 0; background: transparent; }
        }
      `}</style>
    </div>
  );
}
