"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

let notifCounter = 0;

/** Max notifications shown at once to avoid blocking the screen. */
const MAX_VISIBLE = 5;

/** Deduplication window in ms — same key won't fire twice within this period. */
const DEDUP_WINDOW_MS = 8000;

export default function NotificationCenter({ notifications, onDismiss }) {
  const router = useRouter();

  if (!notifications || notifications.length === 0) return null;

  const visible = notifications.slice(-MAX_VISIBLE);

  return (
    <>
      <div className="notif-container">
        {visible.map((n) => (
          <NotifToast key={n.id} notif={n} onDismiss={onDismiss} router={router} />
        ))}
      </div>

      <style jsx global>{`
        .notif-container {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 340px;
          width: calc(100vw - 32px);
          pointer-events: none;
        }

        @media (max-width: 480px) {
          .notif-container {
            top: 8px;
            right: 8px;
            left: 8px;
            max-width: 100%;
            width: auto;
          }
        }

        .notif-toast {
          pointer-events: all;
          background: linear-gradient(135deg, rgba(26, 10, 46, 0.92) 0%, rgba(22, 8, 43, 0.92) 100%);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(200, 100, 255, 0.35);
          border-radius: 14px;
          padding: 12px 14px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          box-shadow: 0 4px 24px rgba(180, 60, 255, 0.25), 0 1px 6px rgba(0,0,0,0.5);
          animation: notif-slide-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          cursor: default;
          position: relative;
          overflow: hidden;
        }

        .notif-toast.notif-exiting {
          animation: notif-slide-out 0.25s ease-in both;
        }

        .notif-toast::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, #c040ff, #ff4fa3, #c040ff);
          background-size: 200% 100%;
          animation: notif-bar-shimmer 2s linear infinite;
        }

        @keyframes notif-slide-in {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)   scale(1);    }
        }

        @keyframes notif-slide-out {
          from { opacity: 1; transform: translateX(0)   scale(1);    max-height: 120px; }
          to   { opacity: 0; transform: translateX(40px) scale(0.95); max-height: 0;    }
        }

        @keyframes notif-bar-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .notif-lead {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 1px;
        }

        .notif-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          object-fit: cover;
          border: 1.5px solid rgba(192, 64, 255, 0.5);
        }

        .notif-icon {
          font-size: 22px;
          line-height: 1;
        }

        .notif-body {
          flex: 1;
          min-width: 0;
        }

        .notif-text {
          color: #f0d0ff;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
          margin: 0 0 4px;
          white-space: pre-line;
          font-family: Inter, sans-serif;
        }

        .notif-action {
          display: inline-block;
          font-size: 11px;
          color: #c040ff;
          font-weight: 600;
          text-decoration: none;
          letter-spacing: 0.03em;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          font-family: Inter, sans-serif;
        }

        .notif-action:hover {
          color: #ff4fa3;
        }

        .notif-close {
          flex-shrink: 0;
          background: none;
          border: none;
          color: rgba(200, 130, 255, 0.5);
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          margin-top: -1px;
          transition: color 0.2s;
        }

        .notif-close:hover {
          color: #ff4fa3;
        }
      `}</style>
    </>
  );
}

function NotifToast({ notif, onDismiss, router }) {
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(notif.id), 260);
  }, [notif.id, onDismiss]);

  useEffect(() => {
    const t = setTimeout(dismiss, notif.duration || 5000);
    return () => clearTimeout(t);
  }, [dismiss, notif.duration]);

  const handleAction = () => {
    if (notif.href) {
      router.push(notif.href);
    }
    dismiss();
  };

  return (
    <div className={`notif-toast${exiting ? " notif-exiting" : ""}`}>
      <span className="notif-lead">
        {notif.avatarUrl ? (
          <img src={notif.avatarUrl} alt="" className="notif-avatar" />
        ) : (
          <span className="notif-icon">{notif.icon}</span>
        )}
      </span>
      <div className="notif-body">
        <p className="notif-text">{notif.message}</p>
        {notif.href && notif.actionLabel && (
          <button className="notif-action" onClick={handleAction}>
            {notif.actionLabel}
          </button>
        )}
      </div>
      <button className="notif-close" onClick={dismiss} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
}

/**
 * Hook consumed by providers.jsx to manage notifications state and
 * map raw socket events to display objects.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  /** Deduplication: maps a string key → timestamp of last push. */
  const dedupRef = useRef({});

  /**
   * Attempt to push a notification.
   * If `dedupKey` is provided and the same key was pushed within
   * DEDUP_WINDOW_MS, the notification is silently dropped.
   */
  const push = useCallback((notif) => {
    if (notif.dedupKey) {
      const last = dedupRef.current[notif.dedupKey];
      const now = Date.now();
      if (last && now - last < DEDUP_WINDOW_MS) return;
      dedupRef.current[notif.dedupKey] = now;
    }
    const id = ++notifCounter;
    setNotifications((prev) => [...prev, { id, ...notif }]);
  }, []);

  const dismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleLiveStarted = useCallback(
    (data) => {
      push({
        icon: "🔴",
        message: `${data.creatorUsername || "Un creador"} está en vivo ahora`,
        href: `/live/${data.liveId}`,
        actionLabel: "Entrar al live",
        duration: 7000,
        dedupKey: `live_${data.liveId}`,
      });
    },
    [push]
  );

  const handleGiftSent = useCallback(
    (data) => {
      push({
        icon: data.giftIcon || "🎁",
        message: `${data.senderName || "Alguien"} te envió ${data.giftName || "un regalo"}`,
        duration: 5000,
        dedupKey: `gift_${data.senderName}_${Date.now() >> 10}`,
      });
    },
    [push]
  );

  const handleMatchCreated = useCallback(
    (data) => {
      const href = data.chatId ? `/chats/${data.chatId}` : "/matches";
      push({
        icon: "💖",
        message: `¡Nuevo match con ${data.matchedUsername}!`,
        href,
        actionLabel: "Abrir chat",
        duration: 8000,
        dedupKey: `match_${data.matchedUserId}`,
      });
    },
    [push]
  );

  const handleCallIncoming = useCallback(
    (data) => {
      push({
        icon: "📞",
        message: `Llamada entrante de ${data.callerName || "Alguien"}`,
        href: `/call/${data.callId}`,
        actionLabel: "Ver llamada",
        duration: 15000,
        dedupKey: `call_${data.callId}`,
      });
    },
    [push]
  );

  const handleCrushReceived = useCallback(
    (data) => {
      push({
        icon: "💖",
        message: `${data.fromUsername || "Alguien"} te dio Like`,
        href: "/crush",
        actionLabel: "Ver Crush",
        duration: 5000,
        dedupKey: `crush_${data.fromUserId || data.fromUsername}`,
      });
    },
    [push]
  );

  const handleSuperCrushReceived = useCallback(
    (data) => {
      push({
        icon: "⚡",
        message: `${data.fromUsername || "Alguien"} te envió un Super Crush ✨`,
        href: "/crush",
        actionLabel: "Ver Crush",
        duration: 7000,
        dedupKey: `supercrush_${data.fromUserId || data.fromUsername}`,
      });
    },
    [push]
  );

  const handleDailyReward = useCallback(
    (data) => {
      const coins = data?.coinsAwarded ?? data?.coins ?? "";
      const streak = data?.streak ?? 0;
      const streakText = streak > 1 ? ` · Racha ${streak} 🔥` : "";
      push({
        icon: "✅",
        message: `Reclamaste tus monedas de hoy${coins ? ` · +${coins} monedas` : ""}${streakText}`,
        href: "/crush",
        actionLabel: "Ir a Crush",
        duration: 7000,
        dedupKey: `daily_reward_${new Date().toDateString()}`,
      });
    },
    [push]
  );

  return {
    notifications,
    push,
    dismiss,
    handleLiveStarted,
    handleGiftSent,
    handleMatchCreated,
    handleCallIncoming,
    handleCrushReceived,
    handleSuperCrushReceived,
    handleDailyReward,
  };
}
