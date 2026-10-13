"use client";

import { useEffect, useRef, useState } from "react";

const MAX_TOASTS = 3;
const TOAST_TTL_MS = 4500;
const EXIT_DURATION_MS = 300;

/**
 * ViewerJoinToast — host-only, high-visibility notice that a new viewer
 * entered the live. Kept separate from the general LiveFeedOverlay (which
 * mixes chat/gift/join events and can push a join notice out quickly in a
 * busy stream) so the host never has to open the viewer list manually to
 * notice new arrivals.
 *
 * Reuses the same `USER_JOINED_LIVE` events the page already receives —
 * no new presence/socket infrastructure is introduced.
 *
 * Props:
 *   events {Array<{ id, name }>} - deduplicated join events pushed by the caller.
 */
export default function ViewerJoinToast({ events = [] }) {
  const [visible, setVisible] = useState([]);
  const timersRef = useRef({});
  const seenRef = useRef(new Set());

  useEffect(() => {
    const newEvents = events.filter((ev) => !seenRef.current.has(ev.id));
    if (newEvents.length === 0) return;

    newEvents.forEach((ev) => {
      seenRef.current.add(ev.id);

      setVisible((prev) => [{ ...ev, exiting: false }, ...prev].slice(0, MAX_TOASTS));

      timersRef.current[ev.id] = setTimeout(() => {
        setVisible((prev) => prev.map((e) => (e.id === ev.id ? { ...e, exiting: true } : e)));
        timersRef.current[`rm_${ev.id}`] = setTimeout(() => {
          setVisible((prev) => prev.filter((e) => e.id !== ev.id));
          delete timersRef.current[`rm_${ev.id}`];
        }, EXIT_DURATION_MS);
        delete timersRef.current[ev.id];
      }, TOAST_TTL_MS);
    });
  }, [events]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div className="viewer-join-toast-stack" role="status" aria-live="polite">
      {visible.map((ev) => (
        <div key={ev.id} className={`viewer-join-toast${ev.exiting ? " viewer-join-toast-exit" : ""}`}>
          <span className="viewer-join-toast-icon">👋</span>
          <span className="viewer-join-toast-text">{ev.text}</span>
        </div>
      ))}
      <style jsx>{`
        .viewer-join-toast-stack {
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 25;
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: center;
          pointer-events: none;
          max-width: calc(100% - 24px);
        }
        .viewer-join-toast {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          border-radius: 999px;
          background: rgba(17, 20, 32, 0.72);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
          animation: viewerJoinIn 0.25s ease-out;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .viewer-join-toast-exit {
          animation: viewerJoinOut 0.3s ease-in forwards;
        }
        .viewer-join-toast-icon {
          font-size: 15px;
          flex-shrink: 0;
        }
        .viewer-join-toast-text {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @keyframes viewerJoinIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes viewerJoinOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
            transform: translateY(-6px);
          }
        }
      `}</style>
    </div>
  );
}
