"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const REACTIONS = [
  { emoji: "❤️", label: "love" },
  { emoji: "🔥", label: "fire" },
  { emoji: "👏", label: "clap" },
  { emoji: "😍", label: "wow" },
  { emoji: "💎", label: "diamond" },
];

let reactionIdCounter = 0;

/**
 * FloatingReactions – shows reaction buttons and animates emojis floating up.
 * Props: none (self-contained)
 */
export default function FloatingReactions() {
  const [floating, setFloating] = useState([]);
  const timeoutsRef = useRef(new Map());

  useEffect(() => {
    // Clear all timeouts on unmount
    return () => {
      for (const t of timeoutsRef.current.values()) clearTimeout(t);
    };
  }, []);

  const sendReaction = useCallback((emoji) => {
    const id = ++reactionIdCounter;
    const xOffset = Math.random() * 60 - 30; // ±30px horizontal drift
    setFloating((prev) => [...prev, { id, emoji, xOffset }]);

    const timeout = setTimeout(() => {
      setFloating((prev) => prev.filter((r) => r.id !== id));
      timeoutsRef.current.delete(id);
    }, 2200);
    timeoutsRef.current.set(id, timeout);
  }, []);

  return (
    <>
      <div className="reactions-container">
        {/* Floating emojis */}
        <div className="floaters-area" aria-hidden="true">
          {floating.map((r) => (
            <span
              key={r.id}
              className="floater"
              style={{ "--x": `${r.xOffset}px` }}
            >
              {r.emoji}
            </span>
          ))}
        </div>

        {/* Reaction buttons */}
        <div className="reaction-btns" role="group" aria-label="Reacciones">
          {REACTIONS.map(({ emoji, label }) => (
            <button
              key={label}
              className="reaction-btn"
              onClick={() => sendReaction(emoji)}
              aria-label={`Reacción ${label}`}
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .reactions-container {
          position: absolute;
          right: 0.75rem;
          bottom: 0.75rem;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.5rem;
          z-index: 10;
          pointer-events: none;
        }

        .floaters-area {
          position: relative;
          width: 48px;
          height: 180px;
          pointer-events: none;
          overflow: visible;
        }

        .floater {
          position: absolute;
          bottom: 0;
          right: 0;
          font-size: 1.6rem;
          animation: floatUp 2.1s ease-out forwards;
          transform: translateX(var(--x, 0px));
          pointer-events: none;
          user-select: none;
          filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4));
        }

        @keyframes floatUp {
          0%   { opacity: 1;   transform: translateX(var(--x, 0px)) translateY(0)    scale(1);    }
          60%  { opacity: 1;   transform: translateX(var(--x, 0px)) translateY(-120px) scale(1.1); }
          100% { opacity: 0;   transform: translateX(var(--x, 0px)) translateY(-180px) scale(0.8); }
        }

        .reaction-btns {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          pointer-events: auto;
        }

        .reaction-btn {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(10,4,22,0.75);
          backdrop-filter: blur(10px);
          font-size: 1.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.12s ease, background 0.15s;
          -webkit-tap-highlight-color: transparent;
          line-height: 1;
        }

        .reaction-btn:hover {
          background: rgba(224,64,251,0.18);
          border-color: rgba(224,64,251,0.4);
          transform: scale(1.18);
        }

        .reaction-btn:active {
          transform: scale(0.88);
        }
      `}</style>
    </>
  );
}
