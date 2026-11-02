"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const LUMINOUS_BUTTERFLY_DURATION_MS = 2200; // Target duration: 2.2 seconds (Basic tier)
const DUST_COUNT = 8;

/**
 * LuminousButterflyGiftPreview — "Mariposa luminosa" (20 Coins, propuesto)
 *
 * Basic-tier animated SVG scene: a glowing butterfly with two pairs of
 * translucent, gradient-lit wings that flap (via rotateY on each wing
 * half), drifting along a gentle S-curve flight path while trailing soft
 * luminous dust motes, then settling with a brighter final glow pulse.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function LuminousButterflyGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("flying"); // flying -> settling -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const settleTimer = setTimeout(() => setPhase("settling"), LUMINOUS_BUTTERFLY_DURATION_MS - 700);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, LUMINOUS_BUTTERFLY_DURATION_MS);

    timersRef.current = [settleTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const dust = Array.from({ length: DUST_COUNT }, (_, i) => ({
    left: `${8 + i * 10}%`,
    delay: `${i * 0.18}s`,
  }));

  return (
    <div className={`butterfly-preview-stage butterfly-phase-${phase}`}>
      {/* Soft background bokeh, gives the scene depth beyond a flat icon */}
      <div className="butterfly-bokeh" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`butterfly-bokeh-dot butterfly-bokeh-dot-${i + 1}`} />
        ))}
      </div>

      {/* A second, dimmer companion butterfly flying a parallel path
          behind the hero — sells "a scene", not a single isolated icon */}
      <svg className="butterfly-svg butterfly-svg-companion" viewBox="0 0 100 80" aria-hidden="true">
        <g className="butterfly-wing butterfly-wing-left-top">
          <path d="M50 38 C34 18 12 18 8 32 C6 44 24 46 50 38 Z" fill="#a855f7" />
        </g>
        <g className="butterfly-wing butterfly-wing-right-top">
          <path d="M50 38 C66 18 88 18 92 32 C94 44 76 46 50 38 Z" fill="#a855f7" />
        </g>
        <path d="M50 30 L50 54" stroke="#3b0764" strokeWidth="2.4" strokeLinecap="round" />
      </svg>

      <div className="butterfly-dust" aria-hidden="true">
        {dust.map((d, i) => (
          <span key={i} className="butterfly-dust-mote" style={{ left: d.left, animationDelay: d.delay }} />
        ))}
      </div>

      <svg className="butterfly-svg butterfly-svg-hero" viewBox="0 0 100 80" role="img" aria-label="Luminous butterfly gift animation">
        <defs>
          <linearGradient id="butterflyWingGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fce7f3" />
            <stop offset="45%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#a21caf" />
          </linearGradient>
          <radialGradient id="butterflyGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(244,114,182,0.6)" />
            <stop offset="100%" stopColor="rgba(244,114,182,0)" />
          </radialGradient>
        </defs>

        <circle className="butterfly-glow" cx="50" cy="40" r="34" fill="url(#butterflyGlow)" />

        <g className="butterfly-wing butterfly-wing-left-top">
          <path d="M50 38 C34 18 12 18 8 32 C6 44 24 46 50 38 Z" fill="url(#butterflyWingGradient)" />
          <circle cx="22" cy="30" r="2.6" fill="#fef9ff" opacity="0.7" />
        </g>
        <g className="butterfly-wing butterfly-wing-left-bottom">
          <path d="M50 42 C38 56 20 60 14 50 C10 42 26 40 50 42 Z" fill="url(#butterflyWingGradient)" />
        </g>
        <g className="butterfly-wing butterfly-wing-right-top">
          <path d="M50 38 C66 18 88 18 92 32 C94 44 76 46 50 38 Z" fill="url(#butterflyWingGradient)" />
          <circle cx="78" cy="30" r="2.6" fill="#fef9ff" opacity="0.7" />
        </g>
        <g className="butterfly-wing butterfly-wing-right-bottom">
          <path d="M50 42 C62 56 80 60 86 50 C90 42 74 40 50 42 Z" fill="url(#butterflyWingGradient)" />
        </g>

        <path d="M50 30 L50 54" stroke="#4c0519" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="50" cy="28" r="2.6" fill="#4c0519" />
        <path d="M50 28 C47 24 44 22 42 23" stroke="#4c0519" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M50 28 C53 24 56 22 58 23" stroke="#4c0519" strokeWidth="1" fill="none" strokeLinecap="round" />
      </svg>

      <style jsx>{`
        .butterfly-preview-stage {
          position: relative;
          width: 100%;
          max-width: 220px;
          aspect-ratio: 5 / 4;
          margin: 0 auto;
        }

        .butterfly-bokeh {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .butterfly-bokeh-dot {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(244, 114, 182, 0.35), rgba(244, 114, 182, 0));
          animation: butterfly-bokeh-drift 6s ease-in-out infinite;
        }
        .butterfly-bokeh-dot-1 { left: 8%; top: 18%; width: 22px; height: 22px; animation-delay: 0s; }
        .butterfly-bokeh-dot-2 { left: 82%; top: 12%; width: 16px; height: 16px; animation-delay: 1.2s; }
        .butterfly-bokeh-dot-3 { left: 14%; top: 70%; width: 18px; height: 18px; animation-delay: 2.1s; }
        .butterfly-bokeh-dot-4 { left: 88%; top: 68%; width: 24px; height: 24px; animation-delay: 0.6s; }
        .butterfly-bokeh-dot-5 { left: 50%; top: 6%; width: 14px; height: 14px; animation-delay: 2.8s; }
        .butterfly-bokeh-dot-6 { left: 46%; top: 86%; width: 20px; height: 20px; animation-delay: 1.8s; }

        .butterfly-svg-companion {
          position: absolute;
          width: 46%;
          height: 46%;
          left: 6%;
          top: 38%;
          opacity: 0.4;
          filter: blur(0.3px) drop-shadow(0 0 4px rgba(168, 85, 247, 0.5));
          animation: butterfly-flight-companion ${LUMINOUS_BUTTERFLY_DURATION_MS}ms ease-in-out forwards;
        }
        .butterfly-svg-companion .butterfly-wing {
          animation: butterfly-flap 0.26s ease-in-out infinite;
        }

        .butterfly-svg-hero {
          position: relative;
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 0 8px rgba(244, 114, 182, 0.75));
          animation: butterfly-flight ${LUMINOUS_BUTTERFLY_DURATION_MS - 700}ms ease-in-out forwards;
        }

        .butterfly-phase-settling .butterfly-svg-hero,
        .butterfly-phase-done .butterfly-svg-hero {
          animation: butterfly-flight ${LUMINOUS_BUTTERFLY_DURATION_MS - 700}ms ease-in-out forwards,
            butterfly-settle-glow 0.7s ease-out ${LUMINOUS_BUTTERFLY_DURATION_MS - 700}ms forwards;
        }

        .butterfly-phase-settling .butterfly-svg-companion,
        .butterfly-phase-done .butterfly-svg-companion {
          opacity: 0;
          transition: opacity 0.6s ease;
        }

        .butterfly-wing {
          transform-box: fill-box;
          transform-origin: right center;
          animation: butterfly-flap 0.32s ease-in-out infinite;
        }
        .butterfly-wing-left-top,
        .butterfly-wing-left-bottom {
          transform-origin: right center;
        }
        .butterfly-wing-right-top,
        .butterfly-wing-right-bottom {
          transform-origin: left center;
          animation-delay: 0.02s;
        }

        .butterfly-glow {
          opacity: 0.8;
          animation: butterfly-glow-pulse 1.1s ease-in-out infinite;
        }

        .butterfly-dust {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .butterfly-dust-mote {
          position: absolute;
          bottom: 10%;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #fbcfe8;
          box-shadow: 0 0 6px 1px rgba(244, 114, 182, 0.9);
          animation: butterfly-dust-rise 1.8s ease-out infinite;
        }

        @keyframes butterfly-flight {
          0% {
            transform: translate(-36%, 10%) scale(0.9);
          }
          25% {
            transform: translate(-10%, -10%) scale(1);
          }
          50% {
            transform: translate(10%, 6%) scale(1.05);
          }
          75% {
            transform: translate(28%, -8%) scale(1);
          }
          100% {
            transform: translate(0%, 0%) scale(1.1);
          }
        }
        @keyframes butterfly-flight-companion {
          0% {
            transform: translate(-20%, 14%) scale(0.75);
          }
          30% {
            transform: translate(2%, -4%) scale(0.8);
          }
          65% {
            transform: translate(18%, 10%) scale(0.72);
          }
          100% {
            transform: translate(-4%, -6%) scale(0.78);
          }
        }
        @keyframes butterfly-bokeh-drift {
          0%,
          100% {
            opacity: 0.25;
            transform: translate(0, 0);
          }
          50% {
            opacity: 0.6;
            transform: translate(6px, -10px);
          }
        }
        @keyframes butterfly-settle-glow {
          0%,
          100% {
            filter: drop-shadow(0 0 8px rgba(244, 114, 182, 0.75));
          }
          50% {
            filter: drop-shadow(0 0 18px rgba(244, 114, 182, 1));
          }
        }
        @keyframes butterfly-flap {
          0%,
          100% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(55deg);
          }
        }
        @keyframes butterfly-glow-pulse {
          0%,
          100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes butterfly-dust-rise {
          0% {
            opacity: 0;
            transform: translateY(0);
          }
          30% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(-60px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .butterfly-svg-hero,
          .butterfly-svg-companion,
          .butterfly-wing,
          .butterfly-glow,
          .butterfly-dust-mote,
          .butterfly-bokeh-dot {
            animation: none !important;
          }
          .butterfly-svg-hero {
            transform: translate(0, 0) scale(1);
          }
          .butterfly-svg-companion {
            opacity: 0.3;
          }
          .butterfly-glow {
            opacity: 1;
          }
        }

        @media (max-width: 480px) {
          .butterfly-preview-stage {
            max-width: 160px;
          }
        }
      `}</style>
    </div>
  );
}
