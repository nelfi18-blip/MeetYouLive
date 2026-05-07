"use client";

import { useState } from "react";

/**
 * MessageReactions - Quick emoji reactions for messages
 * Allows users to react to messages with emojis
 */
export default function MessageReactions({ messageId, reactions = [], onReact }) {
  const [showPicker, setShowPicker] = useState(false);
  
  const quickEmojis = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

  const handleReact = (emoji) => {
    if (onReact) {
      onReact(messageId, emoji);
    }
    setShowPicker(false);
  };

  // Count reactions by emoji
  const reactionCounts = reactions.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="message-reactions">
        {/* Show existing reactions */}
        {Object.entries(reactionCounts).length > 0 && (
          <div className="reactions-list">
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <button
                key={emoji}
                className="reaction-badge hover-lift"
                onClick={() => handleReact(emoji)}
              >
                <span className="reaction-emoji">{emoji}</span>
                {count > 1 && <span className="reaction-count">{count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Add reaction button */}
        <button
          className="add-reaction-btn"
          onClick={() => setShowPicker(!showPicker)}
          title="Agregar reacción"
        >
          +
        </button>

        {/* Emoji picker */}
        {showPicker && (
          <div className="emoji-picker animate-bounce-in">
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                className="emoji-option"
                onClick={() => handleReact(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .message-reactions {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-top: 0.3rem;
          position: relative;
        }

        .reactions-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }

        .reaction-badge {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(224, 64, 251, 0.15));
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 12px;
          padding: 0.2rem 0.5rem;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .reaction-badge:hover {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(224, 64, 251, 0.3));
          border-color: rgba(139, 92, 246, 0.5);
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        }

        .reaction-emoji {
          font-size: 1rem;
          line-height: 1;
        }

        .reaction-count {
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--text-muted);
        }

        .add-reaction-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.25);
          color: var(--accent-2);
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .add-reaction-btn:hover {
          background: rgba(139, 92, 246, 0.2);
          border-color: rgba(139, 92, 246, 0.4);
          transform: scale(1.1);
        }

        .emoji-picker {
          position: absolute;
          bottom: calc(100% + 0.5rem);
          left: 0;
          background: linear-gradient(135deg, rgba(30, 12, 60, 0.98) 0%, rgba(20, 12, 46, 0.98) 100%);
          border: 1px solid rgba(139, 92, 246, 0.4);
          border-radius: 12px;
          padding: 0.6rem;
          display: flex;
          gap: 0.4rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 20px rgba(139, 92, 246, 0.2);
          backdrop-filter: blur(16px);
          z-index: 10;
        }

        .emoji-option {
          font-size: 1.3rem;
          padding: 0.3rem;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: transform 0.2s;
          border-radius: 8px;
        }

        .emoji-option:hover {
          transform: scale(1.3);
          background: rgba(139, 92, 246, 0.15);
        }
      `}</style>
    </>
  );
}
