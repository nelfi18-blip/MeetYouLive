"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const EIFFEL_TOWER_DURATION_MS = 3000; // Target duration: 3 seconds
const SPARK_COUNT = 14;
// Lamps dotted along the three tiers, lighting up bottom-to-top once "lit".
const LAMPS = [
  { cx: 24, cy: 128, delay: "0s" },
  { cx: 76, cy: 128, delay: "0.05s" },
  { cx: 32, cy: 95, delay: "0.12s" },
  { cx: 68, cy: 95, delay: "0.16s" },
  { cx: 37, cy: 60, delay: "0.22s" },
  { cx: 63, cy: 60, delay: "0.26s" },
  { cx: 50, cy: 36, delay: "0.3s" },
];

/**
 * EiffelTowerGiftPreview — "Torre Eiffel mágica" (300 Coins, propuesto)
 *
 * A recognizable, three-tiered Eiffel Tower silhouette (SVG) that:
 *  - Builds itself progressively, tier by tier (stroke-dasharray reveal of
 *    the outer lattice silhouette, followed by the platform ledges and
 *    cross-bracing fading in), as if being assembled beam by beam.
 *  - Lights up with a warm golden glow and a string of lamps that switch
 *    on bottom-to-top once fully built, plus a pulsing beacon at the tip.
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
 */
export default function EiffelTowerGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("building"); // building -> assembled -> lit -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const assembledTimer = setTimeout(() => setPhase("assembled"), 1500);
    const litTimer = setTimeout(() => setPhase("lit"), 2000);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, EIFFEL_TOWER_DURATION_MS);

    timersRef.current = [assembledTimer, litTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const sparks = Array.from({ length: SPARK_COUNT }, (_, i) => ({
    cx: 50 + Math.cos((i / SPARK_COUNT) * Math.PI * 2) * (20 + (i % 3) * 7),
    cy: 60 + Math.sin((i / SPARK_COUNT) * Math.PI * 2) * (28 + (i % 2) * 6),
    delay: `${(i % SPARK_COUNT) * 0.12}s`,
  }));

  return (
    <div className={`eiffel-preview-stage eiffel-phase-${phase}`}>
      <svg
        className="eiffel-svg"
        viewBox="0 0 100 140"
        role="img"
        aria-label="Eiffel Tower gift animation"
      >
        <defs>
          <linearGradient id="eiffelGoldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="55%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <radialGradient id="eiffelGlow" cx="50%" cy="60%" r="55%">
            <stop offset="0%" stopColor="rgba(251,191,36,0.55)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0)" />
          </radialGradient>
        </defs>

        {/* Golden ambient glow behind the tower, fades in once "lit" */}
        <circle className="eiffel-glow" cx="50" cy="72" r="58" fill="url(#eiffelGlow)" />

        {/* Ground line */}
        <line x1="4" y1="132" x2="96" y2="132" stroke="rgba(251,191,36,0.4)" strokeWidth="1" />

        {/* Recognizable three-tier silhouette: antenna -> upper tier -> mid
            platform -> lower arch legs, revealed progressively via a single
            stroke-dasharray sweep (measured path length ≈ 459). */}
        <path
          className="eiffel-structure"
          d="M50 4
             L52 18 L54 32 L58 35
             L63 58 L68 62
             L84 128 L76 128
             L63 66 L58 63
             L53.5 48 L50 44
             L46.5 48 L42 63
             L37 66 L24 128
             L16 128 L32 62
             L37 58 L42 35
             L46 32 L48 18 Z"
          fill="none"
          stroke="url(#eiffelGoldGradient)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Platform ledges, fade/draw in just after the outer silhouette */}
        <g className="eiffel-platforms" stroke="url(#eiffelGoldGradient)" fill="none">
          <line className="eiffel-ledge eiffel-ledge-1" x1="42" y1="35" x2="58" y2="35" strokeWidth="1.1" />
          <line className="eiffel-ledge eiffel-ledge-2" x1="37" y1="58" x2="63" y2="58" strokeWidth="1.3" />
          <line className="eiffel-ledge eiffel-ledge-3" x1="32" y1="62" x2="68" y2="62" strokeWidth="1.3" />
        </g>

        {/* Lattice cross braces for recognizability, fade in with the tower */}
        <g className="eiffel-braces" stroke="url(#eiffelGoldGradient)" strokeWidth="0.5" fill="none">
          <path d="M37 58 L46.5 48" />
          <path d="M63 58 L53.5 48" />
          <path d="M32 62 L42 63" />
          <path d="M68 62 L58 63" />
          <path d="M32 62 L55 90 L68 62" />
          <path d="M32 62 L45 90 L68 62" />
          <path d="M28 90 L72 90" />
          <path d="M24 128 L55 100 L76 128" />
          <path d="M24 128 L45 100 L76 128" />
          <path d="M20 109 L80 109" />
        </g>

        {/* Lamps along the tiers, light up bottom-to-top once "lit" */}
        <g className="eiffel-lamps" aria-hidden="true">
          {LAMPS.map((l, i) => (
            <circle
              key={i}
              className="eiffel-lamp"
              cx={l.cx}
              cy={l.cy}
              r="1.3"
              fill="#fff7d6"
              style={{ animationDelay: l.delay }}
            />
          ))}
        </g>

        {/* Beacon at the top, pulses once lit */}
        <circle className="eiffel-beacon" cx="50" cy="4" r="2" fill="#fff7d6" />
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
          max-width: 240px;
          aspect-ratio: 5 / 7;
          margin: 0 auto;
          perspective: 700px;
        }

        .eiffel-svg {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          animation: eiffel-soft-tilt 3s ease-in-out 1;
        }

        .eiffel-structure {
          stroke-dasharray: 460;
          stroke-dashoffset: 460;
          animation: eiffel-draw 1.5s ease-out forwards;
          filter: drop-shadow(0 0 0 rgba(251, 191, 36, 0));
          transition: filter 0.6s ease;
        }

        .eiffel-platforms,
        .eiffel-braces {
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .eiffel-phase-assembled .eiffel-platforms,
        .eiffel-phase-lit .eiffel-platforms,
        .eiffel-phase-done .eiffel-platforms,
        .eiffel-phase-assembled .eiffel-braces,
        .eiffel-phase-lit .eiffel-braces,
        .eiffel-phase-done .eiffel-braces {
          opacity: 1;
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

        .eiffel-lamp {
          opacity: 0;
        }
        .eiffel-phase-lit .eiffel-lamp,
        .eiffel-phase-done .eiffel-lamp {
          opacity: 1;
          animation: eiffel-lamp-blink 1.3s ease-in-out infinite;
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
        @keyframes eiffel-lamp-blink {
          0%,
          100% {
            opacity: 0.55;
            filter: drop-shadow(0 0 1px rgba(255, 247, 214, 0.5));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 4px rgba(255, 247, 214, 1));
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
          .eiffel-platforms,
          .eiffel-braces,
          .eiffel-glow,
          .eiffel-beacon,
          .eiffel-lamp,
          .eiffel-spark {
            animation: none !important;
            transition: none !important;
          }
          .eiffel-structure {
            stroke-dashoffset: 0;
          }
          .eiffel-platforms,
          .eiffel-braces,
          .eiffel-glow,
          .eiffel-sparks,
          .eiffel-beacon,
          .eiffel-lamp {
            opacity: 1;
          }
        }

        @media (max-width: 480px) {
          .eiffel-preview-stage {
            max-width: 170px;
          }
        }
      `}</style>
    </div>
  );
}
