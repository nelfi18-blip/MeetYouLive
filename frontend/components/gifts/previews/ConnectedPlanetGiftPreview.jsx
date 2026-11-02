"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animation configuration constants
export const CONNECTED_PLANET_DURATION_MS = 5000; // Target duration: 5 seconds
const CONNECTION_COUNT = 6;
const NEAR_STAR_COUNT = 18;
const FAR_STAR_COUNT = 30;
const RAY_COUNT = 12;
const CONFETTI_COUNT = 18;

// Landmark "connected cities" — small glowing pins placed on recognizable
// continent locations, pulsing to suggest a live global network rather
// than a plain spinning sphere.
const LANDMARKS = [
  { cx: 41, cy: 42, delay: "0s" },
  { cx: 61, cy: 38, delay: "0.4s" },
  { cx: 45, cy: 62, delay: "0.8s" },
  { cx: 66, cy: 60, delay: "1.2s" },
];

/**
 * ConnectedPlanetGiftPreview — "Planeta conectado" (8,000 Coins, propuesto)
 *
 * Legendary-tier animated scene, redesigned per the "cinematic, not a
 * plain sphere" creative direction: a deep-space backdrop with layered
 * violet/magenta nebula clouds and a two-depth parallax starfield frames
 * a larger, more detailed globe — varied recognizable landmasses with
 * subtle terrain shading, polar caps, drifting cloud wisps, a day/night
 * terminator and a directional "sunlit edge" rim light for volumetric
 * depth. Four pulsing landmark pins mark connected cities, glowing
 * luminous arcs sweep live data packets between them, and the finale is
 * a cosmic network flash — every arc brightens together, colored
 * confetti-like particles and rings burst outward — before a graceful
 * fade leaves a soft ambient afterglow.
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

  const nearStars = useMemo(
    () =>
      Array.from({ length: NEAR_STAR_COUNT }, (_, i) => ({
        left: `${(i * 29) % 100}%`,
        top: `${(i * 47) % 100}%`,
        delay: `${(i % 7) * 0.3}s`,
      })),
    []
  );

  const farStars = useMemo(
    () =>
      Array.from({ length: FAR_STAR_COUNT }, (_, i) => ({
        left: `${(i * 13) % 100}%`,
        top: `${(i * 19) % 100}%`,
        delay: `${(i % 9) * 0.22}s`,
      })),
    []
  );

  // Radiating light rays for the cosmic expansion finale.
  const rays = useMemo(() => {
    return Array.from({ length: RAY_COUNT }, (_, i) => ({
      rotate: (360 / RAY_COUNT) * i,
      delay: `${(i % 5) * 0.06}s`,
    }));
  }, []);

  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        rotate: (360 / CONFETTI_COUNT) * i,
        color: ["#fbbf24", "#c084fc", "#60a5fa", "#f472b6"][i % 4],
        delay: `${(i % 6) * 0.07}s`,
      })),
    []
  );

  return (
    <div className={`planet-preview-stage planet-phase-${phase}`}>
      {/* Deep-space nebula clouds, layered violet/magenta/blue */}
      <div className="planet-nebula" aria-hidden="true">
        <span className="planet-nebula-blob planet-nebula-1" />
        <span className="planet-nebula-blob planet-nebula-2" />
        <span className="planet-nebula-blob planet-nebula-3" />
      </div>

      {/* Two-depth parallax starfield: far (small, dim) + near (bigger, bright) */}
      <div className="planet-stars planet-stars-far" aria-hidden="true">
        {farStars.map((s, i) => (
          <span key={i} className="planet-star planet-star-far" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
        ))}
      </div>
      <div className="planet-stars planet-stars-near" aria-hidden="true">
        {nearStars.map((s, i) => (
          <span key={i} className="planet-star planet-star-near" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
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

      {/* Confetti-like particles for the network-flash finale */}
      <div className="planet-confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="planet-confetti-piece"
            style={{ "--r": `${c.rotate}deg`, background: c.color, animationDelay: c.delay }}
          />
        ))}
      </div>

      {/* Cosmic expansion burst rings */}
      <div className="planet-burst-ring" aria-hidden="true" />
      <div className="planet-burst-ring planet-burst-ring-2" aria-hidden="true" />
      <div className="planet-burst-ring planet-burst-ring-3" aria-hidden="true" />

      <svg className="planet-svg" viewBox="0 0 100 100" role="img" aria-label="Connected planet gift animation">
        <defs>
          <radialGradient id="planetBodyGradient" cx="36%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="35%" stopColor="#38bdf8" />
            <stop offset="65%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </radialGradient>
          <radialGradient id="planetAtmosphere" cx="50%" cy="50%" r="50%">
            <stop offset="72%" stopColor="rgba(96,165,250,0)" />
            <stop offset="100%" stopColor="rgba(125,211,252,0.7)" />
          </radialGradient>
          <radialGradient id="planetRimLight" cx="30%" cy="28%" r="45%">
            <stop offset="0%" stopColor="rgba(240,249,255,0.9)" />
            <stop offset="100%" stopColor="rgba(240,249,255,0)" />
          </radialGradient>
          <linearGradient id="planetTerminator" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(2,6,23,0)" />
            <stop offset="55%" stopColor="rgba(2,6,23,0.2)" />
            <stop offset="100%" stopColor="rgba(2,6,23,0.8)" />
          </linearGradient>
          <linearGradient id="planetArcGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
          <clipPath id="planetClip">
            <circle cx="50" cy="50" r="30" />
          </clipPath>
        </defs>

        {/* Atmosphere halo */}
        <circle cx="50" cy="50" r="35" fill="url(#planetAtmosphere)" />

        {/* Planet body + continents, rotating together */}
        <g className="planet-globe">
          <circle cx="50" cy="50" r="30" fill="url(#planetBodyGradient)" />

          {/* Simplified but more detailed, recognizable continent silhouettes */}
          <path
            className="planet-continent"
            d="M30 32 Q38 24 48 28 Q56 30 54 38 Q60 40 56 48 Q60 54 52 56 Q44 60 38 52 Q30 50 32 42 Q26 38 30 32 Z"
            fill="#4ade80"
          />
          <path
            className="planet-continent"
            d="M58 26 Q70 28 70 38 Q76 44 70 52 Q72 60 62 60 Q56 56 58 46 Q52 38 58 26 Z"
            fill="#22c55e"
          />
          <path
            className="planet-continent"
            d="M36 60 Q46 58 50 66 Q48 74 38 74 Q30 68 36 60 Z"
            fill="#4ade80"
          />
          <path
            className="planet-continent"
            d="M62 62 Q72 64 72 72 Q66 76 60 72 Q58 66 62 62 Z"
            fill="#22c55e"
          />
          {/* Darker terrain patches (mountain ranges) for extra surface texture */}
          <path d="M40 36 Q44 34 47 37 Q45 41 41 40 Z" fill="#15803d" opacity="0.7" />
          <path d="M62 34 Q67 33 68 38 Q64 41 61 38 Z" fill="#15803d" opacity="0.7" />
          {/* Polar ice caps for extra "real planet" read */}
          <path d="M40 23 Q50 20 60 23 Q50 27 40 23 Z" fill="#e0f2fe" opacity="0.9" />
          <path d="M40 80 Q50 83 60 80 Q50 76 40 80 Z" fill="#e0f2fe" opacity="0.9" />
          {/* Latitude lines for a "globe" read */}
          <ellipse cx="50" cy="50" rx="30" ry="9.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />
          <ellipse cx="50" cy="50" rx="30" ry="19" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="0.6" />
          {/* Day/night shading terminator for a sense of sphere volume */}
          <circle cx="50" cy="50" r="30" fill="url(#planetTerminator)" clipPath="url(#planetClip)" />
          {/* Directional sunlit rim-light for volumetric depth */}
          <circle cx="50" cy="50" r="30" fill="url(#planetRimLight)" clipPath="url(#planetClip)" opacity="0.55" />
          {/* Soft drifting cloud wisps, slower than the globe's own spin */}
          <g className="planet-clouds" clipPath="url(#planetClip)">
            <ellipse cx="38" cy="38" rx="11" ry="3.2" fill="#f8fafc" opacity="0.32" />
            <ellipse cx="62" cy="58" rx="13" ry="3.6" fill="#f8fafc" opacity="0.26" />
            <ellipse cx="46" cy="68" rx="9" ry="2.6" fill="#f8fafc" opacity="0.22" />
            <ellipse cx="58" cy="30" rx="7" ry="2.2" fill="#f8fafc" opacity="0.2" />
          </g>
          {/* Connected-city landmark pins, pulsing on recognizable landmasses */}
          <g className="planet-landmarks" clipPath="url(#planetClip)">
            {LANDMARKS.map((l, i) => (
              <circle
                key={i}
                className="planet-landmark-pin"
                cx={l.cx}
                cy={l.cy}
                r="1.4"
                fill="#fff7d6"
                style={{ animationDelay: l.delay }}
              />
            ))}
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
                stroke="url(#planetArcGradient)"
                strokeWidth="0.9"
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
          max-width: 400px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
          overflow: visible;
        }

        .planet-nebula {
          position: absolute;
          inset: -15%;
          pointer-events: none;
          filter: blur(14px);
          z-index: 0;
        }
        .planet-nebula-blob {
          position: absolute;
          width: 55%;
          height: 55%;
          border-radius: 50%;
          opacity: 0.45;
          animation: planet-nebula-drift 16s ease-in-out infinite alternate;
        }
        .planet-nebula-1 {
          left: -5%;
          top: 0%;
          background: radial-gradient(circle, rgba(192, 132, 252, 0.8), rgba(192, 132, 252, 0));
        }
        .planet-nebula-2 {
          right: -10%;
          top: 10%;
          background: radial-gradient(circle, rgba(244, 114, 182, 0.7), rgba(244, 114, 182, 0));
          animation-delay: 3s;
        }
        .planet-nebula-3 {
          left: 20%;
          bottom: -10%;
          background: radial-gradient(circle, rgba(96, 165, 250, 0.7), rgba(96, 165, 250, 0));
          animation-delay: 6s;
        }

        .planet-stars {
          position: absolute;
          inset: -20%;
          pointer-events: none;
          z-index: 1;
        }
        .planet-star {
          position: absolute;
          border-radius: 50%;
          animation: planet-star-twinkle 2.4s ease-in-out infinite;
        }
        .planet-star-far {
          width: 1px;
          height: 1px;
          background: #94a3b8;
          opacity: 0.35;
        }
        .planet-star-near {
          width: 2px;
          height: 2px;
          background: #e0f2fe;
          opacity: 0.6;
        }

        .planet-rays {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 1px;
          height: 1px;
          pointer-events: none;
          opacity: 0;
          z-index: 2;
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

        .planet-confetti {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 1px;
          height: 1px;
          pointer-events: none;
          opacity: 0;
          z-index: 3;
        }
        .planet-phase-expanding .planet-confetti {
          opacity: 1;
        }
        .planet-confetti-piece {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 3px;
          height: 3px;
          border-radius: 1px;
          transform-origin: center;
        }
        .planet-phase-expanding .planet-confetti-piece {
          animation: planet-confetti-burst 1.3s ease-out forwards;
        }

        .planet-svg {
          position: relative;
          width: 100%;
          height: 100%;
          z-index: 4;
          animation: planet-intro-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .planet-globe {
          transform-origin: 50px 50px;
          animation: planet-spin 5s linear infinite;
        }

        .planet-clouds {
          transform-origin: 50px 50px;
          animation: planet-clouds-drift 9s linear infinite;
        }

        .planet-landmark-pin {
          opacity: 0;
          animation: planet-landmark-pulse 1.8s ease-in-out infinite;
          filter: drop-shadow(0 0 2px rgba(255, 247, 214, 0.9));
        }

        .planet-connection-arc {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          opacity: 0;
          animation: planet-arc-pulse 2.6s ease-in-out infinite;
          filter: drop-shadow(0 0 2px rgba(251, 191, 36, 0.9));
        }
        .planet-phase-expanding .planet-connection-arc {
          animation: planet-arc-pulse 2.6s ease-in-out infinite, planet-arc-flash 1.1s ease-out;
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
          border: 3.5px solid rgba(251, 191, 36, 0);
          box-shadow: 0 0 10px rgba(251, 191, 36, 0);
          z-index: 2;
          pointer-events: none;
        }

        /* Cosmic expansion: only plays once, during the "expanding" phase */
        .planet-phase-expanding .planet-globe {
          animation: planet-spin 5s linear infinite, planet-bloom 1.1s ease-out;
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
        .planet-phase-closing .planet-nebula,
        .planet-phase-done .planet-nebula {
          opacity: 0.6;
          transition: opacity 1.2s ease;
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

        @keyframes planet-nebula-drift {
          from {
            transform: translate(0, 0) scale(1);
          }
          to {
            transform: translate(4%, -3%) scale(1.08);
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
            filter: drop-shadow(0 0 16px rgba(251, 191, 36, 0.95));
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
        @keyframes planet-arc-flash {
          0%,
          100% {
            stroke-width: 0.9;
          }
          40% {
            stroke-width: 2;
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

        @keyframes planet-landmark-pulse {
          0%,
          100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.5);
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

        @keyframes planet-confetti-burst {
          0% {
            transform: rotate(var(--r, 0deg)) translateY(0);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--r, 0deg)) translateY(-120px);
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
          .planet-burst-ring-3,
          .planet-nebula-blob,
          .planet-confetti-piece,
          .planet-landmark-pin {
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
          .planet-landmark-pin {
            opacity: 0.8;
          }
          .planet-phase-closing .planet-svg,
          .planet-phase-closing .planet-stars {
            opacity: 0.2;
            transition: opacity 0.4s ease;
          }
        }

        @media (max-width: 480px) {
          .planet-preview-stage {
            max-width: 240px;
          }
        }
      `}</style>
    </div>
  );
}
