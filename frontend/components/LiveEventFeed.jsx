"use client";

import { useEffect, useRef, useState } from "react";

const MAX_EVENTS = 4;
const EVENT_TTL_MS = 3500; // 3.5 seconds
const EXIT_DURATION_MS = 400;

/**
 * LiveEventFeed — Dynamic event feed for live streams
 * 
 * Displays important live events that auto-disappear after 3-4 seconds:
 * - New top supporter (when someone becomes the top gifter)
 * - Combo streak (when multiple gifts are sent rapidly)
 * - Super gift (when a super/epic gift is sent)
 * 
 * Events are stacked vertically with smooth animations.
 * 
 * Props:
 *   events  {Array<{ id, type, data }>}  Array of events to display
 *     type: "top_supporter" | "combo_streak" | "super_gift"
 *     data: type-specific payload
 */
export default function LiveEventFeed({ events = [] }) {
  const [visible, setVisible] = useState([]);
  const timersRef = useRef({});
  const seenRef = useRef(new Set());

  useEffect(() => {
    const newEvents = events.filter((ev) => !seenRef.current.has(ev.id));
    if (newEvents.length === 0) return;

    newEvents.forEach((ev) => {
      seenRef.current.add(ev.id);

      setVisible((prev) => {
        // Add new event at the top, limit to MAX_EVENTS
        const next = [{ ...ev, exiting: false }, ...prev].slice(0, MAX_EVENTS);
        return next;
      });

      // Schedule exit animation
      const exitTimer = setTimeout(() => {
        setVisible((prev) =>
          prev.map((e) => (e.id === ev.id ? { ...e, exiting: true } : e))
        );

        // Remove after exit animation completes
        timersRef.current[`rm_${ev.id}`] = setTimeout(() => {
          setVisible((prev) => prev.filter((e) => e.id !== ev.id));
          delete timersRef.current[`rm_${ev.id}`];
        }, EXIT_DURATION_MS);

        delete timersRef.current[ev.id];
      }, EVENT_TTL_MS);

      timersRef.current[ev.id] = exitTimer;
    });
  }, [events]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div className="lef-container" aria-live="polite" aria-label="Live event notifications">
      {visible.map((ev) => (
        <EventItem key={ev.id} event={ev} />
      ))}

      <style jsx>{`
        .lef-container {
          position: absolute;
          top: 10px;
          right: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-width: 320px;
          pointer-events: none;
          z-index: 30;
        }

        @media (max-width: 768px) {
          .lef-container {
            max-width: 280px;
            top: 8px;
            right: 8px;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Individual event item component
 */
function EventItem({ event }) {
  const { type, data, exiting } = event;

  // Render different event types
  const renderContent = () => {
    switch (type) {
      case "top_supporter":
        return (
          <div className="lef-item lef-top-supporter">
            <div className="lef-icon">👑</div>
            <div className="lef-content">
              <div className="lef-title">¡Nuevo Top Supporter!</div>
              <div className="lef-subtitle">
                {data.username} · {data.totalCoins?.toLocaleString() || 0} coins
              </div>
            </div>
          </div>
        );

      case "combo_streak":
        return (
          <div className="lef-item lef-combo">
            <div className="lef-icon">🔥</div>
            <div className="lef-content">
              <div className="lef-title">¡Combo x{data.count}!</div>
              <div className="lef-subtitle">
                {data.isStreak ? `Racha de ${data.streakIcon || "🎁"}` : "Regalos consecutivos"}
              </div>
            </div>
          </div>
        );

      case "super_gift":
        return (
          <div className="lef-item lef-super-gift">
            <div className="lef-icon">{data.icon || "✨"}</div>
            <div className="lef-content">
              <div className="lef-title">¡Super Regalo!</div>
              <div className="lef-subtitle">
                {data.sender} envió {data.name || "un regalo épico"}
                {data.quantity > 1 ? ` x${data.quantity}` : ""}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className={`lef-wrapper${exiting ? " lef-exiting" : ""}`}>
        {renderContent()}
      </div>

      <style jsx>{`
        .lef-wrapper {
          animation: lefSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        .lef-wrapper.lef-exiting {
          animation: lefSlideOut ${EXIT_DURATION_MS}ms ease forwards;
        }

        .lef-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.15);
          min-width: 280px;
        }

        /* Top Supporter styling */
        .lef-top-supporter {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 193, 7, 0.15) 100%);
          border-color: rgba(255, 215, 0, 0.4);
          box-shadow: 
            0 4px 24px rgba(0, 0, 0, 0.5),
            0 0 30px rgba(255, 215, 0, 0.3);
        }

        /* Combo Streak styling */
        .lef-combo {
          background: linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(234, 88, 12, 0.15) 100%);
          border-color: rgba(249, 115, 22, 0.4);
          box-shadow: 
            0 4px 24px rgba(0, 0, 0, 0.5),
            0 0 30px rgba(249, 115, 22, 0.3);
        }

        /* Super Gift styling */
        .lef-super-gift {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(147, 51, 234, 0.2) 100%);
          border-color: rgba(168, 85, 247, 0.5);
          box-shadow: 
            0 4px 24px rgba(0, 0, 0, 0.5),
            0 0 30px rgba(168, 85, 247, 0.4);
        }

        .lef-icon {
          font-size: 2rem;
          line-height: 1;
          flex-shrink: 0;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
        }

        .lef-content {
          flex: 1;
          min-width: 0;
        }

        .lef-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 2px;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          line-height: 1.3;
        }

        .lef-subtitle {
          font-size: 0.8rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.3;
        }

        @keyframes lefSlideIn {
          from {
            opacity: 0;
            transform: translateX(30px) scale(0.92);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        @keyframes lefSlideOut {
          from {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateX(20px) scale(0.95);
          }
        }

        @media (max-width: 768px) {
          .lef-item {
            min-width: 240px;
            padding: 10px 14px;
            gap: 10px;
          }

          .lef-icon {
            font-size: 1.6rem;
          }

          .lef-title {
            font-size: 0.85rem;
          }

          .lef-subtitle {
            font-size: 0.72rem;
          }
        }
      `}</style>
    </>
  );
}
