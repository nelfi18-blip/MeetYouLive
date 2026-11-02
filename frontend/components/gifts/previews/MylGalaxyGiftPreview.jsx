"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animation configuration constants
export const MYL_GALAXY_DURATION_MS = 5200; // Target duration: 5.2 seconds (Super tier)
const ARM_STAR_COUNT = 24;
const BURST_PARTICLE_COUNT = 16;

/**
 * MylGalaxyGiftPreview — "Galaxia MYL" (5,000 Coins, propuesto)
 *
 * Super-tier animated SVG scene: a spiral galaxy of stars along three
 * curved arms slowly rotates around a pulsing bright core, the letters
 * "MYL" glow into formation at the center, and the scene closes with a
 * finale burst of star particles radiating outward from the core.
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
    return Array.from({ length: ARM_STAR_COUNT }, (_, i) => {
      const arm = i % 3;
      const t = Math.floor(i / 3) / Math.ceil(ARM_STAR_COUNT / 3);
      const angle = arm * ((Math.PI * 2) / 3) + t * Math.PI * 2.4;
      const radius = 6 + t * 38;
      return {
        cx: 50 + Math.cos(angle) * radius,
        cy: 50 + Math.sin(angle) * radius * 0.65,
        r: 0.6 + (i % 3) * 0.3,
        delay: `${(i % 10) * 0.12}s`,
      };
    });
  }, []);

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
            <stop offset="45%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="rgba(192,132,252,0)" />
          </radialGradient>
        </defs>

        <g className="galaxy-arms">
          {armStars.map((s, i) => (
            <circle
              key={i}
              className="galaxy-arm-star"
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              fill="#e9d5ff"
              style={{ animationDelay: s.delay }}
            />
          ))}
        </g>

        <circle className="galaxy-core" cx="50" cy="50" r="16" fill="url(#galaxyCoreGradient)" />

        <text className="galaxy-letters" x="50" y="54" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="11" fill="#fdf4ff">
          MYL
        </text>
      </svg>

      <style jsx>{`
        .galaxy-preview-stage {
          position: relative;
          width: 100%;
          max-width: 280px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
        }

        .galaxy-svg {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .galaxy-arms {
          transform-origin: 50px 50px;
          animation: galaxy-spin 6s linear infinite;
        }
        .galaxy-arm-star {
          opacity: 0;
          animation: galaxy-star-fade-in 0.5s ease-out forwards;
        }

        .galaxy-core {
          opacity: 0.5;
          animation: galaxy-core-pulse 1.6s ease-in-out infinite;
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
        @keyframes galaxy-star-fade-in {
          to {
            opacity: 0.9;
          }
        }
        @keyframes galaxy-core-pulse {
          0%,
          100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.08);
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
        @keyframes galaxy-burst-shoot {
          0% {
            height: 0;
            opacity: 1;
          }
          100% {
            height: 70%;
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .galaxy-arms,
          .galaxy-arm-star,
          .galaxy-core,
          .galaxy-letters,
          .galaxy-burst-particle {
            animation: none !important;
          }
          .galaxy-arm-star {
            opacity: 0.9;
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
            max-width: 200px;
          }
        }
      `}</style>
    </div>
  );
}
