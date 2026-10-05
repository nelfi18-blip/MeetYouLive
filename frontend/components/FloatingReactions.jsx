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
      {/* Invisible tap-outside-to-close layer — only present while expanded,
          sits below the dock itself so reaction buttons remain tappable. */}
      {expanded && (
        <div
          className="reaction-dismiss-layer"
          onClick={toggleDock}
          aria-hidden="true"
        />
      )}

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

        {/* Trigger + fan/arc spread kept together so the single collapsed
            control sits in one spot and the reactions bloom outward from
            it — never a heavy horizontal bar stealing camera real estate. */}
        <div className="reaction-dock-row">
          {/* Reaction buttons — same five emojis/labels and sendReaction
              logic, arranged along a short radial arc above the toggle. */}
          {expanded && (
            <div className="reaction-fan" role="group" aria-label={t("floatingReactions.groupAria")}>
              {REACTIONS.map(({ emoji, label, color }, index) => {
                // Spread the 5 reactions across a ~110° arc centered above
                // the toggle (mobile thumb-friendly, nothing overlaps faces).
                const spreadDeg = 110;
                const startDeg = -90 - spreadDeg / 2;
                const angle = REACTIONS.length > 1
                  ? startDeg + (spreadDeg / (REACTIONS.length - 1)) * index
                  : -90;
                const radius = 78;
                const rad = (angle * Math.PI) / 180;
                const x = Math.cos(rad) * radius;
                const y = Math.sin(rad) * radius;

                return (
                  <button
                    key={label}
                    className="reaction-btn"
                    onClick={() => sendReaction(emoji, color)}
                    aria-label={t("floatingReactions.reactionAria").replace("{label}", label)}
                    type="button"
                    style={{
                      '--btn-color': color,
                      '--btn-x': `${x}px`,
                      '--btn-y': `${y}px`,
                      '--btn-delay': `${index * 0.025}s`,
                    }}
                  >
                    <span className="reaction-btn-emoji">{emoji}</span>
                    <span className="reaction-btn-glow" />
                  </button>
                );
              })}
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
        /* Transparent, full-viewport layer behind the dock so tapping
           anywhere outside the fan closes it (per spec: "tocar fuera
           también puede cerrar"), without blocking video taps otherwise. */
        .reaction-dismiss-layer {
          position: fixed;
          inset: 0;
          z-index: 9;
          background: transparent;
        }

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
           footprint over the camera. Expanding blooms the same five
           reactions outward along a short radial arc, never a heavy
           horizontal bar that eats into the stage. */
        .reaction-dock-toggle {
          width: 44px;
          height: 44px;
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
          position: relative;
          z-index: 2;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(192,132,252,0.08);
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .reaction-dock-toggle:hover {
          transform: scale(1.08);
          border-color: rgba(192, 132, 252, 0.5);
        }

        .is-expanded .reaction-dock-toggle {
          background: linear-gradient(135deg, rgba(139,92,246,0.35), rgba(217,70,239,0.3));
          border-color: rgba(217, 70, 239, 0.6);
          box-shadow: 0 4px 18px rgba(139,92,246,0.4), 0 0 24px rgba(217,70,239,0.3);
        }

        .reaction-dock-row {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0.4rem;
          pointer-events: none;
          position: relative;
        }

        /* Radial/fan spread — each reaction button is absolutely positioned
           relative to the toggle via --btn-x/--btn-y (computed in JS as a
           short arc above the control), not a horizontal strip. */
        .reaction-fan {
          position: absolute;
          right: 22px;
          bottom: 22px;
          width: 0;
          height: 0;
          pointer-events: none;
        }

        @keyframes fan-bloom {
          from {
            opacity: 0;
            transform: translate(0, 0) scale(0.4);
          }
          to {
            opacity: 1;
            transform: translate(var(--btn-x), var(--btn-y)) scale(1);
          }
        }

        .reaction-btn {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          background: rgba(15, 8, 33, 0.85);
          backdrop-filter: blur(8px) saturate(150%);
          cursor: pointer;
          pointer-events: auto;
          transform: translate(var(--btn-x), var(--btn-y));
          animation: fan-bloom 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
          animation-delay: var(--btn-delay, 0s);
          transition: border-color 0.2s ease, background 0.2s ease, filter 0.2s ease;
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
          transform: translate(var(--btn-x), var(--btn-y)) scale(1.15) translateY(-3px);
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
          transform: translate(var(--btn-x), var(--btn-y)) scale(0.95);
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

        /* Reduced motion: keep the collapsed/expand affordance (users still
           need to reach the reactions), but drop the orbiting float-up
           trajectory, wiggle and pulsing glow in favor of a simple fade. */
        @media (prefers-reduced-motion: reduce) {
          .floater {
            animation: float-up-fade 2.2s ease-out forwards;
          }

          .reaction-btn {
            animation: none;
            transform: translate(var(--btn-x), var(--btn-y));
            transition: none;
          }

          .reaction-btn:hover,
          .reaction-btn:active {
            transform: translate(var(--btn-x), var(--btn-y));
          }

          .reaction-btn:hover .reaction-btn-emoji,
          .reaction-btn:hover .reaction-btn-glow {
            animation: none;
          }
        }

        @keyframes float-up-fade {
          0% { opacity: 0; transform: translateY(0); }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-140px); }
        }
      `}</style>
    </>
  );
}
