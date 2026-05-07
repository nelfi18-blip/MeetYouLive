"use client";

import { useState, useEffect } from "react";

// Reaction cooldown duration in milliseconds
const REACTION_COOLDOWN_MS = 1000;

/**
 * QuickReactionBar - Quick reaction buttons for live streams
 * Allows viewers to send emoji reactions with a single tap
 */
export default function QuickReactionBar({ onReact, position = "bottom" }) {
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [cooldown, setCooldown] = useState(false);

  const reactions = [
    { emoji: "❤️", label: "Love", color: "#f87171" },
    { emoji: "👍", label: "Like", color: "#60a5fa" },
    { emoji: "😂", label: "LOL", color: "#fbbf24" },
    { emoji: "😮", label: "Wow", color: "#a78bfa" },
    { emoji: "🔥", label: "Fire", color: "#f97316" },
    { emoji: "💎", label: "Gems", color: "#22d3ee" },
  ];

  const handleReact = (emoji) => {
    if (cooldown) return;

    setSelectedEmoji(emoji);
    setCooldown(true);

    if (onReact) {
      onReact(emoji);
    }

    // Animate selection
    setTimeout(() => setSelectedEmoji(null), 300);

    // Cooldown
    setTimeout(() => setCooldown(false), REACTION_COOLDOWN_MS);
  };

  return (
    <>
      <div className={`quick-reaction-bar ${position}`}>
        {reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            className={`reaction-btn ${selectedEmoji === reaction.emoji ? "selected" : ""} ${cooldown ? "cooldown" : ""}`}
            onClick={() => handleReact(reaction.emoji)}
            disabled={cooldown}
            title={reaction.label}
            style={{ "--reaction-color": reaction.color }}
          >
            <span className="reaction-emoji">{reaction.emoji}</span>
            <div className="reaction-ripple" />
          </button>
        ))}
      </div>

      <style jsx>{`
        .quick-reaction-bar {
          display: flex;
          gap: 0.6rem;
          padding: 0.8rem;
          background: linear-gradient(135deg, rgba(15, 8, 33, 0.85) 0%, rgba(20, 12, 46, 0.85) 100%);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 999px;
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          position: fixed;
          z-index: 50;
          animation: slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .quick-reaction-bar.bottom {
          bottom: 100px;
          right: 1rem;
          flex-direction: column;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .reaction-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(139, 92, 246, 0.1);
          border: 2px solid rgba(139, 92, 246, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .reaction-btn:hover:not(.cooldown) {
          background: rgba(139, 92, 246, 0.2);
          border-color: var(--reaction-color);
          transform: scale(1.1);
          box-shadow: 0 0 20px var(--reaction-color);
        }

        .reaction-btn:active:not(.cooldown) {
          transform: scale(0.95);
        }

        .reaction-btn.selected {
          animation: reactionPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          background: var(--reaction-color);
          border-color: var(--reaction-color);
        }

        @keyframes reactionPop {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.4);
          }
          100% {
            transform: scale(1);
          }
        }

        .reaction-btn.cooldown {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .reaction-emoji {
          font-size: 1.5rem;
          line-height: 1;
          position: relative;
          z-index: 2;
          transition: transform 0.2s;
        }

        .reaction-btn:hover:not(.cooldown) .reaction-emoji {
          transform: scale(1.2);
        }

        .reaction-btn.selected .reaction-emoji {
          animation: emojiSpin 0.5s ease-out;
        }

        @keyframes emojiSpin {
          from {
            transform: rotate(0deg) scale(1);
          }
          to {
            transform: rotate(360deg) scale(1.2);
          }
        }

        .reaction-ripple {
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          border: 2px solid var(--reaction-color);
          opacity: 0;
          pointer-events: none;
        }

        .reaction-btn.selected .reaction-ripple {
          animation: rippleExpand 0.6s ease-out;
        }

        @keyframes rippleExpand {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
