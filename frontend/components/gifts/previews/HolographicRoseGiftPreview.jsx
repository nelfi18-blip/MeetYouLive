"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const HOLOGRAPHIC_ROSE_DURATION_MS = 2400; // Target duration: 2.4 seconds (Basic tier)
const SPARKLE_COUNT = 10;

/**
 * HolographicRoseGiftPreview — "Rosa holográfica" (150 Coins, propuesto)
 *
 * Basic-tier animated SVG scene: a layered rose silhouette whose petals
 * unfold (scale/rotate open) one ring at a time, rendered with an
 * iridescent holographic gradient that continuously hue-shifts, finished
 * with small prismatic sparkle highlights around the bloom.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function HolographicRoseGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("blooming"); // blooming -> shimmering -> closing -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const shimmerTimer = setTimeout(() => setPhase("shimmering"), 1200);
    const closingTimer = setTimeout(() => setPhase("closing"), HOLOGRAPHIC_ROSE_DURATION_MS - 500);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, HOLOGRAPHIC_ROSE_DURATION_MS);

    timersRef.current = [shimmerTimer, closingTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const sparkles = Array.from({ length: SPARKLE_COUNT }, (_, i) => {
    const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
    return {
      left: `${50 + Math.cos(angle) * 38}%`,
      top: `${48 + Math.sin(angle) * 36}%`,
      delay: `${(i % 6) * 0.15}s`,
    };
  });

  return (
    <div className={`rose-preview-stage rose-phase-${phase}`}>
      <svg className="rose-svg" viewBox="0 0 100 100" role="img" aria-label="Holographic rose gift animation">
        <defs>
          <linearGradient id="roseHoloGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0abfc" />
            <stop offset="35%" stopColor="#c084fc" />
            <stop offset="65%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#f9a8d4" />
          </linearGradient>
          <radialGradient id="roseGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(216,180,254,0.55)" />
            <stop offset="100%" stopColor="rgba(216,180,254,0)" />
          </radialGradient>
        </defs>

        <circle className="rose-glow" cx="50" cy="48" r="38" fill="url(#roseGlow)" />

        {/* Stem and leaves */}
        <path className="rose-stem" d="M50 62 L50 92" stroke="#86efac" strokeWidth="2" strokeLinecap="round" />
        <path d="M50 76 Q38 78 34 70 Q46 70 50 76 Z" fill="#4ade80" />
        <path d="M50 82 Q62 84 66 76 Q54 76 50 82 Z" fill="#4ade80" />

        {/* Full bloom group — wraps all petal rings so the graceful
            closing/exit droop at the end can be applied once, without
            restarting each petal's individual opening animation. */}
        <g className="rose-bloom">
          {/* Outer petal ring */}
          <g className="rose-ring rose-ring-outer">
            {Array.from({ length: 6 }, (_, i) => (
              <path
                key={i}
                className="rose-petal"
                d="M50 48 C40 40 38 28 50 22 C62 28 60 40 50 48 Z"
                fill="url(#roseHoloGradient)"
                opacity="0.9"
                style={{ "--rot": `${i * 60}deg`, animationDelay: `${0.5 + i * 0.07}s` }}
              />
            ))}
          </g>

          {/* Middle petal ring */}
          <g className="rose-ring rose-ring-middle">
            {Array.from({ length: 5 }, (_, i) => (
              <path
                key={i}
                className="rose-petal"
                d="M50 48 C43 42 42 34 50 28 C58 34 57 42 50 48 Z"
                fill="url(#roseHoloGradient)"
                opacity="0.95"
                style={{ "--rot": `${i * 72 + 30}deg`, animationDelay: `${0.2 + i * 0.06}s` }}
              />
            ))}
          </g>

          {/* Inner bud */}
          <g className="rose-ring rose-ring-inner">
            <path className="rose-petal" d="M50 48 C46 44 46 38 50 34 C54 38 54 44 50 48 Z" fill="#f5d0fe" style={{ "--rot": "0deg" }} />
          </g>
        </g>
      </svg>

      <div className="rose-sparkles" aria-hidden="true">
        {sparkles.map((s, i) => (
          <span key={i} className="rose-sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
        ))}
      </div>

      <style jsx>{`
        .rose-preview-stage {
          position: relative;
          width: 100%;
          max-width: 220px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
        }

        .rose-svg {
          position: relative;
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 0 8px rgba(216, 180, 254, 0.7));
        }

        .rose-phase-shimmering .rose-svg,
        .rose-phase-done .rose-svg {
          animation: rose-hue-shift 2.5s linear infinite;
        }

        .rose-ring {
          transform-origin: 50px 48px;
        }
        .rose-petal {
          transform-origin: 50px 48px;
          opacity: 0;
          transform: rotate(var(--rot, 0deg)) scale(0.2);
          animation: rose-petal-open 0.6s ease-out forwards;
        }

        .rose-bloom {
          transform-origin: 50px 48px;
        }
        .rose-phase-closing .rose-bloom,
        .rose-phase-done .rose-bloom {
          animation: rose-bloom-close 0.5s ease-in forwards;
        }

        .rose-glow {
          opacity: 0;
          animation: rose-glow-fade 1s ease-out 0.3s forwards;
        }

        .rose-sparkles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .rose-phase-shimmering .rose-sparkles,
        .rose-phase-done .rose-sparkles {
          opacity: 1;
        }
        .rose-sparkle {
          position: absolute;
          width: 4px;
          height: 4px;
          margin: -2px;
          border-radius: 50%;
          background: #fdf4ff;
          box-shadow: 0 0 7px 2px rgba(192, 132, 252, 0.9);
          animation: rose-sparkle-twinkle 1.4s ease-in-out infinite;
        }

        @keyframes rose-petal-open {
          0% {
            opacity: 0;
            transform: rotate(var(--rot, 0deg)) scale(0.2);
          }
          100% {
            opacity: 1;
            transform: rotate(var(--rot, 0deg)) scale(1);
          }
        }
        @keyframes rose-bloom-close {
          0% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
          100% {
            opacity: 0.15;
            transform: scale(0.82) rotate(-8deg);
          }
        }
        @keyframes rose-glow-fade {
          to {
            opacity: 0.8;
          }
        }
        @keyframes rose-hue-shift {
          0% {
            filter: drop-shadow(0 0 8px rgba(216, 180, 254, 0.7)) hue-rotate(0deg);
          }
          50% {
            filter: drop-shadow(0 0 14px rgba(96, 165, 250, 0.8)) hue-rotate(180deg);
          }
          100% {
            filter: drop-shadow(0 0 8px rgba(216, 180, 254, 0.7)) hue-rotate(360deg);
          }
        }
        @keyframes rose-sparkle-twinkle {
          0%,
          100% {
            opacity: 0;
            transform: scale(0.6);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rose-svg,
          .rose-petal,
          .rose-bloom,
          .rose-glow,
          .rose-sparkle {
            animation: none !important;
          }
          .rose-petal {
            opacity: 1;
            transform: rotate(var(--rot, 0deg)) scale(1);
          }
          .rose-glow {
            opacity: 0.8;
          }
          .rose-sparkles {
            opacity: 1;
          }
        }

        @media (max-width: 480px) {
          .rose-preview-stage {
            max-width: 160px;
          }
        }
      `}</style>
    </div>
  );
}
