"use client";

import { useState, useEffect } from "react";
import { formatTime } from "@/lib/localeUtils";

/**
 * EnhancedMessageBubble - Advanced message bubble with animations and effects
 * Used in private chat conversations
 */
export default function EnhancedMessageBubble({
  message,
  isMine = false,
  showAvatar = true,
  avatar = null,
  username = "Usuario",
  onReply = null,
  reactions = [],
  onReact = null,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const initial = username ? username[0].toUpperCase() : "U";

  return (
    <>
      <div
        className={`bubble-wrap ${isMine ? "mine" : "theirs"} ${isVisible ? "visible" : ""}`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {!isMine && showAvatar && (
          <div className="bubble-avatar">
            {avatar ? (
              <img src={avatar} alt={username} className="avatar-img" />
            ) : (
              <div className="avatar-placeholder">{initial}</div>
            )}
          </div>
        )}

        <div className="bubble-container">
          {/* Message bubble */}
          <div className={`bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
            <p className="bubble-text">{message.text}</p>
            <span className="bubble-time">
              {formatTime(message.createdAt)}
            </span>

            {/* Delivery status for sent messages */}
            {isMine && (
              <span className="delivery-status" title="Entregado">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            )}
          </div>

          {/* Quick actions */}
          {showActions && (
            <div className={`bubble-actions ${isMine ? "mine-actions" : "theirs-actions"}`}>
              {onReact && (
                <button className="action-btn" onClick={() => onReact(message._id, "❤️")} title="Reaccionar">
                  ❤️
                </button>
              )}
              {onReply && (
                <button className="action-btn" onClick={() => onReply(message)} title="Responder">
                  ↩️
                </button>
              )}
            </div>
          )}

          {/* Reactions */}
          {reactions && reactions.length > 0 && (
            <div className={`bubble-reactions ${isMine ? "mine-reactions" : "theirs-reactions"}`}>
              {reactions.map((reaction, idx) => (
                <span key={idx} className="reaction-emoji">
                  {reaction.emoji}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .bubble-wrap {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.6rem;
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .bubble-wrap.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .bubble-wrap.mine {
          flex-direction: row-reverse;
        }

        .bubble-avatar {
          width: 28px;
          height: 28px;
          flex-shrink: 0;
        }

        .avatar-img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 0.75rem;
          box-shadow: 0 2px 8px rgba(224, 64, 251, 0.3);
        }

        .bubble-container {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          max-width: 75%;
        }

        .bubble {
          position: relative;
          padding: 0.7rem 1rem;
          border-radius: 18px;
          line-height: 1.4;
          word-wrap: break-word;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          transition: all 0.2s;
        }

        .bubble-theirs {
          background: linear-gradient(135deg, rgba(30, 12, 60, 0.95) 0%, rgba(20, 12, 46, 0.95) 100%);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-bottom-left-radius: 4px;
        }

        .bubble-mine {
          background: linear-gradient(135deg, rgba(224, 64, 251, 0.25), rgba(139, 92, 246, 0.25));
          border: 1px solid rgba(224, 64, 251, 0.4);
          border-bottom-right-radius: 4px;
          margin-left: auto;
        }

        .bubble:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
        }

        .bubble-text {
          margin: 0;
          color: var(--text);
          font-size: 0.9rem;
          padding-right: 3.5rem;
        }

        .bubble-time {
          position: absolute;
          bottom: 0.5rem;
          right: 0.7rem;
          font-size: 0.65rem;
          color: var(--text-dim);
          font-weight: 500;
          white-space: nowrap;
        }

        .delivery-status {
          position: absolute;
          bottom: 0.5rem;
          right: 2.5rem;
          color: #34d399;
          display: flex;
          align-items: center;
        }

        .bubble-actions {
          display: flex;
          gap: 0.3rem;
          animation: slideIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .mine-actions {
          align-self: flex-end;
        }

        .theirs-actions {
          align-self: flex-start;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .action-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.85rem;
        }

        .action-btn:hover {
          background: rgba(139, 92, 246, 0.3);
          border-color: rgba(139, 92, 246, 0.5);
          transform: scale(1.1);
        }

        .bubble-reactions {
          display: flex;
          gap: 0.2rem;
          padding: 0.2rem 0.4rem;
        }

        .mine-reactions {
          align-self: flex-end;
        }

        .theirs-reactions {
          align-self: flex-start;
        }

        .reaction-emoji {
          font-size: 0.85rem;
          line-height: 1;
        }
      `}</style>
    </>
  );
}
