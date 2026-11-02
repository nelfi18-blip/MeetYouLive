"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const ENCHANTED_PYRAMID_DURATION_MS = 3800; // Target duration: 3.8 seconds (Premium tier)
const SAND_COUNT = 12;

/**
 * EnchantedPyramidGiftPreview — "Pirámide encantada" (1,200 Coins, propuesto)
 *
 * Premium-tier animated SVG scene: a three-faced pyramid (two visible
 * lit/shadow faces for depth) rises from drifting desert sand, its edges
 * trace in with a golden stroke reveal, glowing hieroglyph-style lines
 * flicker to life on its faces, and a beam of mystical light shoots from
 * the apex into the sky before the scene settles into a steady glow.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function EnchantedPyramidGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("rising"); // rising -> glowing -> beam -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const glowTimer = setTimeout(() => setPhase("glowing"), 1500);
    const beamTimer = setTimeout(() => setPhase("beam"), 2400);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, ENCHANTED_PYRAMID_DURATION_MS);

    timersRef.current = [glowTimer, beamTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const sand = Array.from({ length: SAND_COUNT }, (_, i) => ({
    left: `${(i * 8.3) % 100}%`,
    delay: `${(i % 6) * 0.3}s`,
  }));

  return (
    <div className={`pyramid-preview-stage pyramid-phase-${phase}`}>
      {/* Desert dune + sunset sky backdrop, placing the pyramid in a
          recognizable scene instead of floating on empty space. */}
      <svg className="pyramid-scene" viewBox="0 0 100 90" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="pyramidSkyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e1033" />
            <stop offset="55%" stopColor="#7c2d12" />
            <stop offset="100%" stopColor="#c2410c" />
          </linearGradient>
          <radialGradient id="pyramidSunGradient" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="100%" stopColor="rgba(254,243,199,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="90" fill="url(#pyramidSkyGradient)" />
        <circle className="pyramid-sun" cx="78" cy="22" r="10" fill="url(#pyramidSunGradient)" />
        <path d="M0 72 Q14 64 28 72 Q42 60 58 70 Q74 62 86 70 Q94 66 100 70 L100 90 L0 90 Z" fill="#431407" opacity="0.65" />
      </svg>

      <svg className="pyramid-svg" viewBox="0 0 100 90" role="img" aria-label="Enchanted pyramid gift animation">
        <defs>
          <linearGradient id="pyramidLitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="pyramidShadowGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#92400e" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>
          <linearGradient id="pyramidBeamGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(253,230,138,0.9)" />
            <stop offset="100%" stopColor="rgba(253,230,138,0)" />
          </linearGradient>
        </defs>

        {/* Mystical beam, only visible during the "beam" finale */}
        <polygon className="pyramid-beam" points="42,38 58,38 72,0 28,0" fill="url(#pyramidBeamGradient)" />

        {/* Two visible faces for a sense of 3D depth */}
        <polygon
          className="pyramid-face pyramid-face-lit"
          points="50,10 50,70 14,70"
          fill="url(#pyramidLitGradient)"
          stroke="#fff7ed"
          strokeWidth="0.6"
        />
        <polygon
          className="pyramid-face pyramid-face-shadow"
          points="50,10 50,70 86,70"
          fill="url(#pyramidShadowGradient)"
          stroke="#78350f"
          strokeWidth="0.6"
        />

        {/* Glowing hieroglyph-style lines */}
        <g className="pyramid-glyphs" stroke="#fef3c7" strokeWidth="0.8" fill="none">
          <path d="M26 58 L34 58 M30 54 L30 62" />
          <circle cx="22" cy="46" r="2" />
          <path d="M60 58 L70 58 M65 54 L65 62" />
          <path d="M72 46 L78 50 L72 54" />
        </g>

        <line x1="6" y1="70" x2="94" y2="70" stroke="rgba(180,83,9,0.5)" strokeWidth="1" />
      </svg>

      <div className="pyramid-sand" aria-hidden="true">
        {sand.map((s, i) => (
          <span key={i} className="pyramid-sand-mote" style={{ left: s.left, animationDelay: s.delay }} />
        ))}
      </div>

      <style jsx>{`
        .pyramid-preview-stage {
          position: relative;
          width: 100%;
          max-width: 240px;
          aspect-ratio: 10 / 9;
          margin: 0 auto;
          overflow: hidden;
          border-radius: 10px;
        }

        .pyramid-scene {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
        }
        .pyramid-sun {
          animation: pyramid-sun-glow 4.5s ease-in-out infinite;
        }

        .pyramid-svg {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
        }

        .pyramid-face {
          transform-origin: 50px 70px;
          animation: pyramid-rise 1.4s cubic-bezier(0.22, 0.9, 0.3, 1.1) forwards;
        }

        .pyramid-phase-glowing .pyramid-face,
        .pyramid-phase-beam .pyramid-face,
        .pyramid-phase-done .pyramid-face {
          filter: drop-shadow(0 0 6px rgba(253, 230, 138, 0.8));
        }

        .pyramid-glyphs {
          opacity: 0;
        }
        .pyramid-phase-glowing .pyramid-glyphs,
        .pyramid-phase-beam .pyramid-glyphs,
        .pyramid-phase-done .pyramid-glyphs {
          opacity: 1;
          animation: pyramid-glyph-flicker 1.3s ease-in-out infinite;
        }

        .pyramid-beam {
          opacity: 0;
          transform-origin: 50px 70px;
          transform: scaleY(0.3);
        }
        .pyramid-phase-beam .pyramid-beam,
        .pyramid-phase-done .pyramid-beam {
          animation: pyramid-beam-shoot 1.1s ease-out forwards;
        }

        .pyramid-sand {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .pyramid-sand-mote {
          position: absolute;
          bottom: 20%;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #fcd34d;
          opacity: 0.6;
          animation: pyramid-sand-drift 3.2s ease-in-out infinite;
        }

        @keyframes pyramid-sun-glow {
          0%,
          100% {
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes pyramid-rise {
          0% {
            opacity: 0;
            transform: translateY(16px) scaleY(0.6);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
        }
        @keyframes pyramid-glyph-flicker {
          0%,
          100% {
            opacity: 0.55;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes pyramid-beam-shoot {
          0% {
            opacity: 0;
            transform: scaleY(0.3);
          }
          40% {
            opacity: 1;
            transform: scaleY(1.1);
          }
          100% {
            opacity: 0.6;
            transform: scaleY(1);
          }
        }
        @keyframes pyramid-sand-drift {
          0%,
          100% {
            opacity: 0.3;
            transform: translate(0, 0);
          }
          50% {
            opacity: 0.8;
            transform: translate(8px, -14px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .pyramid-face,
          .pyramid-glyphs,
          .pyramid-beam,
          .pyramid-sand-mote,
          .pyramid-sun {
            animation: none !important;
          }
          .pyramid-face {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
          .pyramid-glyphs {
            opacity: 1;
          }
          .pyramid-beam {
            opacity: 0.6;
            transform: scaleY(1);
          }
        }

        @media (max-width: 480px) {
          .pyramid-preview-stage {
            max-width: 170px;
          }
        }
      `}</style>
    </div>
  );
}
