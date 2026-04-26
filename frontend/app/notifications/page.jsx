"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// ── Time-ago helper ──────────────────────────────────────────────────────────

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "Ahora mismo";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// ── Navigation resolver ──────────────────────────────────────────────────────

function getNotifHref(notif) {
  const { type, data } = notif;
  if (type === "live" && data?.liveId) return `/live/${data.liveId}`;
  if (type === "top_fan" && data?.liveId) return `/live/${data.liveId}`;
  if (type === "top_fan_lost" && data?.liveId) return `/live/${data.liveId}`;
  if (type === "gift" && data?.liveId) return `/live/${data.liveId}`;
  if (type === "gift") return "/chats";
  return "/dashboard";
}

// ── Token helper ─────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

// ── Notification item ────────────────────────────────────────────────────────

function NotifItem({ notif, onRead }) {
  const router = useRouter();
  const href = getNotifHref(notif);

  const handleClick = useCallback(async () => {
    if (!notif.isRead) {
      onRead(notif._id);
      const token = getToken();
      if (token) {
        fetch(`${API_URL}/api/notifications/${notif._id}/read`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    }
    router.push(href);
  }, [notif, href, onRead, router]);

  return (
    <button className={`notif-item${notif.isRead ? "" : " notif-item--unread"}`} onClick={handleClick}>
      <div className="notif-dot-wrap">
        {!notif.isRead && <span className="notif-dot" />}
      </div>
      <div className="notif-body">
        <div className="notif-title">{notif.title}</div>
        <div className="notif-message">{notif.message}</div>
        <div className="notif-time">{timeAgo(notif.createdAt)}</div>
      </div>
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const didMarkRead = useRef(false);

  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    const token = getToken();
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/notifications?page=${pageNum}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearToken();
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("Error al cargar notificaciones");
      const data = await res.json();
      setNotifications((prev) => append ? [...prev, ...data.notifications] : data.notifications);
      setHasMore(data.hasMore);
      setPage(data.page);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [router]);

  // Load first page on mount and mark all read
  useEffect(() => {
    fetchNotifications(1, false);
  }, [fetchNotifications]);

  useEffect(() => {
    if (didMarkRead.current) return;
    const token = getToken();
    if (!token) return;
    didMarkRead.current = true;
    fetch(`${API_URL}/api/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    // Tell the Navbar bell to reset to zero
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notif:read-all"));
    }
  }, []);

  const handleRead = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => n._id === id ? { ...n, isRead: true } : n));
  }, []);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchNotifications(page + 1, true);
  };

  return (
    <div className="notifs-page">
      <div className="notifs-header">
        <div className="notifs-header-left">
          <Link href="/dashboard" className="notifs-back" aria-label="Volver">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div>
            <h1 className="notifs-title">Notificaciones</h1>
            {notifications.length > 0 && (
              <p className="notifs-sub">{notifications.filter((n) => !n.isRead).length} sin leer</p>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="notifs-loading">
          <span className="notifs-spinner" />
        </div>
      )}

      {!loading && error && (
        <div className="notifs-empty">
          <span className="notifs-empty-icon">⚠️</span>
          <p className="notifs-empty-title">Error al cargar</p>
          <p className="notifs-empty-text">{error}</p>
        </div>
      )}

      {!loading && !error && notifications.length === 0 && (
        <div className="notifs-empty">
          <span className="notifs-empty-icon">🔔</span>
          <p className="notifs-empty-title">Sin notificaciones</p>
          <p className="notifs-empty-text">Cuando recibas regalos o alguien empiece un live, te avisaremos aquí.</p>
        </div>
      )}

      {!loading && !error && notifications.length > 0 && (
        <div className="notifs-list">
          {notifications.map((notif) => (
            <NotifItem key={notif._id} notif={notif} onRead={handleRead} />
          ))}
          {hasMore && (
            <button className="notifs-load-more" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? "Cargando…" : "Ver más"}
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .notifs-page {
          max-width: 640px;
          margin: 0 auto;
          padding: 0 1rem 5rem;
        }

        .notifs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 0 1rem;
          position: sticky;
          top: 64px;
          z-index: 10;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          margin-bottom: 0.75rem;
        }

        .notifs-header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .notifs-back {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          transition: color var(--transition), background var(--transition);
          flex-shrink: 0;
        }

        .notifs-back:hover {
          color: var(--text);
          background: rgba(255,255,255,0.1);
        }

        .notifs-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--text);
          margin: 0;
        }

        .notifs-sub {
          font-size: 0.78rem;
          color: var(--accent);
          margin: 0.15rem 0 0;
        }

        /* ── Loading / empty states ── */
        .notifs-loading {
          display: flex;
          justify-content: center;
          padding: 3rem 0;
        }

        .notifs-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(224,64,251,0.25);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .notifs-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 4rem 1rem;
          text-align: center;
        }

        .notifs-empty-icon {
          font-size: 2.5rem;
          line-height: 1;
          filter: drop-shadow(0 0 12px rgba(224,64,251,0.4));
        }

        .notifs-empty-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text);
        }

        .notifs-empty-text {
          font-size: 0.88rem;
          color: var(--text-muted);
          max-width: 280px;
        }

        /* ── List ── */
        .notifs-list {
          display: flex;
          flex-direction: column;
        }

        /* ── Item ── */
        .notif-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          width: 100%;
          padding: 1rem 0.75rem;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          cursor: pointer;
          text-align: left;
          transition: background var(--transition);
        }

        .notif-item:hover {
          background: rgba(255,255,255,0.04);
        }

        .notif-item--unread {
          background: rgba(224,64,251,0.05);
          border-left: 3px solid var(--accent);
          padding-left: calc(0.75rem - 3px);
        }

        .notif-item--unread:hover {
          background: rgba(224,64,251,0.09);
        }

        .notif-dot-wrap {
          width: 10px;
          flex-shrink: 0;
          padding-top: 0.35rem;
          display: flex;
          justify-content: center;
        }

        .notif-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          flex-shrink: 0;
        }

        .notif-body {
          flex: 1;
          min-width: 0;
        }

        .notif-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 0.2rem;
          line-height: 1.3;
        }

        .notif-message {
          font-size: 0.83rem;
          color: var(--text-muted);
          line-height: 1.4;
          margin-bottom: 0.35rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .notif-time {
          font-size: 0.75rem;
          color: var(--text-dim);
        }

        /* ── Load more ── */
        .notifs-load-more {
          display: block;
          width: 100%;
          padding: 0.85rem;
          margin-top: 1rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.88rem;
          cursor: pointer;
          transition: all var(--transition);
        }

        .notifs-load-more:hover:not(:disabled) {
          background: rgba(255,255,255,0.08);
          color: var(--text);
        }

        .notifs-load-more:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
