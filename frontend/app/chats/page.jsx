"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import { getDisplayName, getUserImage } from "@/lib/imageHelpers";
import { PROFILE_UPDATED_EVENT } from "@/lib/profileSync";
import { useLanguage } from "@/contexts/LanguageContext";
import socket, { configureSocketAuth } from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const CALL_REFRESH_EVENT_NAMES = ["CALL_INCOMING", "CALL_ACCEPTED", "CALL_REJECTED", "CALL_ENDED", "CALL_MISSED"];
const ACTIVE_CALL_STATUSES = new Set(["pending", "accepted"]);
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const CHAT_REFRESH_DEBOUNCE_MS = 800;

const formatChatTime = (value, locale, yesterdayLabel) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
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

const getActivityTime = (value) => {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const safeJson = (response) => response.json().catch(() => ({}));

const isRecentActivity = (value, now = Date.now()) =>
  Boolean(value) && now - getActivityTime(value) < RECENT_WINDOW_MS;

const createContactSummary = (user) => ({
  user,
  activityAt: 0,
  contexts: new Set(),
  messageCount: 0,
  callCount: 0,
  isOnline: false,
});

const getCallActivityAt = (call) => call?.startedAt || call?.createdAt || call?.endedAt;

const getOtherParticipant = (chat) =>
  chat?.participants?.find((participant) => String(participant._id) !== String(chat.currentUserId)) || {};

const getCallPeer = (call) => call?.peer || call?.caller || call?.recipient || null;

const getCallPeerId = (call) => String(getCallPeer(call)?._id || "");

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.08 4.18 2 2 0 014.06 2h3a2 2 0 012 1.72c.12.9.33 1.78.63 2.63a2 2 0 01-.45 2.11L8 9.7a16 16 0 006.3 6.3l1.24-1.24a2 2 0 012.11-.45c.85.3 1.73.51 2.63.63A2 2 0 0122 16.92z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function ContactAvatar({ user, name, online, inCall, size = "md" }) {
  const image = getUserImage(user);
  const initial = (name || getDisplayName(user) || "U")[0]?.toUpperCase() || "U";
  return (
    <div className={`avatar-ring ${size}`} data-online={online ? "true" : "false"} data-call={inCall ? "true" : "false"}>
      <div className="chat-avatar">
        {image ? <img src={image} alt={name || getDisplayName(user)} className="chat-avatar-img" /> : initial}
      </div>
      {inCall ? <span className="call-dot" aria-label="In call" /> : online ? <span className="online-dot" aria-label="Online" /> : null}
    </div>
  );
}

export default function ChatsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { t } = useLanguage();
  const locale = t("chatPremium.locale");
  const [chats, setChats] = useState([]);
  const [calls, setCalls] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const refreshTimerRef = useRef(null);

  const getBackendToken = useCallback(
    () => session?.backendToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null),
    [session?.backendToken]
  );

  const fetchChats = useCallback(async ({ silent = false } = {}) => {
    const token = getBackendToken();
    if (!token) {
      if (sessionStatus === "loading") return;
      clearToken();
      router.replace("/login");
      return;
    }

    if (!silent) setLoading(true);
    setError("");
    try {
      configureSocketAuth(token);
      if (!socket.connected) socket.connect();

      const chatRes = await fetch(`${API_URL}/api/chats`, {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (chatRes.status === 401) {
        clearToken();
        router.replace("/login");
        return;
      }
      if (!chatRes.ok) throw new Error("Failed to fetch chats");
      const chatData = await chatRes.json();
      setChats(Array.isArray(chatData) ? chatData : []);

      const [historyResult, incomingResult] = await Promise.allSettled([
        fetch(`${API_URL}/api/calls/history?limit=12`, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        }),
        fetch(`${API_URL}/api/calls/incoming`, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        }),
      ]);

      if (historyResult.status === "fulfilled" && historyResult.value.ok) {
        const data = await safeJson(historyResult.value);
        setCalls(Array.isArray(data?.calls) ? data.calls : []);
      }
      if (incomingResult.status === "fulfilled" && incomingResult.value.ok) {
        const data = await safeJson(incomingResult.value);
        setIncomingCall(data?.call || null);
      }
    } catch {
      setError(t("chatPremium.loadError"));
    } finally {
      setLoading(false);
    }
  }, [getBackendToken, router, sessionStatus, t]);

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
      }, CHAT_REFRESH_DEBOUNCE_MS);
    };

    socket.on("USER_ONLINE", markOnline);
    socket.on("USER_OFFLINE", markOffline);
    socket.on("message:new", refreshChats);
    socket.on("message:sent", refreshChats);
    socket.on("chat:unread_count_updated", refreshChats);
    CALL_REFRESH_EVENT_NAMES.forEach((event) => socket.on(event, refreshChats));
    return () => {
      socket.off("USER_ONLINE", markOnline);
      socket.off("USER_OFFLINE", markOffline);
      socket.off("message:new", refreshChats);
      socket.off("message:sent", refreshChats);
      socket.off("chat:unread_count_updated", refreshChats);
      CALL_REFRESH_EVENT_NAMES.forEach((event) => socket.off(event, refreshChats));
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchChats]);

  const totalChats = chats.length;
  const chatsWithMessages = useMemo(() => chats.filter((chat) => chat.lastMessage).length, [chats]);
  const missedCalls = useMemo(() => calls.filter((call) => call.status === "missed").length, [calls]);
  const newMessageSignals = useMemo(() => {
    const now = Date.now();
    return chats.filter((chat) => isRecentActivity(chat.lastMessage?.createdAt, now)).length;
  }, [chats]);

  const activeCall = useMemo(() => {
    if (incomingCall) return { ...incomingCall, direction: "incoming", peer: incomingCall.caller };
    return calls.find((call) => ACTIVE_CALL_STATUSES.has(call.rawStatus || call.status)) || null;
  }, [calls, incomingCall]);

  const activePeerId = getCallPeerId(activeCall);

  const contactSummaries = useMemo(() => {
    const contacts = new Map();
    const recordContactActivity = ({ user, activityAt, context, isOnline, messageCount = 0, callCount = 0 }) => {
      const id = String(user?._id || "");
      if (!id) return;
      const previous = contacts.get(id) || createContactSummary(user);
      contacts.set(id, {
        ...previous,
        user: { ...previous.user, ...user },
        activityAt: Math.max(previous.activityAt, getActivityTime(activityAt)),
        contexts: new Set([...previous.contexts, context]),
        messageCount: previous.messageCount + messageCount,
        callCount: previous.callCount + callCount,
        isOnline: previous.isOnline || Boolean(isOnline) || onlineUserIds.has(id),
      });
    };

    chats.forEach((chat) => {
      const other = getOtherParticipant(chat);
      recordContactActivity({
        user: other,
        activityAt: chat.lastMessage?.createdAt || chat.updatedAt,
        context: "chat",
        isOnline: onlineUserIds.has(String(other?._id || "")),
        messageCount: chat.lastMessage ? 1 : 0,
      });
    });

    calls.forEach((call) => {
      recordContactActivity({
        user: call.peer,
        activityAt: getCallActivityAt(call),
        context: "call",
        isOnline: call.isPeerOnline,
        callCount: 1,
      });
    });

    return Array.from(contacts.values())
      .map((contact) => ({
        ...contact,
        inCall: activePeerId && String(contact.user?._id) === activePeerId,
        score: contact.messageCount + contact.callCount + (contact.isOnline ? 2 : 0),
      }))
      .sort((a, b) => b.activityAt - a.activityAt);
  }, [activePeerId, calls, chats, onlineUserIds]);

  const recentContacts = useMemo(() => contactSummaries.slice(0, 4), [contactSummaries]);
  const favoriteUsers = useMemo(
    () => [...contactSummaries].sort((a, b) => b.score - a.score || b.activityAt - a.activityAt).slice(0, 4),
    [contactSummaries]
  );
  const recentConversations = useMemo(
    () => [...chats].sort((a, b) => getActivityTime(b.lastMessage?.createdAt || b.updatedAt) - getActivityTime(a.lastMessage?.createdAt || a.updatedAt)).slice(0, 3),
    [chats]
  );
  const latestCalls = useMemo(() => calls.slice(0, 3), [calls]);
  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => getActivityTime(b.lastMessage?.createdAt || b.updatedAt) - getActivityTime(a.lastMessage?.createdAt || a.updatedAt)),
    [chats]
  );

  const filteredChats = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return sortedChats;
    return sortedChats.filter((chat) => {
      const other = getOtherParticipant(chat);
      const displayName = getDisplayName(other).toLowerCase();
      const lastMessage = String(getMessagePreview(chat.lastMessage, "")).toLowerCase();
      return displayName.includes(query) || lastMessage.includes(query);
    });
  }, [searchTerm, sortedChats]);

  const renderMiniContact = (contact, index) => {
    const name = getDisplayName(contact.user);
    const statusKey = contact.inCall ? "statusInCall" : contact.isOnline ? "statusOnline" : "statusOffline";
    return (
      <div key={contact.user?._id || index} className="mini-contact">
        <ContactAvatar user={contact.user} name={name} online={contact.isOnline} inCall={contact.inCall} size="sm" />
        <div>
          <strong>{name}</strong>
          <span>{t(`chatPremium.${statusKey}`)}</span>
        </div>
      </div>
    );
  };

  const renderConversationCard = (chat) => {
    const other = getOtherParticipant(chat);
    const name = getDisplayName(other);
    const isOnline = onlineUserIds.has(String(other._id));
    const inCall = activePeerId && String(other._id) === activePeerId;
    return (
      <Link key={chat._id} href={`/chats/${chat._id}`} className="mini-row-link">
        <ContactAvatar user={other} name={name} online={isOnline} inCall={inCall} size="sm" />
        <div>
          <strong>{name}</strong>
          <span>{getMessagePreview(chat.lastMessage, t("chatPremium.defaultPreview"))}</span>
        </div>
      </Link>
    );
  };

  const renderCallCard = (call) => {
    const name = getDisplayName(call.peer);
    const isVideo = call.mediaType !== "audio";
    const callAt = getCallActivityAt(call);
    return (
      <Link key={call._id} href="/calls" className="mini-row-link call-mini" data-tone={call.status === "missed" ? "missed" : "default"}>
        <ContactAvatar user={call.peer} name={name} online={call.isPeerOnline} inCall={ACTIVE_CALL_STATUSES.has(call.rawStatus || call.status)} size="sm" />
        <div>
          <strong>{name}</strong>
          <span>{isVideo ? t("callHistory.video") : t("callHistory.voice")} · {t(`callHistory.statuses.${call.status}`)}</span>
        </div>
        {callAt && <time>{formatChatTime(callAt, locale, t("chatPremium.yesterday"))}</time>}
      </Link>
    );
  };

  const activeCallPeer = getCallPeer(activeCall);
  const activeCallName = activeCallPeer ? getDisplayName(activeCallPeer) : t("chatPremium.noActiveCall");
  const activeCallIsVideo = activeCall?.mediaType !== "audio";
  const activeCallCardClassName = ["active-call-card", activeCall ? "live" : ""].filter(Boolean).join(" ");

  return (
    <div className="chats-page">
      <section className="chat-hero">
        <div className="hero-copy">
          <span className="eyebrow">{t("chatPremium.communicationEyebrow")}</span>
          <h1 className="page-title">{t("chatPremium.communicationTitle")}</h1>
          <p className="page-subtitle">{t("chatPremium.communicationSubtitle")}</p>
          <div className="hero-pills" aria-hidden="true">
            <span>{t("chatPremium.premiumUI")}</span>
            <span>{t("chatPremium.realtime")}</span>
            <span>{t("chatPremium.private")}</span>
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
      </section>

      {error && <div className="banner-error">{error}</div>}

      <section className="conversation-priority-head">
        <div>
          <span className="section-kicker">{t("chatPremium.recentConversations")}</span>
          <h2>{t("chatPremium.conversationsFirstTitle")}</h2>
        </div>
        <span>{filteredChats.length} {t("chatPremium.chats")}</span>
      </section>

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
          <div className="empty-orb"><MessageIcon /></div>
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
            const other = getOtherParticipant(chat);
            const displayName = getDisplayName(other);
            const lastMsg = chat.lastMessage;
            const isOnline = onlineUserIds.has(String(other._id));
            const inCall = activePeerId && String(other._id) === activePeerId;
            const lastDate = lastMsg?.createdAt || chat.updatedAt;
            const lastTime = formatChatTime(lastDate, locale, t("chatPremium.yesterday"));

            return (
              <Link key={chat._id} href={`/chats/${chat._id}`} className="chat-row">
                <ContactAvatar user={other} name={displayName} online={isOnline} inCall={inCall} />

                <div className="chat-info">
                  <div className="chat-topline">
                    <div className="chat-name">{displayName}</div>
                    {lastTime && <time className="chat-time" dateTime={getIsoDateTime(lastDate)}>{lastTime}</time>}
                  </div>
                  <div className="chat-preview-row">
                    <span className="chat-preview">{getMessagePreview(lastMsg, t("chatPremium.defaultPreview"))}</span>
                  </div>
                  <div className="chat-meta-row">
                    <span>{inCall ? t("chatPremium.statusInCall") : isOnline ? t("chatPremium.online") : t("chatPremium.privateChat")}</span>
                    <span className="meta-separator" />
                    <span>{lastMsg ? t("chatPremium.lastMessageLabel") : t("chatPremium.newThreadLabel")}</span>
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

      <section className="secondary-hub" aria-label={t("chatPremium.secondaryHubAria")}>
        <div className="secondary-tabs" aria-label={t("chatPremium.secondaryTools")}>
          <Link href="/chats" className="secondary-tab active"><MessageIcon /> {t("chatPremium.recentConversations")}</Link>
          <Link href="/calls" className="secondary-tab"><PhoneIcon /> {t("chatPremium.openCallHistory")}</Link>
          <Link href="/explore" className="secondary-tab"><VideoIcon /> {t("chatPremium.findContacts")}</Link>
        </div>

        <section className="communication-shell" aria-label={t("chatPremium.quickAccessAria")}>
          <Link href={activeCall ? `/call/${activeCall._id}?returnTo=${encodeURIComponent("/chats")}` : "/calls"} className={activeCallCardClassName}>
            <div className="active-call-icon">{activeCallIsVideo ? <VideoIcon /> : <PhoneIcon />}</div>
            <div>
              <span className="card-kicker">{activeCall ? t("chatPremium.activeCall") : t("chatPremium.noActiveCall")}</span>
              <strong>{activeCall ? activeCallName : t("chatPremium.communicationReady")}</strong>
              <p>{activeCall ? t("chatPremium.continueCall") : t("chatPremium.noActiveCallText")}</p>
            </div>
          </Link>
          <div className="quick-actions">
            <Link href="/chats" className="quick-action active"><MessageIcon /> {t("chatPremium.openChats")}</Link>
            <Link href="/calls" className="quick-action"><PhoneIcon /> {t("chatPremium.openCallHistory")}</Link>
            <Link href="/explore" className="quick-action"><VideoIcon /> {t("chatPremium.findContacts")}</Link>
          </div>
        </section>

        <section className="status-legend" aria-label={t("chatPremium.statusLegend")}> 
          {["statusOnline", "statusInCall", "statusTyping", "statusCalling", "statusOffline"].map((key) => (
            <span key={key} data-status={key}>{t(`chatPremium.${key}`)}</span>
          ))}
        </section>

        <section className="premium-board" aria-label={t("chatPremium.premiumCardsAria")}>
          <article className="premium-card">
            <div className="card-head"><span>{t("chatPremium.stats")}</span><strong>{totalChats}</strong></div>
            <div className="stats-grid" aria-label={t("chatPremium.summaryAria")}>
              <div><strong>{totalChats}</strong><span>{t("chatPremium.chats")}</span></div>
              <div><strong>{newMessageSignals}</strong><span>{t("chatPremium.newMessageSignals")}</span></div>
              <div><strong>{missedCalls}</strong><span>{t("chatPremium.missedCallSignals")}</span></div>
              <div><strong>{activeCall ? 1 : 0}</strong><span>{t("chatPremium.activeCalls")}</span></div>
            </div>
          </article>
          <article className="premium-card">
            <div className="card-head"><span>{t("chatPremium.favoriteUsers")}</span><strong>{favoriteUsers.length}</strong></div>
            <div className="mini-stack">{favoriteUsers.length ? favoriteUsers.map(renderMiniContact) : <p className="muted-copy">{t("chatPremium.noFavorites")}</p>}</div>
          </article>
          <article className="premium-card">
            <div className="card-head"><span>{t("chatPremium.latestCalls")}</span><strong>{latestCalls.length}</strong></div>
            <div className="mini-stack">{latestCalls.length ? latestCalls.map(renderCallCard) : <p className="muted-copy">{t("chatPremium.noRecentCalls")}</p>}</div>
          </article>
          <article className="premium-card">
            <div className="card-head"><span>{t("chatPremium.recentContacts")}</span><strong>{recentContacts.length}</strong></div>
            <div className="mini-stack">{recentContacts.length ? recentContacts.map(renderMiniContact) : <p className="muted-copy">{t("chatPremium.noRecentContacts")}</p>}</div>
          </article>
        </section>
      </section>

      <style jsx>{`
        .chats-page { --chat-page-gap: 1rem; display: flex; flex-direction: column; gap: var(--chat-page-gap); position: relative; }
        .chat-hero { position: relative; overflow: hidden; display: flex; justify-content: space-between; gap: 1.25rem; padding: 1.45rem; border: 1px solid rgba(236,124,255,0.34); border-radius: 32px; background: radial-gradient(circle at 12% 16%, rgba(224,64,251,0.34), transparent 34%), radial-gradient(circle at 88% 4%, rgba(34,211,238,0.24), transparent 36%), radial-gradient(circle at 74% 86%, rgba(124,58,237,0.24), transparent 38%), linear-gradient(145deg, rgba(32,18,68,0.92), rgba(15,8,33,0.96)); box-shadow: 0 22px 58px rgba(4,2,12,0.46), inset 0 1px 0 rgba(255,255,255,0.1); }
        .chat-hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 15%, rgba(255,255,255,0.08) 45%, transparent 70%); transform: translateX(-100%); animation: heroShimmer 7s ease-in-out infinite; pointer-events: none; }
        .hero-copy { position: relative; z-index: 1; max-width: 680px; }
        .eyebrow { display: inline-flex; width: fit-content; margin-bottom: 0.55rem; padding: 0.28rem 0.65rem; border-radius: var(--radius-pill); border: 1px solid rgba(34,211,238,0.28); background: rgba(34,211,238,0.08); color: var(--accent-cyan); font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
        .page-title { margin-bottom: 0.25rem; font-size: clamp(2rem, 4vw, 3.3rem); letter-spacing: -0.05em; }
        .page-subtitle { max-width: 620px; margin: 0; color: rgba(237,231,255,0.74); }
        .hero-pills { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 1rem; }
        .hero-pills span { padding: 0.34rem 0.62rem; border-radius: var(--radius-pill); border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.78); font-size: 0.72rem; font-weight: 800; }
        .secondary-hub { display: flex; flex-direction: column; gap: 0.9rem; margin-top: 0.4rem; }
        .secondary-tabs { display: flex; flex-wrap: wrap; gap: 0.55rem; padding: 0.45rem; border: 1px solid rgba(236,124,255,0.16); border-radius: 22px; background: rgba(15,8,32,0.5); }
        .secondary-tab { display: inline-flex; align-items: center; gap: 0.48rem; padding: 0.58rem 0.78rem; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.045); color: var(--text-muted); font-size: 0.78rem; font-weight: 900; transition: all var(--transition); }
        .secondary-tab:hover, .secondary-tab.active { color: #fff; border-color: rgba(34,211,238,0.34); background: rgba(34,211,238,0.09); }
        .communication-shell { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, 0.75fr); gap: 0.9rem; }
        .active-call-card, .premium-card, .quick-actions { border: 1px solid rgba(236,124,255,0.2); border-radius: 28px; background: radial-gradient(circle at 0% 0%, rgba(224,64,251,0.14), transparent 38%), rgba(15,8,32,0.72); box-shadow: 0 16px 38px rgba(4,2,12,0.34), inset 0 1px 0 rgba(255,255,255,0.06); }
        .active-call-card { display: flex; gap: 1rem; align-items: center; padding: 1rem; transition: transform var(--transition-slow), border-color var(--transition), box-shadow var(--transition); }
        .active-call-card:hover { transform: translateY(-2px); border-color: rgba(34,211,238,0.42); box-shadow: 0 22px 48px rgba(4,2,12,0.46), 0 0 28px rgba(124,58,237,0.18); }
        .active-call-card.live { border-color: rgba(52,211,153,0.34); background: radial-gradient(circle at 0% 0%, rgba(52,211,153,0.16), transparent 35%), rgba(15,8,32,0.82); }
        .active-call-icon { width: 54px; height: 54px; flex-shrink: 0; border-radius: 20px; display: flex; align-items: center; justify-content: center; color: var(--accent-cyan); background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.18); }
        .card-kicker { color: var(--accent-cyan); font-size: 0.7rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
        .active-call-card strong { display: block; margin-top: 0.18rem; color: var(--text); font-size: 1.05rem; }
        .active-call-card p { margin: 0.25rem 0 0; color: var(--text-muted); font-size: 0.86rem; }
        .quick-actions { display: grid; gap: 0.55rem; padding: 0.75rem; }
        .quick-action { display: flex; align-items: center; gap: 0.55rem; padding: 0.78rem 0.9rem; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); color: var(--text-muted); background: rgba(255,255,255,0.045); font-weight: 900; transition: all var(--transition); }
        .quick-action:hover, .quick-action.active { color: #fff; border-color: rgba(34,211,238,0.34); background: rgba(34,211,238,0.09); }
        .status-legend { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.72rem; border: 1px solid rgba(236,124,255,0.16); border-radius: 22px; background: rgba(15,8,32,0.5); }
        .status-legend span { display: inline-flex; align-items: center; gap: 0.38rem; padding: 0.35rem 0.62rem; border-radius: var(--radius-pill); color: var(--text-muted); background: rgba(255,255,255,0.055); font-size: 0.72rem; font-weight: 900; }
        .status-legend span::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); }
        .status-legend span[data-status="statusOnline"]::before { background: var(--accent-green); box-shadow: 0 0 12px rgba(52,211,153,0.8); }
        .status-legend span[data-status="statusInCall"]::before { background: var(--accent-cyan); box-shadow: 0 0 12px rgba(34,211,238,0.8); }
        .status-legend span[data-status="statusTyping"]::before { background: #fbbf24; }
        .status-legend span[data-status="statusCalling"]::before { background: var(--accent-2); animation: pulseDot 1.5s ease-out infinite; }
        .premium-board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.9rem; }
        .premium-card { min-width: 0; padding: 0.95rem; }
        .card-head { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.8rem; }
        .card-head span { color: var(--text); font-weight: 950; }
        .card-head strong { color: var(--accent-cyan); padding: 0.18rem 0.48rem; border-radius: var(--radius-pill); background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.16); }
        .mini-stack { display: flex; flex-direction: column; gap: 0.62rem; min-height: 84px; }
        .mini-contact, .mini-row-link { display: flex; align-items: center; gap: 0.68rem; min-width: 0; padding: 0.56rem; border-radius: 18px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.06); }
        .mini-row-link { transition: all var(--transition); }
        .mini-row-link:hover { border-color: rgba(34,211,238,0.28); background: rgba(34,211,238,0.07); }
        .mini-contact div, .mini-row-link div { min-width: 0; flex: 1; }
        .mini-contact strong, .mini-row-link strong { display: block; color: var(--text); font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini-contact span, .mini-row-link span { display: block; color: var(--text-dim); font-size: 0.72rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini-row-link time { flex-shrink: 0; color: var(--text-dim); font-size: 0.68rem; font-weight: 900; }
        .call-mini[data-tone="missed"] { border-color: rgba(248,113,113,0.22); }
        .muted-copy { margin: 0; color: var(--text-muted); font-size: 0.84rem; line-height: 1.4; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
        .stats-grid div { display: flex; flex-direction: column; min-width: 0; padding: 0.68rem; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.045); }
        .stats-grid strong { color: #fff; font-size: 1.1rem; line-height: 1; }
        .stats-grid span { margin-top: 0.24rem; color: var(--text-dim); font-size: 0.68rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
        .chat-toolbar { display: flex; align-items: center; gap: 0.8rem; padding: 0.75rem; border: 1px solid rgba(236,124,255,0.2); border-radius: 24px; background: rgba(15,8,32,0.58); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); backdrop-filter: blur(16px); }
        .search-shell { flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.62rem; height: 48px; padding: 0 0.9rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; color: var(--text-dim); background: linear-gradient(135deg, rgba(255,255,255,0.07), transparent 45%), rgba(7,4,18,0.58); transition: border-color var(--transition), box-shadow var(--transition), background var(--transition); }
        .search-shell:focus-within { border-color: rgba(34,211,238,0.42); box-shadow: 0 0 0 4px rgba(34,211,238,0.08), 0 0 24px rgba(124,58,237,0.14); background: rgba(10,5,26,0.78); }
        .search-shell input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-weight: 700; }
        .search-shell input::placeholder { color: var(--text-dim); }
        .conversation-priority-head { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding: 0 0.2rem; }
        .conversation-priority-head h2 { margin: 0.14rem 0 0; color: var(--text); font-size: clamp(1.25rem, 3vw, 1.8rem); letter-spacing: -0.03em; }
        .conversation-priority-head > span { flex-shrink: 0; color: var(--accent-cyan); font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; }
        .section-kicker { color: var(--text-dim); font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
        .chats-list { display: flex; flex-direction: column; gap: 0.78rem; }
        .chat-row { position: relative; display: flex; align-items: center; gap: 1rem; padding: 1rem; cursor: pointer; overflow: hidden; transition: transform var(--transition-slow), border-color var(--transition), box-shadow var(--transition), background var(--transition); border: 1px solid rgba(236,124,255,0.2); border-radius: 26px; background: radial-gradient(circle at 0% 50%, rgba(224,64,251,0.12), transparent 38%), linear-gradient(135deg, rgba(255,255,255,0.07), transparent 40%), rgba(15,8,32,0.82); box-shadow: 0 14px 34px rgba(4,2,12,0.36), inset 0 1px 0 rgba(255,255,255,0.06); }
        .chat-row::before { content: ""; position: absolute; inset: 0; opacity: 0; background: radial-gradient(circle at 10% 50%, rgba(224,64,251,0.18), transparent 35%); transition: opacity var(--transition); pointer-events: none; }
        .chat-row:hover { border-color: rgba(34,211,238,0.38); background: rgba(22,12,45,0.92); box-shadow: 0 20px 48px rgba(4,2,12,0.5), 0 0 26px rgba(124,58,237,0.2); transform: translateY(-2px); }
        .chat-row:hover::before { opacity: 1; }
        .chat-row:hover .chat-arrow { opacity: 1; color: var(--accent-cyan); transform: translateX(2px); }
        .avatar-ring { position: relative; width: 58px; height: 58px; flex-shrink: 0; border-radius: 50%; padding: 2px; background: linear-gradient(135deg, rgba(224,64,251,0.75), rgba(124,58,237,0.35), rgba(34,211,238,0.55)); box-shadow: 0 0 0 5px rgba(224,64,251,0.055), 0 12px 28px rgba(0,0,0,0.34); }
        .avatar-ring.sm { width: 42px; height: 42px; }
        .avatar-ring[data-online="true"] { box-shadow: 0 0 0 4px rgba(52,211,153,0.08), 0 0 22px rgba(52,211,153,0.16); }
        .avatar-ring[data-call="true"] { background: linear-gradient(135deg, rgba(34,211,238,0.95), rgba(52,211,153,0.6)); box-shadow: 0 0 0 4px rgba(34,211,238,0.08), 0 0 24px rgba(34,211,238,0.24); }
        .chat-avatar { width: 100%; height: 100%; border-radius: 50%; background: var(--grad-primary); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 1.12rem; overflow: hidden; border: 2px solid rgba(15,8,33,0.95); }
        .avatar-ring.sm .chat-avatar { font-size: 0.82rem; }
        .chat-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
        .online-dot, .call-dot { position: absolute; right: 3px; bottom: 4px; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #120a28; }
        .online-dot { background: var(--accent-green); box-shadow: 0 0 12px rgba(52,211,153,0.8); }
        .call-dot { background: var(--accent-cyan); box-shadow: 0 0 12px rgba(34,211,238,0.9); animation: pulseDot 1.5s ease-out infinite; }
        .avatar-ring.sm .online-dot, .avatar-ring.sm .call-dot { width: 11px; height: 11px; right: 0; bottom: 1px; border-width: 2px; }
        .chat-info { position: relative; z-index: 1; flex: 1; min-width: 0; }
        .chat-topline { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .chat-name { font-weight: 900; color: var(--text); font-size: 1.02rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-preview-row { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.24rem; min-width: 0; }
        .chat-preview { color: var(--text-muted); font-size: 0.84rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .chat-meta-row { display: flex; align-items: center; gap: 0.45rem; margin-top: 0.42rem; color: var(--text-dim); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
        .meta-separator { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.18); }
        .chat-time { flex-shrink: 0; color: rgba(255,255,255,0.72); font-size: 0.72rem; font-weight: 900; padding: 0.2rem 0.5rem; border-radius: var(--radius-pill); background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.07); }
        .chat-arrow { position: relative; z-index: 1; color: var(--text-dim); opacity: 0.42; transition: all var(--transition); display: flex; flex-shrink: 0; }
        .banner-error { background: var(--error-bg); border: 1px solid rgba(248,113,113,0.35); color: var(--error); border-radius: var(--radius-sm); padding: 0.75rem 1rem; font-size: 0.875rem; font-weight: 600; }
        .empty-state { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 0.8rem; padding: 4rem 2rem; text-align: center; border: 1px dashed rgba(139,92,246,0.34); border-radius: 28px; background: radial-gradient(circle at 50% 0%, rgba(224,64,251,0.18), transparent 36%), rgba(15,8,32,0.54); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
        .empty-state.compact { padding: 3rem 2rem; }
        .empty-orb { width: 84px; height: 84px; border-radius: 28px; background: linear-gradient(135deg, rgba(224,64,251,0.18), rgba(34,211,238,0.12)); border: 1px solid rgba(236,124,255,0.22); display: flex; align-items: center; justify-content: center; color: var(--accent-2); box-shadow: 0 0 32px rgba(224,64,251,0.18); }
        .empty-kicker { color: var(--accent-cyan); font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
        .empty-state h3 { color: var(--text); font-size: 1.25rem; margin: 0; }
        .empty-state p { color: var(--text-muted); font-size: 0.9rem; margin: 0; max-width: 360px; }
        .empty-action { margin-top: 0.35rem; }
        .skeleton-row { pointer-events: none; min-height: 84px; }
        .skeleton { border-radius: var(--radius-pill); background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%); background-size: 220% 100%; animation: shimmer 1.4s infinite; }
        .skeleton-avatar { width: 58px; height: 58px; flex-shrink: 0; }
        .skeleton-lines { flex: 1; display: flex; flex-direction: column; gap: 0.55rem; }
        .skeleton-line { width: 48%; height: 12px; }
        .skeleton-line.wide { width: 72%; height: 15px; }
        .skeleton-time { width: 44px; height: 12px; flex-shrink: 0; }
        @keyframes shimmer { 0% { background-position: 220% 0; } 100% { background-position: -220% 0; } }
        @keyframes heroShimmer { 0%, 68% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes pulseDot { 0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.42); } 70% { box-shadow: 0 0 0 9px rgba(52,211,153,0); } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); } }
        @media (max-width: 1120px) { .premium-board { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 820px) { .communication-shell { grid-template-columns: 1fr; } }
        @media (max-width: 720px) {
          .chat-hero { flex-direction: column; border-radius: 24px; padding: 1.15rem; }
          .premium-board { grid-template-columns: 1fr; }
          .chat-toolbar { border-radius: 22px; }
          .secondary-tabs { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 0.6rem; }
          .secondary-tab { flex-shrink: 0; }
          .conversation-priority-head { align-items: start; flex-direction: column; gap: 0.35rem; }
          .status-legend { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 0.85rem; }
          .status-legend span { flex-shrink: 0; }
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
