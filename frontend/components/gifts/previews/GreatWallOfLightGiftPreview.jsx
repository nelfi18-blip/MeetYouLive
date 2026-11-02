"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const GREAT_WALL_OF_LIGHT_DURATION_MS = 5000; // Target duration: 5 seconds (Super tier)
const SEGMENT_COUNT = 9;

/**
 * GreatWallOfLightGiftPreview — "Gran Muralla de luz" (3,000 Coins, propuesto)
 *
 * Super-tier animated SVG scene: a winding, crenellated wall silhouette
 * climbs across stylized hills with two recognizable watchtowers, drawn
 * progressively. Once built, a wave of golden light sweeps segment by
 * segment from left to right across the crenellations and watchtowers,
 * then the whole wall performs one full-length luminous sweep beam as a
 * finale before settling into a steady glow.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function GreatWallOfLightGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("building"); // building -> lighting -> sweep -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const lightingTimer = setTimeout(() => setPhase("lighting"), 1600);
    const sweepTimer = setTimeout(() => setPhase("sweep"), 3400);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, GREAT_WALL_OF_LIGHT_DURATION_MS);

    timersRef.current = [lightingTimer, sweepTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const segments = Array.from({ length: SEGMENT_COUNT }, (_, i) => ({
    x: 6 + i * 10.5,
    delay: `${i * 0.12}s`,
  }));

  return (
    <div className={`wall-preview-stage wall-phase-${phase}`}>
      <svg className="wall-svg" viewBox="0 0 110 60" role="img" aria-label="Great Wall of Light gift animation">
        <defs>
          <linearGradient id="wallStoneGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="60%" stopColor="#a16207" />
            <stop offset="100%" stopColor="#422006" />
          </linearGradient>
        </defs>

        {/* Stylized rolling hills the wall climbs across */}
        <path d="M0 50 Q20 38 40 48 Q60 36 80 46 Q96 38 110 46 L110 60 L0 60 Z" fill="#422006" opacity="0.5" />

        {/* Wall path drawn progressively via stroke-dasharray */}
        <path
          className="wall-path"
          d="M4 46 Q20 34 36 44 Q56 32 76 42 Q92 34 106 40"
          fill="none"
          stroke="url(#wallStoneGradient)"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Watchtowers at two key points along the wall */}
        <g className="wall-tower">
          <rect x="18" y="26" width="8" height="12" fill="url(#wallStoneGradient)" />
          <polygon points="16,26 28,26 22,18" fill="#fcd34d" />
        </g>
        <g className="wall-tower">
          <rect x="78" y="24" width="8" height="12" fill="url(#wallStoneGradient)" />
          <polygon points="76,24 88,24 82,16" fill="#fcd34d" />
        </g>

        {/* Crenellation segments, light up left-to-right like a wave */}
        <g className="wall-segments">
          {segments.map((s, i) => (
            <rect
              key={i}
              className="wall-segment"
              x={s.x}
              y="38"
              width="5"
              height="4"
              fill="#fef3c7"
              style={{ animationDelay: s.delay }}
            />
          ))}
        </g>

        {/* Full-length finale sweep beam */}
        <rect className="wall-sweep-beam" x="-14" y="30" width="14" height="22" fill="url(#wallStoneGradient)" opacity="0" />
      </svg>

      <style jsx>{`
        .wall-preview-stage {
          position: relative;
          width: 100%;
          max-width: 300px;
          aspect-ratio: 11 / 6;
          margin: 0 auto;
          overflow: hidden;
        }

        .wall-svg {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .wall-path {
          stroke-dasharray: 140;
          stroke-dashoffset: 140;
          animation: wall-draw 1.6s ease-out forwards;
        }

        .wall-tower {
          opacity: 0;
          animation: wall-tower-fade 0.6s ease-out 1.3s forwards;
        }

        .wall-segment {
          opacity: 0;
        }
        .wall-phase-lighting .wall-segment,
        .wall-phase-sweep .wall-segment,
        .wall-phase-done .wall-segment {
          animation: wall-segment-light 1.6s ease-in-out infinite;
        }

        .wall-sweep-beam {
          mix-blend-mode: screen;
        }
        .wall-phase-sweep .wall-sweep-beam,
        .wall-phase-done .wall-sweep-beam {
          animation: wall-sweep-pass 1.1s ease-in-out forwards;
        }

        @keyframes wall-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes wall-tower-fade {
          to {
            opacity: 1;
          }
        }
        @keyframes wall-segment-light {
          0%,
          100% {
            opacity: 0.4;
            filter: drop-shadow(0 0 1px rgba(254, 243, 199, 0.5));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 5px rgba(254, 243, 199, 1));
          }
        }
        @keyframes wall-sweep-pass {
          0% {
            opacity: 0.9;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(260%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .wall-path,
          .wall-tower,
          .wall-segment,
          .wall-sweep-beam {
            animation: none !important;
          }
          .wall-path {
            stroke-dashoffset: 0;
          }
          .wall-tower,
          .wall-segment {
            opacity: 1;
          }
          .wall-sweep-beam {
            opacity: 0;
          }
        }

        @media (max-width: 480px) {
          .wall-preview-stage {
            max-width: 220px;
          }
        }
      `}</style>
    </div>
  );
}
