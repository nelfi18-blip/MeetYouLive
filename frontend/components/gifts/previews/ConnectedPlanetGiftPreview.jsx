"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animation configuration constants
export const CONNECTED_PLANET_DURATION_MS = 5000; // Target duration: 5 seconds
const CONNECTION_COUNT = 6;
const STAR_COUNT = 24;

/**
 * ConnectedPlanetGiftPreview — "Planeta conectado" (8,000 Coins, propuesto)
 *
 * Legendary-tier animated SVG scene:
 *  - A continuously spinning planet with recognizable stylized continent
 *    shapes (simplified landmasses, not abstract blobs).
 *  - Glowing arcs ("connections") pulsing between points around the globe,
 *    suggesting a connected world.
 *  - A cosmic expansion ring burst that blooms outward and a final
 *    graceful close/fade — clearly a bigger, longer production than the
 *    other two tiers.
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
      return { d: `M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`, delay: `${i * 0.3}s` };
    });
  }, []);

  const stars = useMemo(() => {
    return Array.from({ length: STAR_COUNT }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      top: `${(i * 53) % 100}%`,
      delay: `${(i % 8) * 0.25}s`,
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

      {/* Cosmic expansion burst ring */}
      <div className="planet-burst-ring" aria-hidden="true" />
      <div className="planet-burst-ring planet-burst-ring-2" aria-hidden="true" />

      <svg className="planet-svg" viewBox="0 0 100 100" role="img" aria-label="Connected planet gift animation">
        <defs>
          <radialGradient id="planetBodyGradient" cx="38%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="55%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </radialGradient>
          <radialGradient id="planetAtmosphere" cx="50%" cy="50%" r="50%">
            <stop offset="75%" stopColor="rgba(96,165,250,0)" />
            <stop offset="100%" stopColor="rgba(96,165,250,0.65)" />
          </radialGradient>
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
          {/* Latitude lines for a "globe" read */}
          <ellipse cx="50" cy="50" rx="28" ry="9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
          <ellipse cx="50" cy="50" rx="28" ry="18" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
        </g>

        {/* Connection points + glowing arcs between regions of the world */}
        <g className="planet-connections">
          {connections.map((c, i) => (
            <path
              key={i}
              className="planet-connection-arc"
              d={c.d}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="0.8"
              style={{ animationDelay: c.delay }}
            />
          ))}
        </g>
      </svg>

      <style jsx>{`
        .planet-preview-stage {
          position: relative;
          width: 100%;
          max-width: 300px;
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

        .planet-connection-arc {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          opacity: 0;
          animation: planet-arc-pulse 2.6s ease-in-out infinite;
          filter: drop-shadow(0 0 2px rgba(251, 191, 36, 0.9));
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
        .planet-phase-expanding .planet-burst-ring {
          animation: planet-burst-expand 1.4s ease-out forwards;
        }
        .planet-phase-expanding .planet-burst-ring-2 {
          animation: planet-burst-expand 1.4s ease-out 0.25s forwards;
        }

        /* Graceful close: whole scene fades + settles instead of a hard cut */
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

        @keyframes planet-star-twinkle {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.9;
          }
        }

        @keyframes planet-burst-expand {
          0% {
            width: 40%;
            height: 40%;
            border-color: rgba(251, 191, 36, 0.9);
            opacity: 1;
          }
          100% {
            width: 160%;
            height: 160%;
            border-color: rgba(251, 191, 36, 0);
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
          .planet-svg,
          .planet-star,
          .planet-connection-arc,
          .planet-burst-ring,
          .planet-burst-ring-2 {
            animation: none !important;
          }
          .planet-connection-arc {
            stroke-dashoffset: 0;
            opacity: 0.85;
          }
          .planet-phase-closing .planet-svg,
          .planet-phase-closing .planet-stars {
            opacity: 0.2;
            transition: opacity 0.4s ease;
          }
        }

        @media (max-width: 480px) {
          .planet-preview-stage {
            max-width: 200px;
          }
        }
      `}</style>
    </div>
  );
}
