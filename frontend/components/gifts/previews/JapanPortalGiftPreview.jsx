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
  const [phase, setPhase] = useState("drawing"); // drawing -> lit -> opening -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const litTimer = setTimeout(() => setPhase("lit"), 1500);
    const openingTimer = setTimeout(() => setPhase("opening"), JAPAN_PORTAL_DURATION_MS - 1300);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, JAPAN_PORTAL_DURATION_MS);

    timersRef.current = [litTimer, openingTimer, doneTimer];

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
      {/* Twilight mountain backdrop with cherry blossom trees flanking the
          gate, turning the torii into a recognizable Japanese landscape
          scene rather than an isolated glyph. */}
      <svg className="portal-scene" viewBox="0 0 100 110" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="portalSkyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e1033" />
            <stop offset="60%" stopColor="#4c1d3d" />
            <stop offset="100%" stopColor="#7c2d4a" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="110" fill="url(#portalSkyGradient)" />
        <path d="M0 78 Q20 60 40 76 Q55 58 68 74 Q84 56 100 72 L100 110 L0 110 Z" fill="#1a0b26" opacity="0.8" />
        {/* Sakura trees */}
        <g className="portal-tree">
          <path d="M8 100 L10 76" stroke="#3f2d20" strokeWidth="2" />
          <circle cx="7" cy="72" r="7" fill="#f9a8d4" opacity="0.85" />
          <circle cx="13" cy="68" r="5.5" fill="#fbcfe8" opacity="0.85" />
        </g>
        <g className="portal-tree">
          <path d="M92 100 L90 76" stroke="#3f2d20" strokeWidth="2" />
          <circle cx="93" cy="72" r="7" fill="#f9a8d4" opacity="0.85" />
          <circle cx="87" cy="68" r="5.5" fill="#fbcfe8" opacity="0.85" />
        </g>
      </svg>

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

        {/* Magic portal opening through the gate's inner opening —
            a bright expanding light column, the "opening" climax beyond
            just ambient background glow. */}
        <rect className="portal-opening" x="24" y="48" width="52" height="52" fill="url(#portalOpeningGradient)" />
        <defs>
          <radialGradient id="portalOpeningGradient" cx="50%" cy="20%" r="85%">
            <stop offset="0%" stopColor="rgba(255,247,237,0.95)" />
            <stop offset="55%" stopColor="rgba(251,191,36,0.55)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0)" />
          </radialGradient>
        </defs>
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
          border-radius: 10px;
        }

        .portal-scene {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
        }
        .portal-tree circle {
          animation: portal-tree-sway 4.5s ease-in-out infinite;
        }

        .portal-svg {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
        }

        .portal-opening {
          opacity: 0;
          transform-origin: 50px 74px;
          transform: scaleY(0.05);
        }
        .portal-phase-opening .portal-opening,
        .portal-phase-done .portal-opening {
          animation: portal-open-column 1.1s ease-out forwards;
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
          width: 9px;
          height: 9px;
          border-radius: 60% 0 60% 0;
          background: #fbcfe8;
          box-shadow: 0 0 5px rgba(251, 207, 232, 0.85);
          animation: portal-petal-fall linear infinite;
        }

        @keyframes portal-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes portal-tree-sway {
          0%,
          100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(1.2px);
          }
        }
        @keyframes portal-open-column {
          0% {
            opacity: 0;
            transform: scaleY(0.05);
          }
          55% {
            opacity: 1;
            transform: scaleY(1.05);
          }
          100% {
            opacity: 0.75;
            transform: scaleY(1);
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
            /* Pixel values (not %) because CSS transform percentages resolve
               against this element's own tiny box, not the stage height. */
            transform: translate(18px, 300px) rotate(220deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .portal-structure,
          .portal-beam,
          .portal-glow,
          .portal-lantern,
          .portal-petal,
          .portal-tree circle,
          .portal-opening {
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
          .portal-opening {
            opacity: 0.4;
            transform: scaleY(1);
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
