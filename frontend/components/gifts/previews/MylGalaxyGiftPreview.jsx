"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animation configuration constants
export const MYL_GALAXY_DURATION_MS = 5200; // Target duration: 5.2 seconds (Super tier)
const ARM_STAR_COUNT = 90;
const BG_STAR_COUNT = 110;
const BURST_PARTICLE_COUNT = 20;
const ARM_COUNT = 3;

/**
 * MylGalaxyGiftPreview — "Galaxia MYL" (5,000 Coins, propuesto)
 *
 * Super-tier cinematic scene, redesigned per the "spectacular galaxy with
 * depth, not a thin line drawing" creative direction: a deep-space
 * backdrop layered with drifting violet/magenta/cyan nebula clouds and a
 * dim background starfield frames a dense three-armed spiral — glowing
 * gradient arm trails with soft outer glow, hundreds of stars of varying
 * size/brightness/color tracing each arm — slowly rotating around a
 * pulsing, corona-rayed bright core. The "MYL" wordmark glows into
 * formation at the center once the spiral is established, and the scene
 * climaxes with a full-canvas starburst + brightening flash before a
 * graceful fade that leaves a soft nebula afterglow.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function MylGalaxyGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("forming"); // forming -> spinning -> finale -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const spinningTimer = setTimeout(() => setPhase("spinning"), 900);
    const finaleTimer = setTimeout(() => setPhase("finale"), 3800);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, MYL_GALAXY_DURATION_MS);

    timersRef.current = [spinningTimer, finaleTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const armStars = useMemo(() => {
    const colors = ["#e9d5ff", "#f0f9ff", "#fde68a"];
    return Array.from({ length: ARM_STAR_COUNT }, (_, i) => {
      const arm = i % ARM_COUNT;
      const t = Math.floor(i / ARM_COUNT) / Math.ceil(ARM_STAR_COUNT / ARM_COUNT);
      const angle = arm * ((Math.PI * 2) / ARM_COUNT) + t * Math.PI * 2.6;
      const radius = 6 + t * 42;
      const jitter = ((i * 13) % 5) - 2;
      return {
        cx: 50 + Math.cos(angle) * radius + jitter * 0.3,
        cy: 50 + Math.sin(angle) * radius * 0.62 + jitter * 0.2,
        r: 0.5 + (i % 4) * 0.35,
        color: colors[i % colors.length],
        delay: `${(i % 14) * 0.1}s`,
      };
    });
  }, []);

  // Visible spiral-arm trails (so the galaxy reads as an actual spiral,
  // not just scattered star points) — logarithmic-spiral curves matching
  // the same angle/radius formula used for armStars above.
  const armTrails = useMemo(() => {
    const steps = 26;
    return Array.from({ length: ARM_COUNT }, (_, arm) => {
      const points = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        const angle = arm * ((Math.PI * 2) / ARM_COUNT) + t * Math.PI * 2.6;
        const radius = 6 + t * 42;
        const cx = (50 + Math.cos(angle) * radius).toFixed(2);
        const cy = (50 + Math.sin(angle) * radius * 0.62).toFixed(2);
        return `${cx} ${cy}`;
      });
      return { d: `M${points.join(" L")}`, delay: `${arm * 0.25}s` };
    });
  }, []);

  const bgStars = useMemo(
    () =>
      Array.from({ length: BG_STAR_COUNT }, (_, i) => ({
        left: `${(i * 23) % 100}%`,
        top: `${(i * 37) % 100}%`,
        delay: `${(i % 8) * 0.28}s`,
      })),
    []
  );

  const burstParticles = useMemo(() => {
    return Array.from({ length: BURST_PARTICLE_COUNT }, (_, i) => {
      const angle = (i / BURST_PARTICLE_COUNT) * Math.PI * 2;
      return {
        rotate: (angle * 180) / Math.PI,
        delay: `${(i % 6) * 0.05}s`,
      };
    });
  }, []);

  return (
    <div className={`galaxy-preview-stage galaxy-phase-${phase}`}>
      {/* Deep-space nebula backdrop, layered violet/magenta/cyan */}
      <div className="galaxy-nebula" aria-hidden="true">
        <span className="galaxy-nebula-blob galaxy-nebula-1" />
        <span className="galaxy-nebula-blob galaxy-nebula-2" />
        <span className="galaxy-nebula-blob galaxy-nebula-3" />
      </div>

      {/* Dim background starfield, independent of the spiral arm stars */}
      <div className="galaxy-bg-stars" aria-hidden="true">
        {bgStars.map((s, i) => (
          <span key={i} className="galaxy-bg-star" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />
        ))}
      </div>

      {/* Full-canvas brightening flash for the finale */}
      <div className="galaxy-flash" aria-hidden="true" />

      <div className="galaxy-burst" aria-hidden="true">
        {burstParticles.map((p, i) => (
          <span
            key={i}
            className="galaxy-burst-particle"
            style={{ transform: `rotate(${p.rotate}deg)`, animationDelay: p.delay }}
          />
        ))}
      </div>

      <svg className="galaxy-svg" viewBox="0 0 100 100" role="img" aria-label="MYL galaxy gift animation">
        <defs>
          <radialGradient id="galaxyCoreGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fdf4ff" />
            <stop offset="40%" stopColor="#e9d5ff" />
            <stop offset="70%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="rgba(192,132,252,0)" />
          </radialGradient>
          <linearGradient id="galaxyArmGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(96,165,250,0.1)" />
            <stop offset="45%" stopColor="rgba(168,85,247,0.6)" />
            <stop offset="75%" stopColor="rgba(244,114,182,0.75)" />
            <stop offset="100%" stopColor="rgba(253,244,255,0.95)" />
          </linearGradient>
        </defs>

        {/* Soft blurred glow duplicate of the arm trails, for extra depth */}
        <g className="galaxy-arms-glow">
          {armTrails.map((trail, i) => (
            <path
              key={`glow-${i}`}
              d={trail.d}
              fill="none"
              stroke="#c084fc"
              strokeWidth="3.4"
              strokeLinecap="round"
              opacity="0.35"
            />
          ))}
        </g>

        <g className="galaxy-arms">
          {armTrails.map((trail, i) => (
            <path
              key={`trail-${i}`}
              className="galaxy-arm-trail"
              d={trail.d}
              fill="none"
              stroke="url(#galaxyArmGradient)"
              strokeWidth="1.1"
              strokeLinecap="round"
              style={{ animationDelay: trail.delay }}
            />
          ))}
          {armStars.map((s, i) => (
            <circle
              key={i}
              className="galaxy-arm-star"
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              fill={s.color}
              style={{ animationDelay: s.delay }}
            />
          ))}
        </g>

        <circle className="galaxy-core" cx="50" cy="50" r="17" fill="url(#galaxyCoreGradient)" />
        <g className="galaxy-corona" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <line
              key={i}
              x1="50"
              y1="50"
              x2="50"
              y2="33"
              stroke="rgba(253,244,255,0.5)"
              strokeWidth="0.5"
              transform={`rotate(${i * 22.5} 50 50)`}
            />
          ))}
        </g>

        <text className="galaxy-letters" x="50" y="54" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="11" fill="#fdf4ff">
          MYL
        </text>
      </svg>

      <style jsx>{`
        .galaxy-preview-stage {
          position: relative;
          width: 100%;
          max-width: 420px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
          overflow: visible;
        }

        .galaxy-nebula {
          position: absolute;
          inset: -18%;
          pointer-events: none;
          filter: blur(16px);
          z-index: 0;
        }
        .galaxy-nebula-blob {
          position: absolute;
          width: 58%;
          height: 58%;
          border-radius: 50%;
          opacity: 0.4;
          animation: galaxy-nebula-drift 15s ease-in-out infinite alternate;
        }
        .galaxy-nebula-1 {
          left: -6%;
          top: 2%;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.85), rgba(168, 85, 247, 0));
        }
        .galaxy-nebula-2 {
          right: -8%;
          top: 8%;
          background: radial-gradient(circle, rgba(244, 114, 182, 0.75), rgba(244, 114, 182, 0));
          animation-delay: 2.5s;
        }
        .galaxy-nebula-3 {
          left: 18%;
          bottom: -12%;
          background: radial-gradient(circle, rgba(96, 165, 250, 0.7), rgba(96, 165, 250, 0));
          animation-delay: 5s;
        }

        .galaxy-bg-stars {
          position: absolute;
          inset: -10%;
          pointer-events: none;
          z-index: 1;
        }
        .galaxy-bg-star {
          position: absolute;
          width: 1px;
          height: 1px;
          background: #e0e7ff;
          border-radius: 50%;
          opacity: 0.3;
          animation: galaxy-star-twinkle 2.6s ease-in-out infinite;
        }

        .galaxy-flash {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(253, 244, 255, 0.9), rgba(253, 244, 255, 0) 70%);
          opacity: 0;
          pointer-events: none;
          z-index: 2;
        }
        .galaxy-phase-finale .galaxy-flash {
          animation: galaxy-flash-pulse 1.1s ease-out forwards;
        }

        .galaxy-svg {
          position: relative;
          width: 100%;
          height: 100%;
          z-index: 3;
        }

        .galaxy-arms,
        .galaxy-arms-glow,
        .galaxy-corona {
          transform-origin: 50px 50px;
          animation: galaxy-spin 7s linear infinite;
        }
        .galaxy-corona {
          animation: galaxy-spin 5s linear infinite reverse;
        }
        .galaxy-arm-star {
          opacity: 0;
          animation: galaxy-star-fade-in 0.5s ease-out forwards, galaxy-star-pulse 2.4s ease-in-out infinite;
        }
        .galaxy-arm-trail {
          stroke-dasharray: 190;
          stroke-dashoffset: 190;
          opacity: 0.9;
          animation: galaxy-arm-draw 1.5s ease-out forwards;
        }

        .galaxy-core {
          opacity: 0.55;
          animation: galaxy-core-pulse 1.8s ease-in-out infinite;
        }

        .galaxy-letters {
          opacity: 0;
          letter-spacing: 1px;
        }
        .galaxy-phase-spinning .galaxy-letters,
        .galaxy-phase-finale .galaxy-letters,
        .galaxy-phase-done .galaxy-letters {
          animation: galaxy-letters-glow 1.6s ease-in-out infinite, galaxy-letters-reveal 0.6s ease-out forwards;
        }

        .galaxy-burst {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 1px;
          height: 1px;
          pointer-events: none;
          opacity: 0;
          z-index: 4;
        }
        .galaxy-phase-finale .galaxy-burst,
        .galaxy-phase-done .galaxy-burst {
          opacity: 1;
        }
        .galaxy-burst-particle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 2px;
          height: 0;
          background: linear-gradient(to bottom, rgba(192, 132, 252, 0.9), rgba(192, 132, 252, 0));
          transform-origin: top center;
        }
        .galaxy-phase-finale .galaxy-burst-particle,
        .galaxy-phase-done .galaxy-burst-particle {
          animation: galaxy-burst-shoot 1.2s ease-out forwards;
        }

        @keyframes galaxy-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes galaxy-nebula-drift {
          from {
            transform: translate(0, 0) scale(1);
          }
          to {
            transform: translate(-4%, 3%) scale(1.1);
          }
        }
        @keyframes galaxy-star-fade-in {
          to {
            opacity: 0.95;
          }
        }
        @keyframes galaxy-star-pulse {
          0%,
          100% {
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes galaxy-star-twinkle {
          0%,
          100% {
            opacity: 0.15;
          }
          50% {
            opacity: 0.7;
          }
        }
        @keyframes galaxy-arm-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes galaxy-core-pulse {
          0%,
          100% {
            opacity: 0.65;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }
        @keyframes galaxy-letters-reveal {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes galaxy-letters-glow {
          0%,
          100% {
            filter: drop-shadow(0 0 2px rgba(253, 244, 255, 0.6));
          }
          50% {
            filter: drop-shadow(0 0 8px rgba(253, 244, 255, 1));
          }
        }
        @keyframes galaxy-flash-pulse {
          0% {
            opacity: 0;
          }
          40% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes galaxy-burst-shoot {
          0% {
            height: 0;
            opacity: 1;
          }
          100% {
            height: 75%;
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .galaxy-arms,
          .galaxy-arms-glow,
          .galaxy-corona,
          .galaxy-arm-star,
          .galaxy-arm-trail,
          .galaxy-core,
          .galaxy-letters,
          .galaxy-burst-particle,
          .galaxy-nebula-blob,
          .galaxy-bg-star,
          .galaxy-flash {
            animation: none !important;
          }
          .galaxy-arm-star {
            opacity: 0.9;
          }
          .galaxy-arm-trail {
            stroke-dashoffset: 0;
            opacity: 0.85;
          }
          .galaxy-letters {
            opacity: 1;
          }
          .galaxy-burst {
            opacity: 0;
          }
        }

        @media (max-width: 480px) {
          .galaxy-preview-stage {
            max-width: 260px;
          }
        }
      `}</style>
    </div>
  );
}
