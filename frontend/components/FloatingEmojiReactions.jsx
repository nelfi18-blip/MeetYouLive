"use client";

import { useState, useEffect } from "react";

/**
 * FloatingEmojiReactions - Floating emoji reactions system for live streams
 * Shows emoji reactions that float up from the bottom like TikTok/Instagram Live
 */
export default function FloatingEmojiReactions({ reactions = [] }) {
  const [activeReactions, setActiveReactions] = useState([]);

  useEffect(() => {
    if (reactions.length > 0) {
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
  }, [reactions]);

  return (
    <>
      <div className="floating-reactions-container">
        {activeReactions.map((reaction) => (
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
        ))}
      </div>

      <style jsx>{`
        .floating-reactions-container {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 100%;
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
      `}</style>
    </>
  );
}
