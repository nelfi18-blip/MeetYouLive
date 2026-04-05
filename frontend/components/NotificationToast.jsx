"use client";

import { useEffect, useState, useCallback } from "react";
import { useSocket } from "@/contexts/SocketContext";

let _toastId = 0;

const EVENT_CONFIG = {
  LIVE_STARTED: {
    icon: "🔴",
    label: (d) => `${d.title || "Directo"} ha comenzado`,
    href: (d) => (d.liveId ? `/live/${d.liveId}` : null),
    color: "#e53e3e",
  },
  GIFT_SENT: {
    icon: (d) => d.giftIcon || "🎁",
    label: (d) =>
      `${d.senderName || "Alguien"} te envió ${d.giftName || "un regalo"} (${d.coinCost} 🪙)`,
    href: () => null,
    color: "#d69e2e",
  },
  MATCH_CREATED: {
    icon: "💞",
    label: () => "¡Nuevo match! Empezad a chatear.",
    href: () => "/matches",
    color: "#d53f8c",
  },
  CALL_INCOMING: {
    icon: "📞",
    label: (d) => `${d.callerName || "Alguien"} te está llamando`,
    href: (d) => (d.callId ? `/call/${d.callId}` : null),
    color: "#3182ce",
  },
};

export default function NotificationToast() {
  const { socket } = useSocket();
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((event, data) => {
    const cfg = EVENT_CONFIG[event];
    if (!cfg) return;

    const id = ++_toastId;
    const icon = typeof cfg.icon === "function" ? cfg.icon(data) : cfg.icon;
    const label = cfg.label(data);
    const href = cfg.href(data);

    setToasts((prev) => [{ id, icon, label, href, color: cfg.color }, ...prev].slice(0, 5));

    // Auto-dismiss after 5 s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!socket) return;

    const events = Object.keys(EVENT_CONFIG);
    const handlers = {};

    events.forEach((event) => {
      handlers[event] = (data) => addToast(event, data);
      socket.on(event, handlers[event]);
    });

    return () => {
      events.forEach((event) => socket.off(event, handlers[event]));
    };
  }, [socket, addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ borderLeftColor: t.color }}>
          <span className="toast-icon">{t.icon}</span>
          {t.href ? (
            <a href={t.href} className="toast-label">
              {t.label}
            </a>
          ) : (
            <span className="toast-label">{t.label}</span>
          )}
          <button
            className="toast-close"
            onClick={() => dismiss(t.id)}
            aria-label="Cerrar notificación"
          >
            ✕
          </button>
        </div>
      ))}

      <style jsx>{`
        .toast-container {
          position: fixed;
          top: 72px;
          right: 16px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 340px;
          width: calc(100vw - 32px);
        }

        .toast {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: rgba(20, 20, 30, 0.92);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-left: 4px solid #9b59b6;
          border-radius: 10px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
          animation: toast-in 0.25s ease;
          color: #fff;
          font-family: Inter, sans-serif;
          font-size: 0.85rem;
          line-height: 1.35;
        }

        @keyframes toast-in {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .toast-icon {
          font-size: 1.3rem;
          flex-shrink: 0;
        }

        .toast-label {
          flex: 1;
          color: #e2e8f0;
          text-decoration: none;
          word-break: break-word;
        }

        .toast-label:hover {
          text-decoration: underline;
          color: #fff;
        }

        .toast-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.45);
          cursor: pointer;
          font-size: 0.75rem;
          padding: 0 2px;
          flex-shrink: 0;
          line-height: 1;
          transition: color 0.15s;
        }

        .toast-close:hover {
          color: rgba(255, 255, 255, 0.9);
        }

        @media (max-width: 480px) {
          .toast-container {
            top: auto;
            bottom: 72px;
            left: 8px;
            right: 8px;
            max-width: 100%;
            width: auto;
          }
        }
      `}</style>
    </div>
  );
}
