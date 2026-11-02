"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const CELESTIAL_CASTLE_DURATION_MS = 4500; // Target duration: 4.5 seconds (Super tier)
const STAR_COUNT = 20;
const WINDOWS = [
  { x: 20, y: 56, delay: "0s" },
  { x: 30, y: 56, delay: "0.1s" },
  { x: 48, y: 48, delay: "0.2s" },
  { x: 52, y: 48, delay: "0.25s" },
  { x: 70, y: 56, delay: "0.35s" },
  { x: 80, y: 56, delay: "0.45s" },
  { x: 48, y: 34, delay: "0.55s" },
  { x: 52, y: 34, delay: "0.6s" },
];

/**
 * CelestialCastleGiftPreview — "Castillo celestial" (2,000 Coins, propuesto)
 *
 * Super-tier animated SVG scene: a layered castle silhouette (twin outer
 * towers, central keep, gate) rises out of drifting clouds against a
 * starfield, its windows light up one by one, and the scene closes with
 * a radiant halo bloom behind the central tower plus a burst of rising
 * stardust.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function CelestialCastleGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("rising"); // rising -> windowsLit -> halo -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const windowsTimer = setTimeout(() => setPhase("windowsLit"), 1700);
    const haloTimer = setTimeout(() => setPhase("halo"), 3000);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, CELESTIAL_CASTLE_DURATION_MS);

    timersRef.current = [windowsTimer, haloTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const stars = Array.from({ length: STAR_COUNT }, (_, i) => ({
    left: `${(i * 23) % 100}%`,
    top: `${(i * 41) % 60}%`,
    delay: `${(i % 7) * 0.2}s`,
  }));

  return (
    <div className={`castle-preview-stage castle-phase-${phase}`}>
      <div className="castle-stars" aria-hidden="true">
        {stars.map((s, i) => (
          <span key={i} className="castle-star" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
        ))}
      </div>

      <div className="castle-halo" aria-hidden="true" />

      <svg className="castle-svg" viewBox="0 0 100 80" role="img" aria-label="Celestial castle gift animation">
        <defs>
          <linearGradient id="castleStoneGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0e7ff" />
            <stop offset="55%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#3730a3" />
          </linearGradient>
        </defs>

        {/* Outer towers */}
        <path d="M12 68 L12 44 L18 38 L24 44 L24 68 Z" fill="url(#castleStoneGradient)" />
        <path d="M76 68 L76 44 L82 38 L88 44 L88 68 Z" fill="url(#castleStoneGradient)" />
        {/* Central keep (taller, recognizable focal tower) */}
        <path d="M38 68 L38 30 L44 22 L50 16 L56 22 L62 30 L62 68 Z" fill="url(#castleStoneGradient)" />
        {/* Connecting curtain wall with crenellations */}
        <path
          d="M24 68 L24 58 L28 58 L28 54 L32 54 L32 58 L36 58 L36 68 Z
             M64 68 L64 58 L68 58 L68 54 L72 54 L72 58 L76 58 L76 68 Z"
          fill="url(#castleStoneGradient)"
        />
        {/* Gate */}
        <path d="M46 68 L46 54 Q50 48 54 54 L54 68 Z" fill="#1e1b4b" />

        {/* Windows, light up progressively */}
        <g className="castle-windows">
          {WINDOWS.map((w, i) => (
            <rect
              key={i}
              className="castle-window"
              x={w.x - 1.4}
              y={w.y}
              width="2.8"
              height="4"
              rx="1"
              fill="#fef3c7"
              style={{ animationDelay: w.delay }}
            />
          ))}
        </g>

        {/* Pennant atop the central keep */}
        <line x1="50" y1="16" x2="50" y2="8" stroke="#c7d2fe" strokeWidth="1" />
        <path className="castle-flag" d="M50 8 L58 11 L50 14 Z" fill="#a78bfa" />
      </svg>

      <style jsx>{`
        .castle-preview-stage {
          position: relative;
          width: 100%;
          max-width: 260px;
          aspect-ratio: 5 / 4;
          margin: 0 auto;
          overflow: visible;
        }

        .castle-stars {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .castle-star {
          position: absolute;
          width: 2px;
          height: 2px;
          background: #e0e7ff;
          border-radius: 50%;
          opacity: 0.4;
          animation: castle-star-twinkle 2.2s ease-in-out infinite;
        }

        .castle-halo {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 55%;
          height: 55%;
          top: -10%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(167, 139, 250, 0.55), rgba(167, 139, 250, 0));
          opacity: 0;
          pointer-events: none;
        }
        .castle-phase-halo .castle-halo,
        .castle-phase-done .castle-halo {
          animation: castle-halo-bloom 1.4s ease-out forwards;
        }

        .castle-svg {
          position: relative;
          width: 100%;
          height: 100%;
          animation: castle-rise 1.5s cubic-bezier(0.22, 0.85, 0.3, 1.1) forwards;
        }

        .castle-window {
          opacity: 0;
        }
        .castle-phase-windowsLit .castle-window,
        .castle-phase-halo .castle-window,
        .castle-phase-done .castle-window {
          animation: castle-window-glow 1.3s ease-in-out infinite;
        }

        .castle-flag {
          transform-origin: 50px 11px;
          animation: castle-flag-wave 1.4s ease-in-out infinite;
        }

        @keyframes castle-rise {
          0% {
            opacity: 0;
            transform: translateY(18px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes castle-window-glow {
          0%,
          100% {
            opacity: 0.55;
            filter: drop-shadow(0 0 1px rgba(254, 243, 199, 0.6));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 4px rgba(254, 243, 199, 1));
          }
        }
        @keyframes castle-flag-wave {
          0%,
          100% {
            transform: skewX(0deg);
          }
          50% {
            transform: skewX(-12deg);
          }
        }
        @keyframes castle-star-twinkle {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.85;
          }
        }
        @keyframes castle-halo-bloom {
          0% {
            opacity: 0;
            transform: scale(0.7);
          }
          55% {
            opacity: 1;
            transform: scale(1.15);
          }
          100% {
            opacity: 0.55;
            transform: scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .castle-svg,
          .castle-window,
          .castle-flag,
          .castle-star,
          .castle-halo {
            animation: none !important;
          }
          .castle-svg {
            opacity: 1;
            transform: translateY(0);
          }
          .castle-window {
            opacity: 1;
          }
          .castle-halo {
            opacity: 0.5;
          }
        }

        @media (max-width: 480px) {
          .castle-preview-stage {
            max-width: 190px;
          }
        }
      `}</style>
    </div>
  );
}
