"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const JAPAN_PORTAL_DURATION_MS = 3500; // Target duration: 3.5 seconds (Premium tier)
const PETAL_COUNT = 12;

/**
 * JapanPortalGiftPreview — "Portal de Japón" (500 Coins, propuesto)
 *
 * Premium-tier animated SVG scene: a recognizable red torii gate is drawn
 * progressively (stroke-dasharray reveal), then its lacquered red/orange
 * gradient and two paper lanterns glow warmly, while sakura (cherry
 * blossom) petals drift down through the gate on a gentle sway, closing
 * with a soft radiant pulse through the gate's opening.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function JapanPortalGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("drawing"); // drawing -> lit -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const litTimer = setTimeout(() => setPhase("lit"), 1500);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, JAPAN_PORTAL_DURATION_MS);

    timersRef.current = [litTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const petals = Array.from({ length: PETAL_COUNT }, (_, i) => ({
    left: `${10 + ((i * 7) % 80)}%`,
    delay: `${(i % 8) * 0.3}s`,
    duration: `${2.4 + (i % 3) * 0.4}s`,
  }));

  return (
    <div className={`portal-preview-stage portal-phase-${phase}`}>
      <svg className="portal-svg" viewBox="0 0 100 110" role="img" aria-label="Japan torii portal gift animation">
        <defs>
          <linearGradient id="toriiGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="50%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>
          <radialGradient id="portalGlow" cx="50%" cy="55%" r="55%">
            <stop offset="0%" stopColor="rgba(248,113,113,0.55)" />
            <stop offset="100%" stopColor="rgba(248,113,113,0)" />
          </radialGradient>
        </defs>

        <circle className="portal-glow" cx="50" cy="60" r="46" fill="url(#portalGlow)" />

        {/* Recognizable Torii gate silhouette drawn via a single stroke sweep */}
        <path
          className="portal-structure"
          d="M10 30 L90 30
             M6 36 L94 36
             M24 36 L24 100
             M76 36 L76 100
             M30 48 L70 48
             M18 48 L82 48"
          fill="none"
          stroke="url(#toriiGradient)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Central support beam, recognizable torii detail */}
        <line className="portal-beam" x1="50" y1="36" x2="50" y2="48" stroke="url(#toriiGradient)" strokeWidth="3" />

        {/* Paper lanterns, glow once "lit" */}
        <g className="portal-lanterns">
          <ellipse className="portal-lantern" cx="34" cy="56" rx="4" ry="6" fill="#fde68a" />
          <ellipse className="portal-lantern" cx="66" cy="56" rx="4" ry="6" fill="#fde68a" />
        </g>
      </svg>

      <div className="portal-petals" aria-hidden="true">
        {petals.map((p, i) => (
          <span
            key={i}
            className="portal-petal"
            style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
          />
        ))}
      </div>

      <style jsx>{`
        .portal-preview-stage {
          position: relative;
          width: 100%;
          max-width: 240px;
          aspect-ratio: 10 / 11;
          margin: 0 auto;
          overflow: hidden;
        }

        .portal-svg {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .portal-structure {
          stroke-dasharray: 420;
          stroke-dashoffset: 420;
          animation: portal-draw 1.5s ease-out forwards;
        }
        .portal-beam {
          opacity: 0;
          animation: portal-fade-in 0.5s ease-out 1.4s forwards;
        }

        .portal-phase-lit .portal-structure,
        .portal-phase-done .portal-structure {
          filter: drop-shadow(0 0 6px rgba(248, 113, 113, 0.9));
        }

        .portal-glow {
          opacity: 0;
          transition: opacity 0.8s ease;
        }
        .portal-phase-lit .portal-glow,
        .portal-phase-done .portal-glow {
          opacity: 1;
          animation: portal-glow-pulse 2s ease-in-out infinite;
        }

        .portal-lantern {
          opacity: 0.3;
        }
        .portal-phase-lit .portal-lantern,
        .portal-phase-done .portal-lantern {
          animation: portal-lantern-glow 1.4s ease-in-out infinite;
        }

        .portal-petals {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .portal-phase-lit .portal-petals,
        .portal-phase-done .portal-petals {
          opacity: 1;
        }
        .portal-petal {
          position: absolute;
          top: -10%;
          width: 6px;
          height: 6px;
          border-radius: 60% 0 60% 0;
          background: #fbcfe8;
          box-shadow: 0 0 4px rgba(251, 207, 232, 0.8);
          animation: portal-petal-fall linear infinite;
        }

        @keyframes portal-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes portal-fade-in {
          to {
            opacity: 1;
          }
        }
        @keyframes portal-glow-pulse {
          0%,
          100% {
            opacity: 0.75;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes portal-lantern-glow {
          0%,
          100% {
            opacity: 0.6;
            filter: drop-shadow(0 0 2px rgba(253, 230, 138, 0.6));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 7px rgba(253, 230, 138, 1));
          }
        }
        @keyframes portal-petal-fall {
          0% {
            opacity: 0;
            transform: translate(0, 0) rotate(0deg);
          }
          10% {
            opacity: 1;
          }
          100% {
            opacity: 0.2;
            transform: translate(18px, 115%) rotate(220deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .portal-structure,
          .portal-beam,
          .portal-glow,
          .portal-lantern,
          .portal-petal {
            animation: none !important;
          }
          .portal-structure {
            stroke-dashoffset: 0;
          }
          .portal-beam,
          .portal-glow,
          .portal-petals {
            opacity: 1;
          }
        }

        @media (max-width: 480px) {
          .portal-preview-stage {
            max-width: 170px;
          }
        }
      `}</style>
    </div>
  );
}
