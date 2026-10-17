"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animation configuration constants
export const CONNECTED_PLANET_DURATION_MS = 5000; // Target duration: 5 seconds
const CONNECTION_COUNT = 6;
const STAR_COUNT = 28;
const RAY_COUNT = 10;

/**
 * ConnectedPlanetGiftPreview — "Planeta conectado" (8,000 Coins, propuesto)
 *
 * Legendary-tier animated SVG scene, clearly more elaborate than the other
 * two tiers:
 *  - A continuously spinning planet with recognizable stylized continent
 *    shapes (simplified landmasses, not abstract blobs), a day/night
 *    shading terminator and a soft cloud layer for a sense of volume.
 *  - A pulsing node + traveling light "packet" on each connection arc
 *    between points around the globe, suggesting live, two-way data links
 *    rather than a single static sparkle.
 *  - A cosmic expansion finale: the globe blooms brighter and scales up
 *    slightly, multiple colored burst rings and radiating light rays
 *    sweep outward, and the whole scene closes with a graceful fade.
 *
 * Self-contained, inline (non full-screen) preview card for the isolated
 * dev preview route only. Does not touch Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the full animation cycle finishes
 */
export default function ConnectedPlanetGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("spinning"); // spinning -> expanding -> closing -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const expandTimer = setTimeout(() => setPhase("expanding"), 2600);
    const closeTimer = setTimeout(() => setPhase("closing"), 4100);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, CONNECTED_PLANET_DURATION_MS);

    timersRef.current = [expandTimer, closeTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  // Stable connection arcs between points placed around the globe's edge.
  const connections = useMemo(() => {
    return Array.from({ length: CONNECTION_COUNT }, (_, i) => {
      const angleA = (i / CONNECTION_COUNT) * Math.PI * 2;
      const angleB = ((i + 2.5) / CONNECTION_COUNT) * Math.PI * 2;
      const ax = 50 + Math.cos(angleA) * 34;
      const ay = 50 + Math.sin(angleA) * 22;
      const bx = 50 + Math.cos(angleB) * 34;
      const by = 50 + Math.sin(angleB) * 22;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2 - 14;
      return {
        d: `M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`,
        ax,
        ay,
        bx,
        by,
        delay: `${i * 0.3}s`,
      };
    });
  }, []);

  const stars = useMemo(() => {
    return Array.from({ length: STAR_COUNT }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      top: `${(i * 53) % 100}%`,
      delay: `${(i % 8) * 0.25}s`,
    }));
  }, []);

  // Radiating light rays for the cosmic expansion finale.
  const rays = useMemo(() => {
    return Array.from({ length: RAY_COUNT }, (_, i) => ({
      rotate: (360 / RAY_COUNT) * i,
      delay: `${(i % 5) * 0.06}s`,
    }));
  }, []);

  return (
    <div className={`planet-preview-stage planet-phase-${phase}`}>
      {/* Deep-space starfield, static positions (cheap, no particle physics) */}
      <div className="planet-stars" aria-hidden="true">
        {stars.map((s, i) => (
          <span key={i} className="planet-star" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
        ))}
      </div>

      {/* Radiating light rays, only visible during the cosmic expansion */}
      <div className="planet-rays" aria-hidden="true">
        {rays.map((r, i) => (
          <span
            key={i}
            className="planet-ray"
            style={{ transform: `rotate(${r.rotate}deg)`, animationDelay: r.delay }}
          />
        ))}
      </div>

      {/* Cosmic expansion burst rings */}
      <div className="planet-burst-ring" aria-hidden="true" />
      <div className="planet-burst-ring planet-burst-ring-2" aria-hidden="true" />
      <div className="planet-burst-ring planet-burst-ring-3" aria-hidden="true" />

      <svg className="planet-svg" viewBox="0 0 100 100" role="img" aria-label="Connected planet gift animation">
        <defs>
          <radialGradient id="planetBodyGradient" cx="38%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="45%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </radialGradient>
          <radialGradient id="planetAtmosphere" cx="50%" cy="50%" r="50%">
            <stop offset="75%" stopColor="rgba(96,165,250,0)" />
            <stop offset="100%" stopColor="rgba(96,165,250,0.65)" />
          </radialGradient>
          <linearGradient id="planetTerminator" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(2,6,23,0)" />
            <stop offset="60%" stopColor="rgba(2,6,23,0.15)" />
            <stop offset="100%" stopColor="rgba(2,6,23,0.75)" />
          </linearGradient>
          <clipPath id="planetClip">
            <circle cx="50" cy="50" r="28" />
          </clipPath>
        </defs>

        {/* Atmosphere halo */}
        <circle cx="50" cy="50" r="33" fill="url(#planetAtmosphere)" />

        {/* Planet body + continents, rotating together */}
        <g className="planet-globe">
          <circle cx="50" cy="50" r="28" fill="url(#planetBodyGradient)" />
          {/* Simplified, recognizable continent silhouettes */}
          <path
            className="planet-continent"
            d="M34 34 Q40 28 48 32 Q52 36 46 40 Q50 46 42 48 Q34 46 34 34 Z"
            fill="#4ade80"
          />
          <path
            className="planet-continent"
            d="M56 30 Q66 32 64 42 Q68 50 60 54 Q54 50 56 42 Q52 36 56 30 Z"
            fill="#22c55e"
          />
          <path
            className="planet-continent"
            d="M40 56 Q48 54 50 62 Q46 70 38 68 Q34 60 40 56 Z"
            fill="#4ade80"
          />
          <path
            className="planet-continent"
            d="M64 58 Q72 60 70 66 Q66 70 62 66 Q60 60 64 58 Z"
            fill="#22c55e"
          />
          {/* Polar ice caps for extra "real planet" read */}
          <path d="M42 24 Q50 22 58 24 Q50 27 42 24 Z" fill="#e0f2fe" opacity="0.85" />
          <path d="M42 76 Q50 78 58 76 Q50 73 42 76 Z" fill="#e0f2fe" opacity="0.85" />
          {/* Latitude lines for a "globe" read */}
          <ellipse cx="50" cy="50" rx="28" ry="9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
          <ellipse cx="50" cy="50" rx="28" ry="18" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
          {/* Day/night shading terminator for a sense of sphere volume */}
          <circle cx="50" cy="50" r="28" fill="url(#planetTerminator)" clipPath="url(#planetClip)" />
          {/* Soft drifting cloud wisps, slower than the globe's own spin */}
          <g className="planet-clouds" clipPath="url(#planetClip)">
            <ellipse cx="40" cy="40" rx="10" ry="3" fill="#f8fafc" opacity="0.3" />
            <ellipse cx="60" cy="58" rx="12" ry="3.5" fill="#f8fafc" opacity="0.25" />
            <ellipse cx="46" cy="66" rx="8" ry="2.5" fill="#f8fafc" opacity="0.22" />
          </g>
        </g>

        {/* Connection nodes + glowing arcs between regions of the world */}
        <g className="planet-connections">
          {connections.map((c, i) => (
            <g key={i} style={{ animationDelay: c.delay }}>
              <path
                className="planet-connection-arc"
                d={c.d}
                fill="none"
                stroke="#fbbf24"
                strokeWidth="0.8"
                style={{ animationDelay: c.delay }}
              />
              <circle className="planet-node" cx={c.ax} cy={c.ay} r="1.1" fill="#fff7d6" style={{ animationDelay: c.delay }} />
              <circle className="planet-node" cx={c.bx} cy={c.by} r="1.1" fill="#fff7d6" style={{ animationDelay: c.delay }} />
              <circle
                className="planet-pulse"
                r="1.3"
                fill="#fef3c7"
                style={{ offsetPath: `path('${c.d}')`, animationDelay: c.delay }}
              />
            </g>
          ))}
        </g>
      </svg>

      <style jsx>{`
        .planet-preview-stage {
          position: relative;
          width: 100%;
          max-width: 320px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
          overflow: visible;
        }

        .planet-stars {
          position: absolute;
          inset: -20%;
          pointer-events: none;
        }
        .planet-star {
          position: absolute;
          width: 2px;
          height: 2px;
          background: #e0f2fe;
          border-radius: 50%;
          opacity: 0.5;
          animation: planet-star-twinkle 2.4s ease-in-out infinite;
        }

        .planet-rays {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 1px;
          height: 1px;
          pointer-events: none;
          opacity: 0;
        }
        .planet-ray {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 2px;
          height: 0;
          background: linear-gradient(to bottom, rgba(251, 191, 36, 0.9), rgba(251, 191, 36, 0));
          transform-origin: top center;
        }
        .planet-phase-expanding .planet-rays {
          opacity: 1;
        }
        .planet-phase-expanding .planet-ray {
          animation: planet-ray-shoot 1s ease-out forwards;
        }

        .planet-svg {
          position: relative;
          width: 100%;
          height: 100%;
          z-index: 2;
          animation: planet-intro-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .planet-globe {
          transform-origin: 50px 50px;
          animation: planet-spin 4s linear infinite;
        }

        .planet-clouds {
          transform-origin: 50px 50px;
          animation: planet-clouds-drift 9s linear infinite;
        }

        .planet-connection-arc {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          opacity: 0;
          animation: planet-arc-pulse 2.6s ease-in-out infinite;
          filter: drop-shadow(0 0 2px rgba(251, 191, 36, 0.9));
        }

        .planet-node {
          opacity: 0;
          animation: planet-node-glow 2.6s ease-in-out infinite;
          filter: drop-shadow(0 0 2px rgba(255, 247, 214, 0.9));
        }

        .planet-pulse {
          opacity: 0;
          offset-distance: 0%;
          animation: planet-pulse-travel 2.6s ease-in-out infinite;
          filter: drop-shadow(0 0 3px rgba(254, 243, 199, 1));
        }

        .planet-burst-ring {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 40%;
          height: 40%;
          border-radius: 50%;
          border: 2px solid rgba(251, 191, 36, 0);
          z-index: 1;
          pointer-events: none;
        }

        /* Cosmic expansion: only plays once, during the "expanding" phase */
        .planet-phase-expanding .planet-globe {
          animation: planet-spin 4s linear infinite, planet-bloom 1.1s ease-out;
        }
        .planet-phase-expanding .planet-burst-ring {
          border-color: rgba(251, 191, 36, 0.9);
          animation: planet-burst-expand 1.4s ease-out forwards;
        }
        .planet-phase-expanding .planet-burst-ring-2 {
          border-color: rgba(125, 211, 252, 0.9);
          animation: planet-burst-expand 1.4s ease-out 0.25s forwards;
        }
        .planet-phase-expanding .planet-burst-ring-3 {
          border-color: rgba(192, 132, 252, 0.8);
          animation: planet-burst-expand 1.4s ease-out 0.5s forwards;
        }

        /* Graceful cinematic close: scene bathes in light before it settles */
        .planet-phase-closing .planet-svg,
        .planet-phase-closing .planet-stars,
        .planet-phase-closing .planet-burst-ring {
          animation: planet-close-fade 0.9s ease-in forwards;
        }

        @keyframes planet-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes planet-clouds-drift {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(-360deg);
          }
        }

        @keyframes planet-intro-pop {
          from {
            opacity: 0;
            transform: scale(0.7);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes planet-bloom {
          0% {
            filter: drop-shadow(0 0 0 rgba(251, 191, 36, 0));
          }
          40% {
            filter: drop-shadow(0 0 14px rgba(251, 191, 36, 0.95));
          }
          100% {
            filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.4));
          }
        }

        @keyframes planet-arc-pulse {
          0% {
            stroke-dashoffset: 60;
            opacity: 0;
          }
          35% {
            opacity: 1;
          }
          70% {
            stroke-dashoffset: 0;
            opacity: 1;
          }
          100% {
            stroke-dashoffset: -60;
            opacity: 0;
          }
        }

        @keyframes planet-node-glow {
          0%,
          100% {
            opacity: 0;
          }
          35%,
          70% {
            opacity: 1;
          }
        }

        @keyframes planet-pulse-travel {
          0% {
            offset-distance: 0%;
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            offset-distance: 100%;
            opacity: 0;
          }
        }

        @keyframes planet-star-twinkle {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.9;
          }
        }

        @keyframes planet-ray-shoot {
          0% {
            height: 0;
            opacity: 1;
          }
          100% {
            height: 60%;
            opacity: 0;
          }
        }

        @keyframes planet-burst-expand {
          0% {
            width: 40%;
            height: 40%;
            opacity: 1;
          }
          100% {
            width: 170%;
            height: 170%;
            opacity: 0;
          }
        }

        @keyframes planet-close-fade {
          to {
            opacity: 0;
            transform: scale(0.92);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .planet-globe,
          .planet-clouds,
          .planet-svg,
          .planet-star,
          .planet-ray,
          .planet-connection-arc,
          .planet-node,
          .planet-pulse,
          .planet-burst-ring,
          .planet-burst-ring-2,
          .planet-burst-ring-3 {
            animation: none !important;
          }
          .planet-connection-arc {
            stroke-dashoffset: 0;
            opacity: 0.85;
          }
          .planet-node {
            opacity: 0.9;
          }
          .planet-pulse {
            opacity: 0;
          }
          .planet-phase-closing .planet-svg,
          .planet-phase-closing .planet-stars {
            opacity: 0.2;
            transition: opacity 0.4s ease;
          }
        }

        @media (max-width: 480px) {
          .planet-preview-stage {
            max-width: 210px;
          }
        }
      `}</style>
    </div>
  );
}
