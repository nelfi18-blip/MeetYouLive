"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import socket, { configureSocketAuth } from "@/lib/socket";
import { getDisplayName, getUserImage } from "@/lib/imageHelpers";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const FILTERS = ["all", "incoming", "outgoing", "missed"];
const REFRESH_EVENTS = ["CALL_INCOMING", "CALL_ACCEPTED", "CALL_REJECTED", "CALL_ENDED", "CALL_MISSED"];
// Coalesces bursts of call socket events while keeping the history feeling live.
const REFRESH_DEBOUNCE_MS = 700;

const formatDate = (value, locale) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
};

const formatTime = (value, locale) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
};

const formatDuration = (seconds, t) => {
  const total = Math.max(0, Number(seconds) || 0);
  if (total <= 0) return t("callHistory.noDuration");
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
};

const getCallTone = (call) => {
  if (call.status === "missed") return "missed";
  if (call.status === "rejected" || call.status === "cancelled") return "ended";
  return call.direction === "outgoing" ? "outgoing" : "incoming";
};

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

export default function CallHistoryPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { t } = useLanguage();
  const locale = t("chatPremium.locale");
  const [calls, setCalls] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeActionId, setActiveActionId] = useState("");
  const refreshTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  const getBackendToken = useCallback(
    () =>
      session?.backendToken ||
      (typeof window !== "undefined" ? localStorage.getItem("token") : null),
    [session?.backendToken]
  );

  const fetchHistory = useCallback(({ silent = false } = {}) => {
    const token = getBackendToken();
    if (!token) {
      if (sessionStatus === "loading") return;
      clearToken();
      router.replace("/login");
      return;
    }

    if (!silent) setLoading(true);
    setError("");
    fetch(`${API_URL}/api/calls/history`, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    })
      .then((res) => {
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        if (!res.ok) throw new Error("history_failed");
        return res.json();
      })
      .then((data) => {
        if (!isMountedRef.current) return;
        if (data !== null) setCalls(Array.isArray(data?.calls) ? data.calls : []);
      })
      .catch(() => {
        if (isMountedRef.current) setError(t("callHistory.loadError"));
      })
      .finally(() => {
        if (isMountedRef.current) setLoading(false);
      });
  }, [getBackendToken, router, sessionStatus, t]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const token = getBackendToken();
    if (!token) return undefined;
    configureSocketAuth(token);
    if (!socket.connected) socket.connect();

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        fetchHistory({ silent: true });
      }, REFRESH_DEBOUNCE_MS);
    };

    const markOnline = ({ userId }) => {
      if (!userId) return;
      setCalls((prev) =>
        prev.map((call) =>
          String(call.peer?._id) === String(userId) ? { ...call, isPeerOnline: true } : call
        )
      );
    };
    const markOffline = ({ userId }) => {
      if (!userId) return;
      setCalls((prev) =>
        prev.map((call) =>
          String(call.peer?._id) === String(userId) ? { ...call, isPeerOnline: false } : call
        )
      );
    };

    REFRESH_EVENTS.forEach((event) => socket.on(event, scheduleRefresh));
    socket.on("USER_ONLINE", markOnline);
    socket.on("USER_OFFLINE", markOffline);
    return () => {
      REFRESH_EVENTS.forEach((event) => socket.off(event, scheduleRefresh));
      socket.off("USER_ONLINE", markOnline);
      socket.off("USER_OFFLINE", markOffline);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [fetchHistory, getBackendToken]);

  const filteredCalls = useMemo(() => {
    if (filter === "all") return calls;
    if (filter === "missed") return calls.filter((call) => call.status === "missed");
    return calls.filter((call) => call.direction === filter);
  }, [calls, filter]);

  const stats = useMemo(
    () => ({
      total: calls.length,
      incoming: calls.filter((call) => call.direction === "incoming").length,
      outgoing: calls.filter((call) => call.direction === "outgoing").length,
      missed: calls.filter((call) => call.status === "missed").length,
    }),
    [calls]
  );

  const handleMessage = async (peerId) => {
    const token = getBackendToken();
    if (!token || !peerId || activeActionId) return;
    setError("");
    try {
      setActiveActionId(`message:${peerId}`);
      const res = await fetch(`${API_URL}/api/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ recipientId: peerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("callHistory.messageError"));
      router.push(`/chats/${data._id}`);
    } catch (err) {
      setError(err.message || t("callHistory.messageError"));
    } finally {
      setActiveActionId("");
    }
  };

  const handleCallBack = async (call) => {
    const token = getBackendToken();
    const peerId = call?.peer?._id;
    if (!token || !peerId || activeActionId) return;
    setError("");
    try {
      setActiveActionId(`call:${call._id}`);
      const res = await fetch(`${API_URL}/api/calls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          recipientId: peerId,
          type: call.type || "social",
          mediaType: call.mediaType || "video",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("callHistory.callError"));
      router.push(`/call/${data._id}?returnTo=${encodeURIComponent("/calls")}`);
    } catch (err) {
      setError(err.message || t("callHistory.callError"));
    } finally {
      setActiveActionId("");
    }
  };

  return (
    <div className="call-history-page">
      <section className="call-history-hero">
        <div className="hero-copy">
          <span className="eyebrow">{t("callHistory.eyebrow")}</span>
          <h1 className="page-title">{t("callHistory.title")}</h1>
          <p className="page-subtitle">{t("callHistory.subtitle")}</p>
          <div className="hero-pills" aria-hidden="true">
            <span>{t("callHistory.voice")}</span>
            <span>{t("callHistory.video")}</span>
            <span>{t("callHistory.realtime")}</span>
          </div>
        </div>
        <div className="hero-stats" aria-label={t("callHistory.summaryAria")}>
          <div><strong>{stats.total}</strong><span>{t("callHistory.total")}</span></div>
          <div><strong>{stats.missed}</strong><span>{t("callHistory.missed")}</span></div>
        </div>
      </section>

      <section className="call-history-tabs" aria-label={t("callHistory.filtersAria")}>
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? "active" : ""}
            onClick={() => setFilter(item)}
          >
            {t(`callHistory.filters.${item}`)}
            <span>{stats[item] ?? stats.total}</span>
          </button>
        ))}
      </section>

      {error && <div className="banner-error">{error}</div>}

      {loading && (
        <div className="call-list" aria-label={t("callHistory.loading")}>
          {[...Array(5)].map((_, index) => (
            <div key={index} className="call-row skeleton-row">
              <div className="skeleton skeleton-avatar" />
              <div className="skeleton-lines">
                <div className="skeleton skeleton-line wide" />
                <div className="skeleton skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredCalls.length === 0 && (
        <div className="empty-state">
          <div className="empty-orb"><PhoneIcon /></div>
          <span className="empty-kicker">{t("callHistory.emptyKicker")}</span>
          <h3>{t("callHistory.emptyTitle")}</h3>
          <p>{t("callHistory.emptyText")}</p>
          <Link href="/chats" className="btn btn-primary empty-action">
            {t("callHistory.openChats")}
          </Link>
        </div>
      )}

      {!loading && filteredCalls.length > 0 && (
        <div className="call-list">
          {filteredCalls.map((call) => {
            const peer = call.peer || {};
            const displayName = getDisplayName(peer);
            const userImage = getUserImage(peer);
            const initial = typeof displayName === "string" && displayName ? displayName[0].toUpperCase() : "?";
            const tone = getCallTone(call);
            const isVideo = call.mediaType !== "audio";
            const callAt = call.startedAt || call.createdAt;
            return (
              <article key={call._id} className="call-row" data-tone={tone}>
                <div className="avatar-ring" data-online={call.isPeerOnline}>
                  <div className="call-avatar">
                    {userImage ? <img src={userImage} alt={displayName} className="call-avatar-img" /> : initial}
                  </div>
                  {call.isPeerOnline && <span className="online-dot" aria-label={t("chatPremium.online")} />}
                </div>

                <div className="call-info">
                  <div className="call-topline">
                    <div className="call-name">{displayName}</div>
                    <time className="call-time" dateTime={new Date(callAt).toISOString()}>
                      {formatDate(callAt, locale)} · {formatTime(callAt, locale)}
                    </time>
                  </div>
                  <div className="call-meta-row">
                    <span className="call-chip">{t(`callHistory.directions.${call.direction}`)}</span>
                    <span className="call-chip">{isVideo ? <VideoIcon /> : <PhoneIcon />}{isVideo ? t("callHistory.video") : t("callHistory.voice")}</span>
                    <span className="call-chip status">{t(`callHistory.statuses.${call.status}`)}</span>
                    <span className="call-chip">{formatDuration(call.durationSeconds, t)}</span>
                  </div>
                  <div className="call-presence">
                    <span className={call.isPeerOnline ? "presence-online" : ""}>
                      {call.isPeerOnline ? t("chatPremium.onlineNow") : t("callHistory.offline")}
                    </span>
                  </div>
                </div>

                <div className="call-actions">
                  <button
                    type="button"
                    className="call-action primary"
                    onClick={() => handleCallBack(call)}
                    disabled={Boolean(activeActionId)}
                  >
                    {t("callHistory.callBack")}
                  </button>
                  <button
                    type="button"
                    className="call-action"
                    onClick={() => handleMessage(peer._id)}
                    disabled={Boolean(activeActionId)}
                  >
                    {t("callHistory.sendMessage")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .call-history-page { display: flex; flex-direction: column; gap: 1rem; position: relative; }
        .call-history-hero {
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
            linear-gradient(145deg, rgba(32,18,68,0.92), rgba(15,8,33,0.96));
          box-shadow: 0 22px 58px rgba(4,2,12,0.46), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .call-history-hero::after {
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
        .page-title { margin-bottom: 0.25rem; font-size: clamp(2rem, 4vw, 3.3rem); letter-spacing: -0.05em; }
        .page-subtitle { max-width: 620px; margin: 0; color: rgba(237,231,255,0.74); }
        .hero-pills { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 1rem; }
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
        .call-history-tabs {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.65rem;
          padding: 0.72rem;
          border: 1px solid rgba(236,124,255,0.2);
          border-radius: 24px;
          background: rgba(15,8,32,0.58);
          backdrop-filter: blur(16px);
        }
        .call-history-tabs button {
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 18px;
          padding: 0.75rem 0.85rem;
          color: var(--text-muted);
          background: rgba(255,255,255,0.045);
          font-weight: 900;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          transition: all var(--transition);
        }
        .call-history-tabs button span {
          min-width: 1.45rem;
          padding: 0.12rem 0.35rem;
          border-radius: var(--radius-pill);
          color: var(--accent-cyan);
          background: rgba(34,211,238,0.08);
          font-size: 0.72rem;
        }
        .call-history-tabs button.active,
        .call-history-tabs button:hover {
          color: #fff;
          border-color: rgba(34,211,238,0.38);
          background: rgba(34,211,238,0.1);
          box-shadow: 0 0 24px rgba(124,58,237,0.14);
        }
        .call-list { display: flex; flex-direction: column; gap: 0.78rem; }
        .call-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
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
        .call-row:hover {
          border-color: rgba(34,211,238,0.38);
          background: rgba(22,12,45,0.92);
          box-shadow: 0 20px 48px rgba(4,2,12,0.5), 0 0 26px rgba(124,58,237,0.2);
          transform: translateY(-2px);
        }
        .call-row[data-tone="missed"] { border-color: rgba(248,113,113,0.28); }
        .call-row[data-tone="outgoing"] { border-color: rgba(34,211,238,0.24); }
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
        .call-avatar {
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
        .call-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
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
        .call-info { flex: 1; min-width: 0; }
        .call-topline { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .call-name { font-weight: 900; color: var(--text); font-size: 1.02rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .call-time {
          flex-shrink: 0;
          color: rgba(255,255,255,0.72);
          font-size: 0.72rem;
          font-weight: 900;
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-pill);
          background: rgba(255,255,255,0.055);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .call-meta-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.45rem; }
        .call-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.32rem;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 850;
          padding: 0.22rem 0.5rem;
          border-radius: var(--radius-pill);
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.045);
        }
        .call-chip.status { color: var(--accent-cyan); background: rgba(34,211,238,0.08); border-color: rgba(34,211,238,0.16); }
        .call-presence { margin-top: 0.42rem; color: var(--text-dim); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
        .presence-online { color: var(--accent-green); }
        .call-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
        .call-action {
          border: 1px solid rgba(255,255,255,0.11);
          border-radius: 16px;
          padding: 0.68rem 0.82rem;
          color: rgba(255,255,255,0.86);
          background: rgba(255,255,255,0.06);
          font-weight: 900;
          cursor: pointer;
          transition: all var(--transition);
        }
        .call-action.primary {
          color: #fff;
          border-color: rgba(34,211,238,0.28);
          background: linear-gradient(135deg, rgba(34,211,238,0.22), rgba(124,58,237,0.28));
        }
        .call-action:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(34,211,238,0.42); }
        .call-action:disabled { opacity: 0.55; cursor: wait; }
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
          border-radius: 30px;
          background: rgba(15,8,32,0.5);
        }
        .empty-orb {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: var(--accent-cyan);
          background: rgba(34,211,238,0.09);
          border: 1px solid rgba(34,211,238,0.18);
          box-shadow: 0 0 42px rgba(34,211,238,0.12);
        }
        .empty-kicker { color: var(--accent-cyan); font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.72rem; }
        .empty-state h3 { margin: 0; font-size: 1.35rem; }
        .empty-state p { margin: 0; color: var(--text-muted); max-width: 420px; }
        .empty-action { margin-top: 0.3rem; }
        .skeleton-row { min-height: 90px; }
        .skeleton {
          position: relative;
          overflow: hidden;
          background: rgba(255,255,255,0.08);
        }
        .skeleton::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.11), transparent);
          animation: shimmer 1.5s infinite;
        }
        .skeleton-avatar { width: 58px; height: 58px; border-radius: 50%; flex-shrink: 0; }
        .skeleton-lines { flex: 1; display: flex; flex-direction: column; gap: 0.7rem; }
        .skeleton-line { height: 14px; width: 48%; border-radius: 999px; }
        .skeleton-line.wide { width: 72%; }
        @keyframes shimmer { to { transform: translateX(100%); } }
        @keyframes heroShimmer {
          0%, 42% { transform: translateX(-100%); }
          58%, 100% { transform: translateX(100%); }
        }
        @media (max-width: 760px) {
          .call-history-hero { flex-direction: column; }
          .hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .call-history-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .call-row { align-items: flex-start; flex-wrap: wrap; }
          .call-topline { align-items: flex-start; flex-direction: column; gap: 0.35rem; }
          .call-actions { width: 100%; }
          .call-action { flex: 1; }
        }
      `}</style>
    </div>
  );
}
