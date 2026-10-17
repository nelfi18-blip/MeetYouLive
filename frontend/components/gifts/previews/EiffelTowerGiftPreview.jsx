"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const EIFFEL_TOWER_DURATION_MS = 3000; // Target duration: 3 seconds
const SPARK_COUNT = 14;

/**
 * EiffelTowerGiftPreview — "Torre Eiffel mágica" (300 Coins, propuesto)
 *
 * A stylized Eiffel Tower drawn as an animated SVG that:
 *  - Draws itself progressively (stroke-dasharray reveal), as if being built
 *    beam by beam.
 *  - Lights up with a warm golden glow once fully drawn.
 *  - Sparkles with small golden flares around the structure.
 *  - Performs one slow, gentle 3D-ish tilt/rotation (rotateY) — never a hard
 *    spin — to suggest depth without heavy 3D libraries.
 *
 * This is a self-contained, inline (non full-screen) preview card: it does
 * not take over the viewport, does not touch Coins/catalog logic, and is
 * only ever mounted from the isolated dev preview route.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 *  - playKey: change this value to force a replay (remount-friendly)
 */
export default function EiffelTowerGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("building"); // building -> lit -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const litTimer = setTimeout(() => setPhase("lit"), 1400);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, EIFFEL_TOWER_DURATION_MS);

    timersRef.current = [litTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const sparks = Array.from({ length: SPARK_COUNT }, (_, i) => ({
    cx: 50 + Math.cos((i / SPARK_COUNT) * Math.PI * 2) * (18 + (i % 3) * 6),
    cy: 60 + Math.sin((i / SPARK_COUNT) * Math.PI * 2) * (22 + (i % 2) * 5),
    delay: `${(i % SPARK_COUNT) * 0.12}s`,
  }));

  return (
    <div className={`eiffel-preview-stage eiffel-phase-${phase}`}>
      <svg
        className="eiffel-svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label="Eiffel Tower gift animation"
      >
        <defs>
          <linearGradient id="eiffelGoldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="55%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <radialGradient id="eiffelGlow" cx="50%" cy="55%" r="55%">
            <stop offset="0%" stopColor="rgba(251,191,36,0.55)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0)" />
          </radialGradient>
        </defs>

        {/* Golden ambient glow behind the tower, fades in once "lit" */}
        <circle className="eiffel-glow" cx="50" cy="55" r="42" fill="url(#eiffelGlow)" />

        {/* Ground line */}
        <line x1="20" y1="92" x2="80" y2="92" stroke="rgba(251,191,36,0.4)" strokeWidth="1" />

        {/* Stylized tower silhouette, path reveals progressively via dash offset */}
        <path
          className="eiffel-structure"
          d="M50 8
             L58 34 L68 34 L56 46
             L64 60 L71 60 L58 70
             L66 92 L59 92 L52 72
             L48 72 L41 92 L34 92
             L42 70 L29 60 L36 60
             L44 46 L32 34 L42 34 Z"
          fill="none"
          stroke="url(#eiffelGoldGradient)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Cross braces for recognizability */}
        <g className="eiffel-structure eiffel-braces" stroke="url(#eiffelGoldGradient)" strokeWidth="1" fill="none">
          <path d="M38 70 L62 70" />
          <path d="M34 60 L66 60" />
          <path d="M36 46 L64 46" />
        </g>

        {/* Beacon at the top, pulses once lit */}
        <circle className="eiffel-beacon" cx="50" cy="8" r="2.2" fill="#fff7d6" />
      </svg>

      {/* Golden sparkle flares */}
      <div className="eiffel-sparks" aria-hidden="true">
        {sparks.map((s, i) => (
          <span
            key={i}
            className="eiffel-spark"
            style={{ left: `${s.cx}%`, top: `${s.cy}%`, animationDelay: s.delay }}
          />
        ))}
      </div>

      <style jsx>{`
        .eiffel-preview-stage {
          position: relative;
          width: 100%;
          max-width: 260px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
          perspective: 600px;
        }

        .eiffel-svg {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          animation: eiffel-soft-tilt 3s ease-in-out 1;
        }

        .eiffel-structure {
          stroke-dasharray: 420;
          stroke-dashoffset: 420;
          animation: eiffel-draw 1.4s ease-out forwards;
          filter: drop-shadow(0 0 0 rgba(251, 191, 36, 0));
          transition: filter 0.6s ease;
        }

        .eiffel-braces {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: eiffel-draw-braces 0.8s ease-out 1.1s forwards;
        }

        .eiffel-phase-lit .eiffel-structure,
        .eiffel-phase-done .eiffel-structure {
          filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.85));
        }

        .eiffel-glow {
          opacity: 0;
          transition: opacity 0.8s ease;
        }
        .eiffel-phase-lit .eiffel-glow,
        .eiffel-phase-done .eiffel-glow {
          opacity: 1;
          animation: eiffel-glow-pulse 2s ease-in-out infinite;
        }

        .eiffel-beacon {
          opacity: 0;
        }
        .eiffel-phase-lit .eiffel-beacon,
        .eiffel-phase-done .eiffel-beacon {
          opacity: 1;
          animation: eiffel-beacon-blink 1.1s ease-in-out infinite;
        }

        .eiffel-sparks {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.6s ease;
        }
        .eiffel-phase-lit .eiffel-sparks,
        .eiffel-phase-done .eiffel-sparks {
          opacity: 1;
        }

        .eiffel-spark {
          position: absolute;
          width: 4px;
          height: 4px;
          margin: -2px;
          border-radius: 50%;
          background: #fff3c4;
          box-shadow: 0 0 8px 2px rgba(251, 191, 36, 0.9);
          animation: eiffel-spark-twinkle 1.6s ease-in-out infinite;
        }

        @keyframes eiffel-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes eiffel-draw-braces {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes eiffel-soft-tilt {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(10deg);
          }
          100% {
            transform: rotateY(0deg);
          }
        }
        @keyframes eiffel-glow-pulse {
          0%,
          100% {
            opacity: 0.75;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes eiffel-beacon-blink {
          0%,
          100% {
            opacity: 0.4;
            filter: drop-shadow(0 0 2px rgba(255, 247, 214, 0.6));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 10px rgba(255, 247, 214, 1));
          }
        }
        @keyframes eiffel-spark-twinkle {
          0%,
          100% {
            opacity: 0;
            transform: scale(0.6);
          }
          50% {
            opacity: 1;
            transform: scale(1.3);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .eiffel-svg,
          .eiffel-structure,
          .eiffel-braces,
          .eiffel-glow,
          .eiffel-beacon,
          .eiffel-spark {
            animation: none !important;
            transition: none !important;
          }
          .eiffel-structure,
          .eiffel-braces {
            stroke-dashoffset: 0;
          }
          .eiffel-glow,
          .eiffel-sparks,
          .eiffel-beacon {
            opacity: 1;
          }
        }

        @media (max-width: 480px) {
          .eiffel-preview-stage {
            max-width: 180px;
          }
        }
      `}</style>
    </div>
  );
}
