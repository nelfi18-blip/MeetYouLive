"use client";

import { useState } from "react";

/**
 * FeedMonetizationActions component
 * Displays monetization CTAs in feed cards
 * 
 * Props:
 *  - userId: string - Target user ID
 *  - isLive: boolean - Whether user is currently live
 *  - liveId: string - Live stream ID (if live)
 *  - isCreator: boolean - Whether target is a creator
 *  - onSendGift: (userId, liveId?) => void
 *  - onSendGreeting: (userId) => void
 *  - onUnlockChat: (userId) => void
 *  - onJoinLive: (liveId) => void
 *  - compact: boolean - Compact mode for smaller cards
 */
export default function FeedMonetizationActions({
  userId,
  isLive,
  liveId,
  isCreator,
  onSendGift,
  onSendGreeting,
  onUnlockChat,
  onJoinLive,
  compact = false,
}) {
  const [sending, setSending] = useState(false);

  const handleSendGift = async (e) => {
    e.stopPropagation();
    if (sending) return;
    setSending(true);
    try {
      if (onSendGift) {
        await onSendGift(userId, liveId);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSendGreeting = async (e) => {
    e.stopPropagation();
    if (sending) return;
    setSending(true);
    try {
      if (onSendGreeting) {
        await onSendGreeting(userId);
      }
    } finally {
      setSending(false);
    }
  };

  const handleUnlockChat = async (e) => {
    e.stopPropagation();
    if (sending) return;
    setSending(true);
    try {
      if (onUnlockChat) {
        await onUnlockChat(userId);
      }
    } finally {
      setSending(false);
    }
  };

  const handleJoinLive = (e) => {
    e.stopPropagation();
    if (onJoinLive && liveId) {
      onJoinLive(liveId);
    }
  };

  return (
    <>
      <div className={`monetization-actions ${compact ? "compact" : ""}`}>
        {/* Join live button - highest priority when live */}
        {isLive && liveId && (
          <button
            className="action-btn join-live-btn"
            onClick={handleJoinLive}
            disabled={sending}
          >
            <span className="btn-icon">🎥</span>
            <span className="btn-label">Únete al live</span>
          </button>
        )}

        {/* Send gift button - for creators */}
        {isCreator && (
          <button
            className="action-btn gift-btn"
            onClick={handleSendGift}
            disabled={sending}
          >
            <span className="btn-icon">🎁</span>
            <span className="btn-label">Envía regalo</span>
          </button>
        )}

        {/* Send greeting button - for non-live users */}
        {!isLive && (
          <button
            className="action-btn greeting-btn"
            onClick={handleSendGreeting}
            disabled={sending}
          >
            <span className="btn-icon">👋</span>
            <span className="btn-label">Saluda</span>
          </button>
        )}

        {/* Unlock chat button - premium feature */}
        {!isLive && (
          <button
            className="action-btn unlock-btn"
            onClick={handleUnlockChat}
            disabled={sending}
          >
            <span className="btn-icon">💬</span>
            <span className="btn-label">Desbloquear chat</span>
          </button>
        )}
      </div>

      <style jsx>{`
        .monetization-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.75rem;
        }

        .monetization-actions.compact {
          gap: 0.3rem;
          margin-top: 0.5rem;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.5rem 0.9rem;
          border-radius: 999px;
          border: none;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          flex: 1;
          min-width: 0;
          justify-content: center;
        }

        .compact .action-btn {
          padding: 0.4rem 0.7rem;
          font-size: 0.75rem;
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-icon {
          font-size: 1rem;
          line-height: 1;
        }

        .compact .btn-icon {
          font-size: 0.9rem;
        }

        .btn-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Join live button - red/live theme */
        .join-live-btn {
          background: linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.25));
          border: 1px solid rgba(239,68,68,0.5);
          color: #fca5a5;
        }

        .join-live-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(239,68,68,0.35), rgba(220,38,38,0.35));
          border-color: rgba(239,68,68,0.8);
          box-shadow: 0 0 12px rgba(239,68,68,0.4);
        }

        /* Gift button - purple/premium theme */
        .gift-btn {
          background: linear-gradient(135deg, rgba(224,64,251,0.2), rgba(139,92,246,0.2));
          border: 1px solid rgba(224,64,251,0.4);
          color: #e9d5ff;
        }

        .gift-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(224,64,251,0.3), rgba(139,92,246,0.3));
          border-color: rgba(224,64,251,0.7);
          box-shadow: 0 0 12px rgba(224,64,251,0.3);
        }

        /* Greeting button - yellow/friendly theme */
        .greeting-btn {
          background: linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.2));
          border: 1px solid rgba(251,191,36,0.4);
          color: #fde68a;
        }

        .greeting-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(251,191,36,0.3), rgba(245,158,11,0.3));
          border-color: rgba(251,191,36,0.7);
          box-shadow: 0 0 12px rgba(251,191,36,0.3);
        }

        /* Unlock button - cyan/premium theme */
        .unlock-btn {
          background: linear-gradient(135deg, rgba(34,211,238,0.2), rgba(6,182,212,0.2));
          border: 1px solid rgba(34,211,238,0.4);
          color: #a5f3fc;
        }

        .unlock-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(34,211,238,0.3), rgba(6,182,212,0.3));
          border-color: rgba(34,211,238,0.7);
          box-shadow: 0 0 12px rgba(34,211,238,0.3);
        }

        @media (max-width: 768px) {
          .monetization-actions {
            gap: 0.4rem;
          }

          .action-btn {
            padding: 0.45rem 0.75rem;
            font-size: 0.75rem;
          }

          .btn-icon {
            font-size: 0.9rem;
          }
        }
      `}</style>
    </>
  );
}
