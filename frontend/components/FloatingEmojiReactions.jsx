"use client";

import { useState, useEffect } from "react";

/**
 * FloatingEmojiReactions - Floating emoji reactions system for live streams
 * Shows emoji reactions that float up from the bottom like TikTok/Instagram Live
 *
 * Extra (all optional, backward-compatible) props added for reuse outside
 * of Live — e.g. Social Rooms — without changing any existing behavior:
 * - `bottomOffset`: px to reserve at the bottom of the container (e.g. so
 *   the animation area doesn't visually overlap a chat input bar below it).
 *   Defaults to 0 — identical to the original full-height container.
 * - `reducedMotion`: when true, renders a reduced, non-floating fade
 *   presentation (respects prefers-reduced-motion) instead of the intense
 *   floating animation. Defaults to false — original behavior.
 * - `ariaLabel`: accessible label for the live region announcing reactions.
 */
export default function FloatingEmojiReactions({
  reactions = [],
  bottomOffset = 0,
  reducedMotion = false,
  ariaLabel,
}) {
  const [activeReactions, setActiveReactions] = useState([]);

  useEffect(() => {
    if (reactions.length > 0) {
      if (reducedMotion) {
        // Reduced presentation: no random floating motion, just a brief
        // fade-in/out badge per reaction.
        const newReactions = reactions.map((emoji, index) => ({
          id: `${Date.now()}-${index}-${Math.random()}`,
          emoji,
          duration: 1600,
        }));

        setActiveReactions((prev) => [...prev, ...newReactions]);

        newReactions.forEach((reaction) => {
          setTimeout(() => {
            setActiveReactions((prev) => prev.filter((r) => r.id !== reaction.id));
          }, reaction.duration);
        });
        return;
      }

      // Add new reactions with unique IDs and random positions
      const newReactions = reactions.map((emoji, index) => ({
        id: `${Date.now()}-${index}-${Math.random()}`,
        emoji,
        x: 10 + Math.random() * 80, // Random x position (10-90%)
        delay: Math.random() * 200, // Random delay for staggered effect
        duration: 3000 + Math.random() * 2000, // Random duration (3-5s)
        size: 2 + Math.random() * 2, // Random size multiplier (2-4rem)
      }));

      setActiveReactions((prev) => [...prev, ...newReactions]);

      // Remove reactions after their duration
      newReactions.forEach((reaction) => {
        setTimeout(() => {
          setActiveReactions((prev) => prev.filter((r) => r.id !== reaction.id));
        }, reaction.duration + reaction.delay);
      });
    }
  }, [reactions, reducedMotion]);

  return (
    <>
      <div
        className={`floating-reactions-container ${reducedMotion ? "reduced-motion" : ""}`}
        style={{ "--bottom-offset": `${bottomOffset}px` }}
        aria-live="polite"
        aria-label={ariaLabel}
      >
        {activeReactions.map((reaction) =>
          reducedMotion ? (
            <div
              key={reaction.id}
              className="reduced-emoji"
              style={{ animationDuration: `${reaction.duration}ms` }}
            >
              {reaction.emoji}
            </div>
          ) : (
            <div
              key={reaction.id}
              className="floating-emoji"
              style={{
                left: `${reaction.x}%`,
                fontSize: `${reaction.size}rem`,
                animationDelay: `${reaction.delay}ms`,
                animationDuration: `${reaction.duration}ms`,
              }}
            >
              {reaction.emoji}
            </div>
          )
        )}
      </div>

      <style jsx>{`
        .floating-reactions-container {
          position: absolute;
          top: 0;
          bottom: var(--bottom-offset, 0);
          left: 0;
          right: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 100;
        }

        .floating-emoji {
          position: absolute;
          bottom: -10%;
          animation: floatUp forwards;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.3));
        }

        @keyframes floatUp {
          0% {
            bottom: -10%;
            opacity: 0;
            transform: translateY(0) scale(0.8) rotate(0deg);
          }
          10% {
            opacity: 1;
            transform: translateY(-50px) scale(1) rotate(10deg);
          }
          50% {
            opacity: 1;
            transform: translateY(-40vh) scale(1.1) rotate(-10deg);
          }
          80% {
            opacity: 0.8;
          }
          100% {
            bottom: 110%;
            opacity: 0;
            transform: translateY(-80vh) scale(0.6) rotate(20deg);
          }
        }

        /* Reduced-motion presentation: no floating/translate movement, a
           small fading badge stack anchored to the top-right instead. */
        .floating-reactions-container.reduced-motion {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: flex-start;
          gap: 0.3rem;
          padding: 0.5rem;
        }
        .reduced-emoji {
          font-size: 1.5rem;
          line-height: 1;
          animation: fadeInOut forwards;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        @keyframes fadeInOut {
          0% { opacity: 0; }
          15% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
