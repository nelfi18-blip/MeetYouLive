"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { clearToken } from "@/lib/token";
import socket, { configureSocketAuth } from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const CATEGORIES = [
  { key: "all", label: "Todo", icon: "✨" },
  { key: "match", label: "Matches", icon: "💞" },
  { key: "message", label: "Mensajes", icon: "💬" },
  { key: "call", label: "Llamadas", icon: "📞" },
  { key: "gift", label: "Regalos", icon: "🎁" },
  { key: "social", label: "Social", icon: "🫶" },
  { key: "live", label: "Live", icon: "🔴" },
  { key: "system", label: "Sistema", icon: "⚙️" },
];

const CATEGORY_BY_TYPE = {
  match: "match",
  new_match: "match",
  match_created: "match",
  chat_message: "message",
  message: "message",
  new_message: "message",
  call_missed: "call",
  missed_call: "call",
  video_call_missed: "call",
  missed_video_call: "call",
  call_rejected: "call",
  video_call_rejected: "call",
  call: "call",
  gift: "gift",
  gift_received: "gift",
  top_fan: "gift",
  top_fan_lost: "gift",
  friend_request: "social",
  follow: "social",
  follower: "social",
  new_follower: "social",
  crush: "social",
  crush_received: "social",
  super_crush: "social",
  live: "live",
  live_started: "live",
  reward: "system",
  daily_reward: "system",
  level_up: "system",
  achievement_unlocked: "system",
  mission_reward: "system",
  system: "system",
};

const PREMIUM_GRADIENTS = {
  match: "linear-gradient(135deg, #ff4fa3, #e040fb)",
  message: "linear-gradient(135deg, #22d3ee, #7c3aed)",
  call: "linear-gradient(135deg, #34d399, #22d3ee)",
  gift: "linear-gradient(135deg, #fbbf24, #fb923c)",
  social: "linear-gradient(135deg, #c040ff, #7c3aed)",
  live: "linear-gradient(135deg, #ef4444, #ff4fa3)",
  system: "linear-gradient(135deg, #94a3b8, #7c3aed)",
};

function getAuthToken(session) {
  if (session?.backendToken) return session.backendToken;
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

function authHeader(token) {
  return ["Bearer", token].join(" ");
}

function getCategory(type) {
  return CATEGORY_BY_TYPE[type] || "system";
}

function getCategoryConfig(category) {
  return CATEGORIES.find((item) => item.key === category) || CATEGORIES[CATEGORIES.length - 1];
}

function getActivityMeta(notif) {
  const type = notif?.type || "system";
  const category = getCategory(type);
  const config = getCategoryConfig(category);
  const data = notif?.data || {};
  let href = "/dashboard";
  let action = "Ver detalle";

  if (category === "match") {
    href = data.chatId ? `/chats/${data.chatId}` : "/matches";
    action = data.chatId ? "Abrir chat" : "Ver matches";
  } else if (category === "message") {
    href = data.chatId ? `/chats/${data.chatId}` : "/chats";
    action = "Abrir mensaje";
  } else if (category === "call") {
    href = data.callId ? `/call/${data.callId}` : "/calls";
    action = "Ver llamadas";
  } else if (category === "gift") {
    href = data.liveId ? `/live/${data.liveId}` : "/gifts";
    action = data.liveId ? "Entrar al live" : "Ver regalos";
  } else if (category === "social") {
    href = data.userId ? `/profile/${data.userId}` : "/crush";
    action = "Ver actividad";
  } else if (category === "live") {
    href = data.liveId ? `/live/${data.liveId}` : "/live";
    action = "Ver live";
  }

  return {
    category,
    label: config.label,
    icon: config.icon,
    gradient: PREMIUM_GRADIENTS[category],
    href,
    action,
  };
}

function formatDateTitle(date) {
  const day = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (day.toDateString() === today.toDateString()) return "Hoy";
  if (day.toDateString() === yesterday.toDateString()) return "Ayer";
  return day.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

function timeAgo(date) {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (diff < 60) return "Ahora";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function getGroups(notifications) {
  const groups = [];
  const groupMap = new Map();

  notifications.forEach((notif) => {
    const createdAt = notif.createdAt || new Date().toISOString();
    const dateKey = new Date(createdAt).toDateString();
    const meta = getActivityMeta(notif);
    if (!groupMap.has(dateKey)) {
      const dateGroup = { key: dateKey, title: formatDateTitle(createdAt), categories: new Map() };
      groupMap.set(dateKey, dateGroup);
      groups.push(dateGroup);
    }
    const dateGroup = groupMap.get(dateKey);
    if (!dateGroup.categories.has(meta.category)) {
      dateGroup.categories.set(meta.category, {
        key: meta.category,
        label: meta.label,
        icon: meta.icon,
        items: [],
      });
    }
    dateGroup.categories.get(meta.category).items.push(notif);
  });

  return groups.map((group) => ({
    ...group,
    categories: Array.from(group.categories.values()),
  }));
}

function ActivityItem({ notif, onRead }) {
  const router = useRouter();
  const meta = getActivityMeta(notif);

  const handleOpen = useCallback(async () => {
    if (!notif.isRead) {
      onRead(notif._id);
    }
    router.push(meta.href);
  }, [meta.href, notif._id, notif.isRead, onRead, router]);

  return (
    <article className={`activity-item${notif.isRead ? "" : " activity-item--unread"}`}>
      <button className="activity-main" onClick={handleOpen}>
        <span className="activity-icon" style={{ background: meta.gradient }}>
          {meta.icon}
        </span>
        <span className="activity-copy">
          <span className="activity-title-row">
            <span className="activity-title">{notif.title || meta.label}</span>
            {!notif.isRead && <span className="activity-unread">Nuevo</span>}
          </span>
          <span className="activity-message">{notif.message || "Nueva actividad premium"}</span>
          <span className="activity-meta">
            <span>{meta.label}</span>
            <span>•</span>
            <span>{timeAgo(notif.createdAt)}</span>
          </span>
        </span>
      </button>
      {!notif.isRead && (
        <button className="read-inline" onClick={() => onRead(notif._id)} aria-label="Marcar como leído">
          Marcar leído
        </button>
      )}
    </article>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    const token = getAuthToken(session);
    if (!token) return;
    const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
      headers: { Authorization: authHeader(token) },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setUnreadCount(data.count || 0);
    }
  }, [session]);

  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    const token = getAuthToken(session);
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    try {
      setError("");
      const res = await fetch(`${API_URL}/api/notifications?page=${pageNum}&limit=30`, {
        headers: { Authorization: authHeader(token) },
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        clearToken();
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("Error al cargar el Centro de Actividad");
      const data = await res.json();
      setNotifications((prev) => (append ? [...prev, ...(data.notifications || [])] : data.notifications || []));
      setHasMore(Boolean(data.hasMore));
      setPage(data.page || pageNum);
      fetchUnreadCount().catch(() => {});
    } catch (err) {
      setError(err.message || "Error al cargar actividad");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fetchUnreadCount, router, session]);

  useEffect(() => {
    fetchNotifications(1, false);
  }, [fetchNotifications]);

  useEffect(() => {
    const token = getAuthToken(session);
    if (!token) return;

    configureSocketAuth(token);
    if (!socket.connected) socket.connect();

    const handleNewNotification = (notif) => {
      if (!notif?._id) return;
      setNotifications((prev) => {
        if (prev.some((item) => item._id === notif._id)) return prev;
        return [{ ...notif, isRead: false }, ...prev];
      });
      setUnreadCount((count) => count + 1);
    };

    socket.on("NEW_NOTIFICATION", handleNewNotification);
    return () => {
      socket.off("NEW_NOTIFICATION", handleNewNotification);
    };
  }, [session]);

  const categoryStats = useMemo(() => {
    const stats = CATEGORIES.reduce((acc, category) => {
      acc[category.key] = { total: 0, unread: 0 };
      return acc;
    }, {});

    notifications.forEach((notif) => {
      const category = getCategory(notif.type);
      stats.all.total += 1;
      stats[category].total += 1;
      if (!notif.isRead) {
        stats.all.unread += 1;
        stats[category].unread += 1;
      }
    });
    return stats;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeCategory === "all") return notifications;
    return notifications.filter((notif) => getCategory(notif.type) === activeCategory);
  }, [activeCategory, notifications]);

  const groupedNotifications = useMemo(() => getGroups(filteredNotifications), [filteredNotifications]);

  const markNotificationRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((notif) => (notif._id === id ? { ...notif, isRead: true } : notif)));
    setUnreadCount((count) => Math.max(0, count - 1));

    const token = getAuthToken(session);
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: authHeader(token) },
      });
      if (!res.ok) throw new Error("No se pudo marcar como leído");
    } catch {
      fetchNotifications(1, false);
    }
  }, [fetchNotifications, session]);

  const markAllRead = useCallback(async () => {
    const token = getAuthToken(session);
    if (!token || markingAll) return;
    setMarkingAll(true);

    try {
      const res = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: "PATCH",
        headers: { Authorization: authHeader(token) },
      });
      if (!res.ok) throw new Error("No se pudo actualizar");
      setNotifications((prev) => prev.map((notif) => ({ ...notif, isRead: true })));
      setUnreadCount(0);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("notif:read-all"));
      }
    } catch (err) {
      setError(err.message || "No se pudieron marcar todas como leídas");
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, session]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchNotifications(page + 1, true);
  };

  return (
    <main className="activity-page">
      <section className="activity-hero">
        <div className="hero-copy">
          <Link href="/dashboard" className="back-link">← Volver</Link>
          <p className="eyebrow">Premium Activity Center</p>
          <h1>Centro de Actividad</h1>
          <p className="hero-text">
            Todas tus notificaciones, matches, mensajes, llamadas y avisos importantes en un solo lugar.
          </p>
        </div>
        <div className="hero-card" aria-label={`${unreadCount} notificaciones sin leer`}>
          <span className="hero-card-icon">🔔</span>
          <span className="hero-card-count">{unreadCount > 99 ? "99+" : unreadCount}</span>
          <span className="hero-card-label">sin leer</span>
        </div>
      </section>

      <section className="activity-toolbar">
        <div className="category-scroller" aria-label="Categorías de actividad">
          {CATEGORIES.map((category) => {
            const stats = categoryStats[category.key] || { total: 0, unread: 0 };
            return (
              <button
                key={category.key}
                className={`category-pill${activeCategory === category.key ? " active" : ""}`}
                onClick={() => setActiveCategory(category.key)}
              >
                <span>{category.icon}</span>
                <span>{category.label}</span>
                {stats.total > 0 && <strong>{stats.total}</strong>}
                {stats.unread > 0 && <i />}
              </button>
            );
          })}
        </div>
        <button className="mark-all" onClick={markAllRead} disabled={markingAll || unreadCount === 0}>
          {markingAll ? "Actualizando…" : "Marcar todas como leídas"}
        </button>
      </section>

      {loading && (
        <section className="activity-state">
          <span className="spinner" />
          <p>Cargando actividad premium…</p>
        </section>
      )}

      {!loading && error && (
        <section className="activity-state activity-state--error">
          <span>⚠️</span>
          <h2>Error al cargar</h2>
          <p>{error}</p>
          <button onClick={() => fetchNotifications(1, false)}>Reintentar</button>
        </section>
      )}

      {!loading && !error && filteredNotifications.length === 0 && (
        <section className="activity-empty">
          <span>🌙</span>
          <h2>Sin actividad por ahora</h2>
          <p>
            Aquí aparecerán nuevos matches, mensajes, llamadas perdidas, regalos, seguidores y avisos del sistema.
          </p>
        </section>
      )}

      {!loading && !error && groupedNotifications.length > 0 && (
        <section className="activity-timeline">
          {groupedNotifications.map((dateGroup) => (
            <div className="date-group" key={dateGroup.key}>
              <div className="date-heading">
                <span>{dateGroup.title}</span>
              </div>
              {dateGroup.categories.map((categoryGroup) => (
                <div className="category-group" key={`${dateGroup.key}-${categoryGroup.key}`}>
                  <div className="category-heading">
                    <span>{categoryGroup.icon}</span>
                    <strong>{categoryGroup.label}</strong>
                    <em>{categoryGroup.items.length}</em>
                  </div>
                  <div className="activity-list">
                    {categoryGroup.items.map((notif) => (
                      <ActivityItem key={notif._id} notif={notif} onRead={markNotificationRead} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {hasMore && (
            <button className="load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Cargando…" : "Ver más actividad"}
            </button>
          )}
        </section>
      )}

      <section className="future-panel">
        <span>Preparado para próximas fases</span>
        <p>Push notifications, Firebase, emails, SMS, cobros y coins quedan fuera de este sprint.</p>
      </section>

      <style jsx>{`
        .activity-page {
          max-width: 1040px;
          margin: 0 auto;
          padding: 0 1rem 6rem;
        }

        .activity-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 190px;
          gap: 1rem;
          align-items: stretch;
          padding: 1.5rem;
          border: 1px solid rgba(236,124,255,0.28);
          border-radius: 28px;
          background:
            radial-gradient(circle at 18% 0%, rgba(224,64,251,0.28), transparent 34%),
            radial-gradient(circle at 88% 18%, rgba(34,211,238,0.18), transparent 35%),
            linear-gradient(150deg, rgba(32,18,68,0.92), rgba(15,8,33,0.96));
          box-shadow: 0 24px 70px rgba(4,2,12,0.58);
          overflow: hidden;
          position: relative;
        }

        .activity-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.08) 48%, transparent 100%);
          transform: translateX(-100%);
          animation: shimmer 5s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes shimmer {
          0%, 55% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .hero-copy {
          position: relative;
          z-index: 1;
        }

        .back-link {
          display: inline-flex;
          color: var(--text-muted);
          font-size: 0.86rem;
          margin-bottom: 1rem;
        }

        .eyebrow {
          margin: 0 0 0.35rem;
          color: var(--accent-cyan);
          text-transform: uppercase;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.16em;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 7vw, 4rem);
          letter-spacing: -0.07em;
        }

        .hero-text {
          max-width: 610px;
          margin: 0.7rem 0 0;
          font-size: 1rem;
          line-height: 1.6;
        }

        .hero-card {
          position: relative;
          z-index: 1;
          min-height: 170px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
        }

        .hero-card-icon {
          font-size: 2.2rem;
          filter: drop-shadow(0 0 16px rgba(224,64,251,0.65));
        }

        .hero-card-count {
          font-size: 3rem;
          font-weight: 900;
          line-height: 1;
        }

        .hero-card-label {
          color: var(--text-muted);
          font-size: 0.83rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 700;
        }

        .activity-toolbar {
          position: sticky;
          top: 64px;
          z-index: 20;
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin: 1rem 0;
          padding: 0.75rem;
          border: 1px solid rgba(148,163,184,0.2);
          border-radius: 22px;
          background: rgba(15,8,33,0.84);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .category-scroller {
          display: flex;
          gap: 0.55rem;
          overflow-x: auto;
          scrollbar-width: none;
          flex: 1;
          padding-bottom: 1px;
        }

        .category-scroller::-webkit-scrollbar {
          display: none;
        }

        .category-pill,
        .mark-all,
        .load-more,
        .read-inline,
        .activity-state button {
          border: 0;
          font-family: inherit;
          cursor: pointer;
        }

        .category-pill {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          flex-shrink: 0;
          border-radius: 999px;
          padding: 0.64rem 0.82rem;
          color: var(--text-muted);
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease;
        }

        .category-pill:hover,
        .category-pill.active {
          color: #fff;
          background: rgba(224,64,251,0.18);
          transform: translateY(-1px);
        }

        .category-pill strong {
          min-width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          color: #fff;
          font-size: 0.72rem;
        }

        .category-pill i {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #22d3ee;
          box-shadow: 0 0 10px #22d3ee;
        }

        .mark-all {
          flex-shrink: 0;
          border-radius: 999px;
          padding: 0.7rem 1rem;
          color: #fff;
          font-weight: 800;
          background: var(--grad-primary);
          box-shadow: 0 0 24px rgba(224,64,251,0.22);
        }

        .mark-all:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }

        .activity-timeline {
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }

        .date-heading {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          color: var(--text);
          font-weight: 900;
          margin: 1.2rem 0 0.75rem;
        }

        .date-heading::after {
          content: "";
          height: 1px;
          flex: 1;
          background: linear-gradient(90deg, rgba(236,124,255,0.35), transparent);
        }

        .category-group {
          margin-bottom: 0.9rem;
        }

        .category-heading {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          margin: 0 0 0.55rem;
          padding: 0.42rem 0.72rem;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          font-size: 0.82rem;
        }

        .category-heading em {
          font-style: normal;
          color: var(--accent-cyan);
          font-weight: 800;
        }

        .activity-list {
          display: grid;
          gap: 0.7rem;
        }

        .activity-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.75rem;
          align-items: center;
          border-radius: 22px;
          border: 1px solid rgba(148,163,184,0.18);
          background: linear-gradient(145deg, rgba(24,14,52,0.84), rgba(15,8,33,0.94));
          box-shadow: 0 16px 42px rgba(4,2,12,0.38);
          overflow: hidden;
          animation: item-enter 0.32s ease both;
        }

        @keyframes item-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .activity-item--unread {
          border-color: rgba(34,211,238,0.5);
          box-shadow: 0 18px 52px rgba(34,211,238,0.08), 0 16px 42px rgba(4,2,12,0.38);
        }

        .activity-main {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 0.9rem;
          padding: 0.95rem;
          background: transparent;
          color: inherit;
          text-align: left;
        }

        .activity-icon {
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          font-size: 1.35rem;
          box-shadow: 0 12px 30px rgba(0,0,0,0.25);
        }

        .activity-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.22rem;
        }

        .activity-title-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          min-width: 0;
        }

        .activity-title {
          color: var(--text);
          font-size: 0.94rem;
          font-weight: 850;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .activity-unread {
          flex-shrink: 0;
          border-radius: 999px;
          padding: 0.16rem 0.44rem;
          color: #001018;
          background: #22d3ee;
          font-size: 0.64rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .activity-message {
          color: var(--text-muted);
          line-height: 1.45;
          font-size: 0.86rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .activity-meta {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--text-dim);
          font-size: 0.74rem;
        }

        .read-inline {
          margin-right: 0.9rem;
          border-radius: 999px;
          padding: 0.5rem 0.7rem;
          color: var(--accent-cyan);
          background: rgba(34,211,238,0.09);
          font-size: 0.75rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .load-more {
          align-self: center;
          min-width: 220px;
          border-radius: 999px;
          padding: 0.82rem 1.1rem;
          color: var(--text);
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
        }

        .activity-state,
        .activity-empty,
        .future-panel {
          border: 1px solid rgba(148,163,184,0.18);
          border-radius: 24px;
          background: rgba(255,255,255,0.05);
          padding: 2.5rem 1rem;
          text-align: center;
        }

        .activity-state,
        .activity-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.7rem;
        }

        .activity-empty span,
        .activity-state span:not(.spinner) {
          font-size: 2.4rem;
          filter: drop-shadow(0 0 16px rgba(224,64,251,0.4));
        }

        .activity-empty h2,
        .activity-state h2 {
          margin: 0;
        }

        .activity-empty p,
        .activity-state p {
          margin: 0;
          max-width: 420px;
        }

        .activity-state button {
          border-radius: 999px;
          padding: 0.7rem 1rem;
          color: #fff;
          background: var(--grad-primary);
        }

        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(224,64,251,0.22);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .future-panel {
          margin-top: 1rem;
          padding: 1rem;
        }

        .future-panel span {
          display: block;
          color: var(--accent-cyan);
          font-weight: 900;
          margin-bottom: 0.25rem;
        }

        .future-panel p {
          margin: 0;
          font-size: 0.84rem;
        }

        @media (max-width: 760px) {
          .activity-page {
            padding-inline: 0.75rem;
          }

          .activity-hero {
            grid-template-columns: 1fr;
            padding: 1.1rem;
            border-radius: 24px;
          }

          .hero-card {
            min-height: 120px;
          }

          .activity-toolbar {
            top: 0;
            flex-direction: column;
            align-items: stretch;
          }

          .mark-all {
            width: 100%;
          }

          .activity-item {
            grid-template-columns: 1fr;
            gap: 0;
          }

          .activity-main {
            padding: 0.85rem;
            align-items: flex-start;
          }

          .activity-icon {
            width: 42px;
            height: 42px;
          }

          .activity-message {
            white-space: normal;
          }

          .read-inline {
            width: calc(100% - 1.7rem);
            margin: 0 0.85rem 0.85rem;
          }
        }
      `}</style>
    </main>
  );
}
