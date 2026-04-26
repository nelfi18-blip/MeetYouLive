"use client";

import { useEffect, useState } from "react";

/**
 * LiveEventBanner
 *
 * Shows an animated top-of-screen banner when a live engagement event is active.
 * Accepts:
 *   event   – { type, label, icon, expiresAt } | null
 *   onClose – called when the banner is manually dismissed
 */
export default function LiveEventBanner({ event, onClose }) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!event?.expiresAt) {
      setSecondsLeft(null);
      return;
    }

    const update = () => {
      const diff = Math.max(0, Math.ceil((new Date(event.expiresAt) - Date.now()) / 1000));
      setSecondsLeft(diff);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [event?.expiresAt]);

  if (!event) return null;

  const isUrgent = secondsLeft !== null && secondsLeft <= 30;

  return (
    <div className={`leb-wrap${isUrgent ? " leb-urgent" : ""}`} role="alert" aria-live="polite">
      <span className="leb-icon">{event.icon || "🔥"}</span>
      <span className="leb-label">{event.label}</span>
      {secondsLeft !== null && (
        <span className={`leb-timer${isUrgent ? " leb-timer-urgent" : ""}`}>
          {secondsLeft}s
        </span>
      )}
      {onClose && (
        <button className="leb-close" onClick={onClose} aria-label="Cerrar evento">×</button>
      )}

      <style jsx>{`
        .leb-wrap {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.55rem 1rem;
          background: linear-gradient(90deg, rgba(251,101,6,0.92) 0%, rgba(239,68,68,0.92) 100%);
          border-radius: var(--radius-sm, 8px);
          box-shadow: 0 0 24px rgba(251,101,6,0.45), 0 2px 8px rgba(0,0,0,0.4);
          animation: leb-slide-in 0.35s cubic-bezier(0.175,0.885,0.32,1.275) both;
          border: 1px solid rgba(255,255,255,0.18);
          position: relative;
          overflow: hidden;
        }

        .leb-wrap::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%);
          animation: leb-shimmer 2s linear infinite;
        }

        .leb-wrap.leb-urgent {
          background: linear-gradient(90deg, rgba(220,38,38,0.95) 0%, rgba(185,28,28,0.95) 100%);
          animation: leb-slide-in 0.35s cubic-bezier(0.175,0.885,0.32,1.275) both, leb-pulse 0.6s ease-in-out infinite;
          box-shadow: 0 0 32px rgba(220,38,38,0.65), 0 2px 8px rgba(0,0,0,0.5);
        }

        @keyframes leb-slide-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes leb-shimmer {
          from { transform: translateX(-100%); }
          to   { transform: translateX(200%); }
        }

        @keyframes leb-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(220,38,38,0.5); }
          50%       { box-shadow: 0 0 40px rgba(220,38,38,0.9); }
        }

        .leb-icon {
          font-size: 1.35rem;
          animation: leb-icon-bounce 0.9s ease-in-out infinite;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }

        @keyframes leb-icon-bounce {
          0%, 100% { transform: scale(1) rotate(-5deg); }
          50%       { transform: scale(1.18) rotate(5deg); }
        }

        .leb-label {
          flex: 1;
          font-size: 0.88rem;
          font-weight: 800;
          color: #fff;
          text-shadow: 0 1px 4px rgba(0,0,0,0.35);
          letter-spacing: 0.01em;
          position: relative;
          z-index: 1;
        }

        .leb-timer {
          font-size: 0.82rem;
          font-weight: 900;
          color: rgba(255,255,255,0.9);
          background: rgba(0,0,0,0.25);
          border-radius: 999px;
          padding: 0.18rem 0.6rem;
          letter-spacing: 0.03em;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
          min-width: 40px;
          text-align: center;
        }

        .leb-timer.leb-timer-urgent {
          color: #fff;
          background: rgba(0,0,0,0.45);
          animation: leb-timer-flash 0.5s ease-in-out infinite;
        }

        @keyframes leb-timer-flash {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.65; }
        }

        .leb-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.75);
          font-size: 1.2rem;
          cursor: pointer;
          padding: 0 0.2rem;
          line-height: 1;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
          transition: color 0.15s;
        }

        .leb-close:hover { color: #fff; }
      `}</style>
    </div>
  );
}
