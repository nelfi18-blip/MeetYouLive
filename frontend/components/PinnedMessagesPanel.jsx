"use client";

import { useState, useEffect } from "react";

/**
 * PinnedMessagesPanel - Shows pinned messages in live chat
 * Displays important messages from moderators or host
 */
export default function PinnedMessagesPanel({ pinnedMessages = [], onUnpin = null, canManage = false }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (pinnedMessages.length > 1 && isExpanded) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % pinnedMessages.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [pinnedMessages.length, isExpanded]);

  if (pinnedMessages.length === 0) return null;

  const currentMessage = pinnedMessages[currentIndex];

  return (
    <>
      <div className={`pinned-panel ${isExpanded ? "expanded" : "collapsed"}`}>
        <div className="pinned-header" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="pinned-icon">📌</div>
          <span className="pinned-title">Mensajes fijados</span>
          {pinnedMessages.length > 1 && (
            <span className="pinned-count">{pinnedMessages.length}</span>
          )}
          <button className="expand-btn">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {isExpanded && (
          <div className="pinned-content">
            <div className="pinned-message">
              <div className="message-header">
                <span className="message-author">{currentMessage.user}</span>
                <span className="message-time">
                  {new Date(currentMessage.createdAt).toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="message-text">{currentMessage.text}</div>
            </div>

            {pinnedMessages.length > 1 && (
              <div className="pinned-navigation">
                {pinnedMessages.map((_, idx) => (
                  <button
                    key={idx}
                    className={`nav-dot ${idx === currentIndex ? "active" : ""}`}
                    onClick={() => setCurrentIndex(idx)}
                  />
                ))}
              </div>
            )}

            {canManage && onUnpin && (
              <button className="unpin-btn" onClick={() => onUnpin(currentMessage._id)} title="Desfijar mensaje">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .pinned-panel {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.15));
          border: 1.5px solid rgba(251, 191, 36, 0.4);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 1rem;
          box-shadow: 0 0 20px rgba(251, 191, 36, 0.2);
          backdrop-filter: blur(12px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .pinned-panel.collapsed {
          box-shadow: 0 0 12px rgba(251, 191, 36, 0.15);
        }

        .pinned-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .pinned-header:hover {
          background: rgba(251, 191, 36, 0.08);
        }

        .pinned-icon {
          font-size: 1rem;
          line-height: 1;
          animation: pinPulse 2s ease-in-out infinite;
        }

        @keyframes pinPulse {
          0%, 100% {
            transform: scale(1) rotate(0deg);
          }
          25% {
            transform: scale(1.1) rotate(-10deg);
          }
          75% {
            transform: scale(1.1) rotate(10deg);
          }
        }

        .pinned-title {
          font-size: 0.8rem;
          font-weight: 800;
          color: #fbbf24;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .pinned-count {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.15rem 0.4rem;
          border-radius: 999px;
          background: rgba(251, 191, 36, 0.25);
          color: #fde68a;
          border: 1px solid rgba(251, 191, 36, 0.4);
        }

        .expand-btn {
          margin-left: auto;
          background: none;
          border: none;
          color: #fbbf24;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0.2rem;
        }

        .pinned-content {
          padding: 0 1rem 1rem 1rem;
          position: relative;
          animation: slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 200px;
          }
        }

        .pinned-message {
          background: rgba(15, 8, 33, 0.5);
          border-radius: 8px;
          padding: 0.7rem 0.9rem;
          border: 1px solid rgba(251, 191, 36, 0.2);
        }

        .message-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.4rem;
        }

        .message-author {
          font-size: 0.8rem;
          font-weight: 700;
          color: #fbbf24;
        }

        .message-time {
          font-size: 0.65rem;
          color: var(--text-dim);
        }

        .message-text {
          font-size: 0.85rem;
          color: var(--text);
          line-height: 1.5;
        }

        .pinned-navigation {
          display: flex;
          justify-content: center;
          gap: 0.4rem;
          margin-top: 0.7rem;
        }

        .nav-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(251, 191, 36, 0.3);
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          padding: 0;
        }

        .nav-dot.active {
          background: #fbbf24;
          width: 20px;
          border-radius: 3px;
          box-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
        }

        .unpin-btn {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(248, 113, 113, 0.15);
          border: 1px solid rgba(248, 113, 113, 0.3);
          color: #f87171;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .unpin-btn:hover {
          background: rgba(248, 113, 113, 0.3);
          border-color: rgba(248, 113, 113, 0.5);
          transform: scale(1.1);
        }
      `}</style>
    </>
  );
}
