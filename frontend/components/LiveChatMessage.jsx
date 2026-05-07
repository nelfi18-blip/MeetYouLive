"use client";

import { useState, useEffect } from "react";

/**
 * LiveChatMessage - Enhanced chat message component for live streams
 * Features smooth animations, VIP styling, and advanced visual effects
 */
export default function LiveChatMessage({
  message,
  isVIP = false,
  isModerator = false,
  isPinned = false,
  topFanRank = null, // 1, 2, or 3 for top fans
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const fanBadge = topFanRank ? ["👑", "🥈", "🥉"][topFanRank - 1] : null;

  return (
    <>
      <div className={`live-chat-msg ${isVisible ? "visible" : ""} ${isPinned ? "pinned" : ""}`}>
        {/* Left accent line */}
        <div className={`msg-accent ${isVIP ? "vip" : ""} ${isModerator ? "mod" : ""}`} />

        <div className="msg-content">
          {/* User info */}
          <div className="msg-header">
            <span className={`msg-username ${isVIP ? "vip-text" : ""} ${isModerator ? "mod-text" : ""}`}>
              {message.user}
            </span>
            
            {/* Badges */}
            <div className="msg-badges">
              {fanBadge && (
                <span className="fan-badge" title={`Top ${topFanRank} fan`}>
                  {fanBadge}
                </span>
              )}
              {isVIP && (
                <span className="vip-badge">VIP</span>
              )}
              {isModerator && (
                <span className="mod-badge">MOD</span>
              )}
              {isPinned && (
                <span className="pinned-badge">📌</span>
              )}
            </div>
          </div>

          {/* Message text */}
          <div className="msg-text">{message.text}</div>
        </div>
      </div>

      <style jsx>{`
        .live-chat-msg {
          display: flex;
          gap: 0.5rem;
          padding: 0.6rem 0.8rem;
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(15, 8, 33, 0.6) 0%, rgba(20, 12, 46, 0.6) 100%);
          border: 1px solid rgba(139, 92, 246, 0.15);
          margin-bottom: 0.4rem;
          opacity: 0;
          transform: translateX(-20px);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .live-chat-msg.visible {
          opacity: 1;
          transform: translateX(0);
        }

        .live-chat-msg.pinned {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.12) 100%);
          border-color: rgba(251, 191, 36, 0.4);
          box-shadow: 0 0 16px rgba(251, 191, 36, 0.2);
        }

        .live-chat-msg::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(224, 64, 251, 0.1) 50%, transparent 100%);
          transform: translateX(-100%);
          animation: shimmer 3s ease-in-out infinite;
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .msg-accent {
          width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(139, 92, 246, 0.6) 0%, rgba(224, 64, 251, 0.6) 100%);
          flex-shrink: 0;
          transition: all 0.3s;
        }

        .msg-accent.vip {
          background: linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%);
          box-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
        }

        .msg-accent.mod {
          background: linear-gradient(180deg, #34d399 0%, #10b981 100%);
          box-shadow: 0 0 8px rgba(52, 211, 153, 0.5);
        }

        .msg-content {
          flex: 1;
          min-width: 0;
        }

        .msg-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.15rem;
        }

        .msg-username {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .msg-username.vip-text {
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .msg-username.mod-text {
          color: #34d399;
        }

        .msg-badges {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .fan-badge {
          font-size: 0.75rem;
          line-height: 1;
          animation: badgePulse 2s ease-in-out infinite;
        }

        @keyframes badgePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }

        .vip-badge,
        .mod-badge {
          font-size: 0.55rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
          line-height: 1;
        }

        .vip-badge {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(245, 158, 11, 0.25));
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.4);
        }

        .mod-badge {
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.25), rgba(16, 185, 129, 0.25));
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.4);
        }

        .pinned-badge {
          font-size: 0.7rem;
          line-height: 1;
        }

        .msg-text {
          font-size: 0.85rem;
          color: var(--text);
          line-height: 1.4;
          word-wrap: break-word;
        }
      `}</style>
    </>
  );
}
