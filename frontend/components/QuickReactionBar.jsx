"use client";

import { useState, useEffect } from "react";

// Default reaction cooldown duration in milliseconds
const REACTION_COOLDOWN_MS = 1000;

// Default reactions — unchanged from the original Live design.
const DEFAULT_REACTIONS = [
  { emoji: "❤️", label: "Love", color: "#f87171" },
  { emoji: "👍", label: "Like", color: "#60a5fa" },
  { emoji: "😂", label: "LOL", color: "#fbbf24" },
  { emoji: "😮", label: "Wow", color: "#a78bfa" },
  { emoji: "🔥", label: "Fire", color: "#f97316" },
  { emoji: "💎", label: "Gems", color: "#22d3ee" },
];

/**
 * QuickReactionBar - Quick reaction buttons for live streams
 * Allows viewers to send emoji reactions with a single tap
 *
 * Extra (all optional, backward-compatible) props added for reuse outside
 * of Live — e.g. Social Rooms — without changing any existing behavior:
 * - `reactions`: override the emoji set (defaults to the original Live set).
 * - `cooldownMs`: override the cooldown duration (defaults to 1000ms).
 * - `variant`: "fixed" (default, original floating/fixed layout) or
 *   "inline" (flows within the page layout instead of a fixed overlay —
 *   used by Social Rooms so the bar never covers chat/tabs/nav/modals).
 * - `reducedMotion`: when true, skips the intense pop/spin/ripple
 *   animations (defaults to false — original behavior).
 * - `ariaLabel`: optional accessible label for the reaction group.
 */
export default function QuickReactionBar({
  onReact,
  position = "bottom",
  reactions: reactionsProp,
  cooldownMs = REACTION_COOLDOWN_MS,
  variant = "fixed",
  reducedMotion = false,
  ariaLabel,
}) {
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [cooldown, setCooldown] = useState(false);

  const reactions = reactionsProp || DEFAULT_REACTIONS;

  const handleReact = (emoji) => {
    if (cooldown) return;

    setSelectedEmoji(emoji);
    setCooldown(true);

    if (onReact) {
      onReact(emoji);
    }

    // Animate selection
    setTimeout(() => setSelectedEmoji(null), reducedMotion ? 0 : 300);

    // Cooldown
    setTimeout(() => setCooldown(false), cooldownMs);
  };

  return (
    <>
      <div
        className={`quick-reaction-bar ${variant === "fixed" ? position : "quick-reaction-bar--inline"} ${reducedMotion ? "reduced-motion" : ""}`}
        role="group"
        aria-label={ariaLabel}
      >
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

        /* Inline variant — flows within the page layout instead of a fixed
           overlay. Used by Social Rooms so the bar never covers chat input,
           tabs, navigation, GiftPanel or modals. */
        .quick-reaction-bar--inline {
          position: static;
          z-index: auto;
          animation: none;
          flex-wrap: wrap;
        }

        /* Reduced-motion variant — skip intense pop/spin/ripple animations
           while keeping the reaction fully functional. */
        .reduced-motion {
          animation: none;
        }
        .reduced-motion .reaction-btn.selected {
          animation: none;
        }
        .reduced-motion .reaction-btn.selected .reaction-emoji {
          animation: none;
        }
        .reduced-motion .reaction-btn.selected .reaction-ripple {
          animation: none;
        }
      `}</style>
    </>
  );
}
