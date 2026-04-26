"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LivePressureHints
 *
 * Non-blocking, mobile-first floating hint that shows psychological pressure
 * messages during a live stream (top fan proximity, boost moments, activity
 * signals, goal contributions). Auto-hides after a few seconds.
 *
 * Props:
 *   hint  — { id, type, icon, text, subtext } | null
 *           A new object reference (or different id) triggers a new display.
 */
export default function LivePressureHints({ hint }) {
  const [current, setCurrent] = useState(null);
  const [visible, setVisible] = useState(false);
  const fadeTimerRef = useRef(null);
  const clearTimerRef = useRef(null);

  useEffect(() => {
    if (!hint) return;

    // Clear any pending timers
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

    setCurrent(hint);
    setVisible(true);

    // Start fade-out before removal
    fadeTimerRef.current = setTimeout(() => setVisible(false), 4000);
    clearTimerRef.current = setTimeout(() => setCurrent(null), 4500);

    return () => {
      clearTimeout(fadeTimerRef.current);
      clearTimeout(clearTimerRef.current);
    };
  // We intentionally depend only on hint.id so a new id always triggers display
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint?.id]);

  useEffect(() => {
    return () => {
      clearTimeout(fadeTimerRef.current);
      clearTimeout(clearTimerRef.current);
    };
  }, []);

  if (!current) return null;

  const intensityClass =
    current.type === "boost_moment"   ? "lph-boost" :
    current.type === "lost_top_fan"   ? "lph-warn"  :
    current.type === "top_fan_close"  ? "lph-gold"  :
    current.type === "activity"       ? "lph-fire"  :
    "lph-default";

  return (
    <div
      className={`lph-wrap ${intensityClass}${visible ? " lph-in" : " lph-out"}`}
      role="status"
      aria-live="polite"
    >
      <span className="lph-icon">{current.icon}</span>
      <div className="lph-body">
        <span className="lph-text">{current.text}</span>
        {current.subtext ? <span className="lph-subtext">{current.subtext}</span> : null}
      </div>

      <style jsx>{`
        .lph-wrap {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 60;
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.5rem 1rem 0.5rem 0.75rem;
          border-radius: 999px;
          backdrop-filter: blur(14px);
          border: 1px solid transparent;
          pointer-events: none;
          max-width: min(92vw, 380px);
          white-space: nowrap;
          overflow: hidden;
          transition: opacity 0.45s ease, transform 0.45s ease;
          will-change: opacity, transform;
        }

        .lph-in  { opacity: 1; transform: translateX(-50%) translateY(0); }
        .lph-out { opacity: 0; transform: translateX(-50%) translateY(-8px); }

        /* Type variants */
        .lph-boost {
          background: rgba(244,63,94,0.18);
          border-color: rgba(244,63,94,0.5);
          box-shadow: 0 0 24px rgba(244,63,94,0.4);
          animation: lphPulse 0.6s ease-in-out infinite alternate;
        }
        .lph-warn {
          background: rgba(245,158,11,0.15);
          border-color: rgba(245,158,11,0.45);
          box-shadow: 0 0 18px rgba(245,158,11,0.3);
        }
        .lph-gold {
          background: rgba(251,191,36,0.12);
          border-color: rgba(251,191,36,0.4);
          box-shadow: 0 0 16px rgba(251,191,36,0.25);
        }
        .lph-fire {
          background: rgba(255,45,120,0.13);
          border-color: rgba(255,45,120,0.38);
          box-shadow: 0 0 16px rgba(255,45,120,0.2);
        }
        .lph-default {
          background: rgba(139,92,246,0.13);
          border-color: rgba(139,92,246,0.35);
          box-shadow: 0 0 14px rgba(139,92,246,0.2);
        }

        @keyframes lphPulse {
          from { box-shadow: 0 0 18px rgba(244,63,94,0.35); }
          to   { box-shadow: 0 0 36px rgba(244,63,94,0.65); }
        }

        .lph-icon {
          font-size: 1.15rem;
          flex-shrink: 0;
          animation: lphIconBounce 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both;
        }

        @keyframes lphIconBounce {
          from { transform: scale(0.5) rotate(-10deg); }
          to   { transform: scale(1) rotate(0deg); }
        }

        .lph-body {
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
          min-width: 0;
          overflow: hidden;
        }

        .lph-text {
          font-size: 0.82rem;
          font-weight: 800;
          color: rgba(255,255,255,0.95);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .lph-subtext {
          font-size: 0.7rem;
          font-weight: 600;
          color: rgba(255,255,255,0.6);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media (max-width: 480px) {
          .lph-wrap {
            top: 60px;
            padding: 0.45rem 0.85rem 0.45rem 0.65rem;
          }
          .lph-text { font-size: 0.78rem; }
        }
      `}</style>
    </div>
  );
}
