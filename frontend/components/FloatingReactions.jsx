"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const REACTIONS = [
  { emoji: "❤️", label: "love", color: "#f43f5e" },
  { emoji: "🔥", label: "fire", color: "#fb923c" },
  { emoji: "👏", label: "clap", color: "#fbbf24" },
  { emoji: "😍", label: "wow", color: "#ec4899" },
  { emoji: "💎", label: "diamond", color: "#60a5fa" },
];

let reactionIdCounter = 0;

/**
 * FloatingReactions – shows reaction buttons and animates emojis floating up with beautiful effects
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

  const sendReaction = useCallback((emoji, color) => {
    const id = ++reactionIdCounter;
    const xOffset = Math.random() * 80 - 40; // ±40px horizontal drift
    const rotation = Math.random() * 60 - 30; // ±30deg rotation
    const scale = 0.8 + Math.random() * 0.4; // 0.8 to 1.2 scale
    
    setFloating((prev) => [...prev, { id, emoji, xOffset, rotation, scale, color }]);

    const timeout = setTimeout(() => {
      setFloating((prev) => prev.filter((r) => r.id !== id));
      timeoutsRef.current.delete(id);
    }, 3000); // Extended duration for smoother animation
    timeoutsRef.current.set(id, timeout);
  }, []);

  return (
    <>
      <div className="reactions-container">
        {/* Floating emojis with enhanced effects */}
        <div className="floaters-area" aria-hidden="true">
          {floating.map((r) => (
            <span
              key={r.id}
              className="floater"
              style={{ 
                '--x': `${r.xOffset}px`,
                '--rotation': `${r.rotation}deg`,
                '--scale': r.scale,
                '--color': r.color
              }}
            >
              {r.emoji}
            </span>
          ))}
        </div>

        {/* Reaction buttons with enhanced hover effects */}
        <div className="reaction-btns" role="group" aria-label="Reacciones">
          {REACTIONS.map(({ emoji, label, color }) => (
            <button
              key={label}
              className="reaction-btn"
              onClick={() => sendReaction(emoji, color)}
              aria-label={`Reacción ${label}`}
              type="button"
              style={{ '--btn-color': color }}
            >
              <span className="reaction-btn-emoji">{emoji}</span>
              <span className="reaction-btn-glow" />
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        .reactions-container {
          position: absolute;
          right: 1rem;
          bottom: 1rem;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.75rem;
          z-index: 10;
          pointer-events: none;
        }

        .floaters-area {
          position: relative;
          width: 60px;
          height: 200px;
          pointer-events: none;
          overflow: visible;
        }

        .floater {
          position: absolute;
          bottom: 0;
          right: 0;
          font-size: 2rem;
          animation: float-up-3d 2.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
          filter: drop-shadow(0 0 8px var(--color)) drop-shadow(0 4px 12px rgba(0,0,0,0.4));
          transform-origin: center;
          will-change: transform, opacity;
        }

        .reaction-btns {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          pointer-events: auto;
        }

        .reaction-btn {
          position: relative;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          background: rgba(15, 8, 33, 0.85);
          backdrop-filter: blur(8px) saturate(150%);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.3),
            inset 0 1px 2px rgba(255, 255, 255, 0.1);
        }
        
        .reaction-btn-glow {
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--btn-color) 0%, transparent 70%);
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 0;
        }
        
        .reaction-btn-emoji {
          font-size: 1.8rem;
          line-height: 1;
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          z-index: 1;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }

        .reaction-btn:hover {
          transform: scale(1.15) translateY(-3px);
          border-color: var(--btn-color);
          background: rgba(15, 8, 33, 0.95);
          box-shadow: 
            0 8px 24px rgba(0, 0, 0, 0.4),
            0 0 20px var(--btn-color),
            inset 0 1px 3px rgba(255, 255, 255, 0.2);
        }
        
        .reaction-btn:hover .reaction-btn-glow {
          opacity: 0.4;
          animation: pulse-glow 1.5s ease-in-out infinite;
        }
        
        .reaction-btn:hover .reaction-btn-emoji {
          transform: scale(1.2) rotate(10deg);
          animation: wiggle 0.5s ease-in-out;
        }

        .reaction-btn:active {
          transform: scale(0.95);
        }
        
        .reaction-btn:active .reaction-btn-emoji {
          transform: scale(0.9);
        }

        @keyframes float-up-3d {
          0% {
            opacity: 0;
            transform: 
              translateX(0) 
              translateY(0) 
              scale(0.5)
              rotate(0deg)
              perspective(500px)
              rotateY(0deg);
          }
          10% {
            opacity: 1;
            transform: 
              translateX(var(--x)) 
              translateY(-20px) 
              scale(var(--scale))
              rotate(var(--rotation))
              perspective(500px)
              rotateY(180deg);
          }
          50% {
            opacity: 1;
            transform: 
              translateX(var(--x)) 
              translateY(-120px) 
              scale(calc(var(--scale) * 1.1))
              rotate(calc(var(--rotation) * 1.5))
              perspective(500px)
              rotateY(360deg);
          }
          90% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
            transform: 
              translateX(calc(var(--x) * 1.3)) 
              translateY(-220px) 
              scale(calc(var(--scale) * 0.6))
              rotate(calc(var(--rotation) * 2))
              perspective(500px)
              rotateY(540deg);
          }
        }
        
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.1);
          }
        }
        
        @keyframes wiggle {
          0%, 100% {
            transform: scale(1.2) rotate(0deg);
          }
          25% {
            transform: scale(1.25) rotate(10deg);
          }
          75% {
            transform: scale(1.25) rotate(-10deg);
          }
        }
      `}</style>
    </>
  );
}
