"use client";

import { useEffect, useRef, useState } from "react";

const MAX_EVENTS = 5;
const EVENT_TTL_MS = 6000;
const EXIT_DURATION_MS = 350;

const TYPE_ICON = {
  gift: "🎁",
  join: "👋",
  chat: "💬",
};

/**
 * LiveFeedOverlay — floating activity feed overlaid on the live video.
 *
 * Props:
 *   events  {Array<{ id, type, icon, text }>}  Recent live events to display.
 *            Caller pushes new events; this component handles auto-expiry.
 */
export default function LiveFeedOverlay({ events = [] }) {
  const [visible, setVisible] = useState([]);
  const timersRef = useRef({});
  const seenRef = useRef(new Set());

  useEffect(() => {
    const newEvents = events.filter((ev) => !seenRef.current.has(ev.id));
    if (newEvents.length === 0) return;

    newEvents.forEach((ev) => {
      seenRef.current.add(ev.id);

      setVisible((prev) => {
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
    <div className="lfo-wrap" aria-live="polite" aria-label="Actividad del directo">
      {visible.map((ev) => (
        <div
          key={ev.id}
          className={`lfo-item lfo-type-${ev.type}${ev.exiting ? " lfo-exiting" : ""}`}
        >
          <span className="lfo-icon">{ev.icon || TYPE_ICON[ev.type] || "📢"}</span>
          <span className="lfo-text">{ev.text}</span>
        </div>
      ))}

      <style jsx>{`
        .lfo-wrap {
          position: absolute;
          bottom: 60px;
          left: 10px;
          display: flex;
          flex-direction: column-reverse;
          gap: 0.35rem;
          max-width: 240px;
          pointer-events: none;
          z-index: 20;
        }

        .lfo-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.3rem 0.65rem 0.3rem 0.45rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #fff;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          background: rgba(10, 5, 25, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
          animation: lfoIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          max-width: 100%;
        }

        .lfo-item.lfo-exiting {
          animation: lfoOut ${EXIT_DURATION_MS}ms ease forwards;
        }

        /* Gift items get an accent border */
        .lfo-type-gift {
          border-color: rgba(224, 64, 251, 0.5);
          background: rgba(20, 8, 40, 0.82);
        }

        /* Join items get a green tint */
        .lfo-type-join {
          border-color: rgba(74, 222, 128, 0.35);
        }

        .lfo-icon {
          font-size: 0.9rem;
          flex-shrink: 0;
          line-height: 1;
        }

        .lfo-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.3;
          color: rgba(255, 255, 255, 0.92);
        }

        @keyframes lfoIn {
          from {
            opacity: 0;
            transform: translateX(-14px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        @keyframes lfoOut {
          from {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateX(-10px) scale(0.95);
          }
        }
      `}</style>
    </div>
  );
}
