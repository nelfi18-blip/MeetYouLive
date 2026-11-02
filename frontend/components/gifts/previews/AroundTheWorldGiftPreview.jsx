"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animation configuration constants
export const AROUND_THE_WORLD_DURATION_MS = 6000; // Target duration: 6 seconds (Super tier, top-of-catalog)
const RING_COUNT = 4;
const RAY_COUNT = 14;
const STAR_COUNT = 24;

/**
 * AroundTheWorldGiftPreview — "Vuelta al Mundo" (15,000 Coins, propuesto)
 *
 * Super-tier, top-of-catalog animated SVG scene: a stylized globe with
 * recognizable continents spins while a small glowing plane icon circles
 * it along a dashed flight path, leaving a luminous ribbon trail that
 * gradually wraps the entire globe. Once the plane completes its full
 * orbit, the scene erupts into a grand multi-ring, multi-color firework
 * finale with radiating light rays before a graceful cinematic fade.
 *
 * Deliberately the most elaborate of the twelve "MYL World & Beyond"
 * concepts (highest proposed Coin value), reusing the same spherical
 * globe/continents technique as the existing Connected Planet concept but
 * adding the circling flight path + ribbon trail + firework finale on top.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function AroundTheWorldGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("orbiting"); // orbiting -> finale -> closing -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const finaleTimer = setTimeout(() => setPhase("finale"), 3600);
    const closingTimer = setTimeout(() => setPhase("closing"), 5200);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, AROUND_THE_WORLD_DURATION_MS);

    timersRef.current = [finaleTimer, closingTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const rays = useMemo(
    () =>
      Array.from({ length: RAY_COUNT }, (_, i) => ({
        rotate: (360 / RAY_COUNT) * i,
        delay: `${(i % 6) * 0.05}s`,
      })),
    []
  );

  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        left: `${(i * 31) % 100}%`,
        top: `${(i * 47) % 100}%`,
        delay: `${(i % 8) * 0.22}s`,
      })),
    []
  );

  return (
    <div className={`atw-preview-stage atw-phase-${phase}`}>
      <div className="atw-stars" aria-hidden="true">
        {stars.map((s, i) => (
          <span key={i} className="atw-star" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
        ))}
      </div>

      <div className="atw-rays" aria-hidden="true">
        {rays.map((r, i) => (
          <span key={i} className="atw-ray" style={{ transform: `rotate(${r.rotate}deg)`, animationDelay: r.delay }} />
        ))}
      </div>

      {Array.from({ length: RING_COUNT }, (_, i) => (
        <div key={i} className={`atw-burst-ring atw-burst-ring-${i + 1}`} aria-hidden="true" />
      ))}

      <svg className="atw-svg" viewBox="0 0 100 100" role="img" aria-label="Around the World gift animation">
        <defs>
          <radialGradient id="atwGlobeGradient" cx="38%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="45%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0c4a6e" />
          </radialGradient>
        </defs>

        <g className="atw-globe">
          <circle cx="50" cy="50" r="26" fill="url(#atwGlobeGradient)" />
          <path d="M34 36 Q42 30 48 36 Q44 42 38 44 Q32 42 34 36 Z" fill="#4ade80" />
          <path d="M58 32 Q68 34 64 44 Q58 48 54 42 Q54 36 58 32 Z" fill="#22c55e" />
          <path d="M40 58 Q48 56 48 64 Q42 68 38 62 Q38 58 40 58 Z" fill="#4ade80" />
          <path d="M60 60 Q68 62 64 68 Q58 68 58 62 Q58 60 60 60 Z" fill="#22c55e" />
          <ellipse cx="50" cy="50" rx="26" ry="8" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
          <ellipse cx="50" cy="50" rx="26" ry="17" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
        </g>

        {/* Dashed flight path circling the globe */}
        <ellipse className="atw-flight-path" cx="50" cy="50" rx="38" ry="18" fill="none" stroke="#fde68a" strokeWidth="0.8" strokeDasharray="2 2" />

        {/* Luminous ribbon trail that wraps the globe as the plane orbits */}
        <ellipse className="atw-ribbon" cx="50" cy="50" rx="38" ry="18" fill="none" stroke="#fbbf24" strokeWidth="1.6" />

        {/* Small plane icon traveling along the flight path */}
        <g className="atw-plane">
          <path d="M0 0 L5 -1.6 L1.6 0 L5 1.6 Z" fill="#fef3c7" transform="translate(-2,0)" />
        </g>
      </svg>

      <style jsx>{`
        .atw-preview-stage {
          position: relative;
          width: 100%;
          max-width: 320px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
          overflow: visible;
        }

        .atw-stars {
          position: absolute;
          inset: -15%;
          pointer-events: none;
        }
        .atw-star {
          position: absolute;
          width: 2px;
          height: 2px;
          background: #e0f2fe;
          border-radius: 50%;
          opacity: 0.4;
          animation: atw-star-twinkle 2.3s ease-in-out infinite;
        }

        .atw-rays {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 1px;
          height: 1px;
          pointer-events: none;
          opacity: 0;
        }
        .atw-ray {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 2px;
          height: 0;
          background: linear-gradient(to bottom, rgba(251, 191, 36, 0.95), rgba(251, 191, 36, 0));
          transform-origin: top center;
        }
        .atw-phase-finale .atw-rays {
          opacity: 1;
        }
        .atw-phase-finale .atw-ray {
          animation: atw-ray-shoot 1.1s ease-out forwards;
        }

        .atw-burst-ring {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 50%;
          height: 50%;
          border-radius: 50%;
          border: 2px solid rgba(251, 191, 36, 0);
          pointer-events: none;
        }
        .atw-phase-finale .atw-burst-ring-1 {
          border-color: rgba(251, 191, 36, 0.9);
          animation: atw-burst-expand 1.5s ease-out forwards;
        }
        .atw-phase-finale .atw-burst-ring-2 {
          border-color: rgba(125, 211, 252, 0.9);
          animation: atw-burst-expand 1.5s ease-out 0.2s forwards;
        }
        .atw-phase-finale .atw-burst-ring-3 {
          border-color: rgba(192, 132, 252, 0.85);
          animation: atw-burst-expand 1.5s ease-out 0.4s forwards;
        }
        .atw-phase-finale .atw-burst-ring-4 {
          border-color: rgba(74, 222, 128, 0.8);
          animation: atw-burst-expand 1.5s ease-out 0.6s forwards;
        }

        .atw-svg {
          position: relative;
          width: 100%;
          height: 100%;
          z-index: 2;
        }

        .atw-globe {
          transform-origin: 50px 50px;
          animation: atw-globe-spin 5s linear infinite;
        }

        .atw-flight-path {
          opacity: 0.5;
        }

        .atw-ribbon {
          stroke-dasharray: 190;
          stroke-dashoffset: 190;
          filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.9));
          animation: atw-ribbon-wrap 3.6s linear forwards;
        }

        .atw-plane {
          offset-path: path("M88 50 A38 18 0 1 1 12 50 A38 18 0 1 1 88 50");
          offset-rotate: auto;
          animation: atw-plane-orbit 3.6s linear forwards;
          filter: drop-shadow(0 0 3px rgba(254, 243, 199, 0.9));
        }

        .atw-phase-finale .atw-globe {
          animation: atw-globe-spin 5s linear infinite, atw-globe-bloom 1.2s ease-out;
        }

        .atw-phase-closing .atw-svg,
        .atw-phase-closing .atw-stars,
        .atw-phase-closing .atw-burst-ring {
          animation: atw-close-fade 0.8s ease-in forwards;
        }

        @keyframes atw-globe-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes atw-globe-bloom {
          0% {
            filter: drop-shadow(0 0 0 rgba(251, 191, 36, 0));
          }
          45% {
            filter: drop-shadow(0 0 16px rgba(251, 191, 36, 1));
          }
          100% {
            filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.4));
          }
        }
        @keyframes atw-ribbon-wrap {
          0% {
            stroke-dashoffset: 190;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes atw-plane-orbit {
          0% {
            offset-distance: 0%;
          }
          100% {
            offset-distance: 100%;
          }
        }
        @keyframes atw-star-twinkle {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.9;
          }
        }
        @keyframes atw-ray-shoot {
          0% {
            height: 0;
            opacity: 1;
          }
          100% {
            height: 65%;
            opacity: 0;
          }
        }
        @keyframes atw-burst-expand {
          0% {
            width: 50%;
            height: 50%;
            opacity: 1;
          }
          100% {
            width: 185%;
            height: 185%;
            opacity: 0;
          }
        }
        @keyframes atw-close-fade {
          to {
            opacity: 0;
            transform: scale(0.9);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .atw-globe,
          .atw-ribbon,
          .atw-plane,
          .atw-star,
          .atw-ray,
          .atw-burst-ring,
          .atw-svg {
            animation: none !important;
          }
          .atw-ribbon {
            stroke-dashoffset: 0;
          }
          .atw-plane {
            offset-distance: 100%;
          }
          .atw-rays,
          .atw-burst-ring {
            opacity: 0;
          }
        }

        @media (max-width: 480px) {
          .atw-preview-stage {
            max-width: 230px;
          }
        }
      `}</style>
    </div>
  );
}
