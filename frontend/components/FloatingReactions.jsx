"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const REACTIONS = [
  { emoji: "❤️", label: "love", color: "#f43f5e" },
  { emoji: "🔥", label: "fire", color: "#fb923c" },
  { emoji: "👏", label: "clap", color: "#fbbf24" },
  { emoji: "😍", label: "wow", color: "#ec4899" },
  { emoji: "💎", label: "diamond", color: "#60a5fa" },
];

// How long the expanded reaction dock stays open after the last tap before
// auto-collapsing back to the compact trigger. Keeps the dock out of the
// way of the camera/participant identity most of the time.
const DOCK_AUTO_COLLAPSE_MS = 3500;

let reactionIdCounter = 0;

/**
 * FloatingReactions – compact, expandable reactions dock. Collapsed by
 * default to a single small trigger so it never covers a meaningful part
 * of a Multi-Guest camera; tapping it reveals the same five reactions
 * (unchanged emojis/behavior) in a compact row that auto-collapses.
 * Props: none (self-contained)
 */
export default function FloatingReactions() {
  const { t } = useLanguage();
  const [floating, setFloating] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const timeoutsRef = useRef(new Map());
  const collapseTimeoutRef = useRef(null);

  useEffect(() => {
    // Clear all timeouts on unmount
    return () => {
      for (const t of timeoutsRef.current.values()) clearTimeout(t);
      if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    };
  }, []);

  const scheduleAutoCollapse = useCallback(() => {
    if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    collapseTimeoutRef.current = setTimeout(() => {
      setExpanded(false);
      collapseTimeoutRef.current = null;
    }, DOCK_AUTO_COLLAPSE_MS);
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

    // Reacting keeps the dock open a little longer so a viewer can tap
    // several reactions with one hand before it tucks itself away again.
    scheduleAutoCollapse();
  }, [scheduleAutoCollapse]);

  const toggleDock = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) {
        scheduleAutoCollapse();
      } else if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
      return next;
    });
  }, [scheduleAutoCollapse]);

  return (
    <>
      <div className={`reactions-container${expanded ? " is-expanded" : ""}`}>
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

        {/* Trigger + expandable row kept together so the reaction strip
            pops out horizontally next to the toggle instead of stacking
            into a tall column over the camera. */}
        <div className="reaction-dock-row">
          {/* Reaction buttons with enhanced hover effects — same emojis and
              sendReaction logic, only shown while the dock is expanded. */}
          {expanded && (
            <div className="reaction-btns" role="group" aria-label={t("floatingReactions.groupAria")}>
              {REACTIONS.map(({ emoji, label, color }) => (
                <button
                  key={label}
                  className="reaction-btn"
                  onClick={() => sendReaction(emoji, color)}
                  aria-label={t("floatingReactions.reactionAria").replace("{label}", label)}
                  type="button"
                  style={{ '--btn-color': color }}
                >
                  <span className="reaction-btn-emoji">{emoji}</span>
                  <span className="reaction-btn-glow" />
                </button>
              ))}
            </div>
          )}

          {/* Compact trigger — collapsed state keeps the footprint to a
              single small button so the dock barely covers the camera. */}
          <button
            type="button"
            className="reaction-dock-toggle"
            onClick={toggleDock}
            aria-expanded={expanded}
            aria-label={t("floatingReactions.groupAria")}
          >
            <span aria-hidden="true">{expanded ? "✕" : "❤️"}</span>
          </button>
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
          gap: 0.5rem;
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

        /* Compact collapsed trigger — small, thumb-reachable, minimal
           footprint over the camera. Expanding reveals the same five
           reactions in a horizontal strip so it never grows into a tall
           column that covers a Multi-Guest tile. */
        .reaction-dock-toggle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(15, 8, 33, 0.72);
          backdrop-filter: blur(10px) saturate(150%);
          color: #fff;
          font-size: 1.05rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .reaction-dock-toggle:hover {
          transform: scale(1.08);
          border-color: rgba(244, 63, 94, 0.5);
        }

        .is-expanded .reaction-dock-toggle {
          background: rgba(244, 63, 94, 0.22);
          border-color: rgba(244, 63, 94, 0.55);
        }

        .reaction-dock-row {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0.4rem;
          pointer-events: none;
        }

        .reaction-btns {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0.4rem;
          pointer-events: auto;
          background: rgba(10, 5, 22, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          padding: 0.3rem;
          backdrop-filter: blur(10px);
          animation: dockPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes dockPop {
          from { opacity: 0; transform: scale(0.85) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .reaction-btn {
          position: relative;
          width: 38px;
          height: 38px;
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
          font-size: 1.3rem;
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
