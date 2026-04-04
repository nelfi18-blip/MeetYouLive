"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

let notifCounter = 0;

export default function NotificationCenter({ notifications, onDismiss }) {
  const router = useRouter();

  if (!notifications || notifications.length === 0) return null;

  return (
    <>
      <div className="notif-container">
        {notifications.map((n) => (
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
          background: linear-gradient(135deg, #1a0a2e 0%, #16082b 100%);
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

        .notif-icon {
          font-size: 22px;
          line-height: 1;
          flex-shrink: 0;
          margin-top: 1px;
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
      <span className="notif-icon">{notif.icon}</span>
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

  const push = useCallback((notif) => {
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
        actionLabel: "Ver directo",
        duration: 7000,
      });
    },
    [push]
  );

  const handleGiftSent = useCallback(
    (data) => {
      push({
        icon: data.giftIcon || "🎁",
        message: `${data.senderName} envió ${data.giftIcon} ${data.giftName}`,
        duration: 5000,
      });
    },
    [push]
  );

  const handleMatchCreated = useCallback(
    (data) => {
      push({
        icon: "💘",
        message: `Nuevo match con ${data.matchedUsername}`,
        href: "/matches",
        actionLabel: "Ver matches",
        duration: 6000,
      });
    },
    [push]
  );

  const handleCallIncoming = useCallback(
    (data) => {
      push({
        icon: "📞",
        message: `Llamada entrante de ${data.callerName}`,
        href: `/call/${data.callId}`,
        actionLabel: "Contestar",
        duration: 15000,
      });
    },
    [push]
  );

  return { notifications, dismiss, handleLiveStarted, handleGiftSent, handleMatchCreated, handleCallIncoming };
}
