"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const CRYSTAL_DOLPHIN_DURATION_MS = 2600; // Target duration: 2.6 seconds (Basic tier)
const DROPLET_COUNT = 10;

/**
 * CrystalDolphinGiftPreview — "Delfín de cristal" (80 Coins, propuesto)
 *
 * Basic-tier animated SVG scene: a translucent, glass-like dolphin
 * silhouette leaps through a shallow arc, refracting a cool cyan/blue
 * gradient with a bright specular highlight along its back, and splashes
 * a burst of crystalline droplets at the apex of its leap before fading
 * out with a soft shimmer.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function CrystalDolphinGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("leaping"); // leaping -> splash -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const splashTimer = setTimeout(() => setPhase("splash"), 1300);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, CRYSTAL_DOLPHIN_DURATION_MS);

    timersRef.current = [splashTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const droplets = Array.from({ length: DROPLET_COUNT }, (_, i) => {
    const angle = (i / DROPLET_COUNT) * Math.PI - Math.PI / 2;
    return {
      x: 50 + Math.cos(angle) * 30,
      y: 50 + Math.sin(angle) * 18,
      delay: `${(i % 5) * 0.05}s`,
    };
  });

  return (
    <div className={`dolphin-preview-stage dolphin-phase-${phase}`}>
      <div className="dolphin-water" aria-hidden="true">
        <svg className="dolphin-water-svg" viewBox="0 0 120 16" preserveAspectRatio="none">
          <path
            className="dolphin-wave"
            d="M0 8 Q15 2 30 8 T60 8 T90 8 T120 8 V16 H0 Z"
            fill="url(#dolphinWaterGradient)"
          />
        </svg>
        <span className="dolphin-ripple dolphin-ripple-1" />
        <span className="dolphin-ripple dolphin-ripple-2" />
      </div>

      <svg className="dolphin-svg" viewBox="0 0 120 90" role="img" aria-label="Crystal dolphin gift animation">
        <defs>
          <linearGradient id="dolphinGlassGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0fdfd" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#67e8f9" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="dolphinGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(103,232,249,0.55)" />
            <stop offset="100%" stopColor="rgba(103,232,249,0)" />
          </radialGradient>
          <linearGradient id="dolphinWaterGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#164e63" />
            <stop offset="100%" stopColor="#0c4a6e" />
          </linearGradient>
        </defs>

        <ellipse className="dolphin-glow" cx="60" cy="48" r="42" fill="url(#dolphinGlow)" />

        {/* Body-flex wrapper: a subtle extra skew/scale layered on top of the
            leap transform so the silhouette curves through the apex like a
            real leaping body, instead of moving as one rigid flat shape. */}
        <g className="dolphin-body-flex">

        {/* Recognizable leaping dolphin silhouette: pointed rostrum/beak,
            rounded melon forehead, a single triangular dorsal fin, a sleek
            curved back, a small pectoral fin, and a clearly forked tail
            fluke — drawn as one continuous outline so the shape reads
            instantly as "dolphin", not an abstract blob. */}
        <path
          className="dolphin-body"
          d="M98 20
             C 90 12, 78 9, 70 12
             L 74 2
             L 78 16
             C 86 17, 94 23, 98 32
             C 88 29, 79 30, 72 34
             C 80 36, 90 42, 94 52
             C 83 45, 72 43, 63 45
             C 54 56, 40 62, 27 59
             L 15 70
             L 13 52
             L 25 54
             C 32 45, 38 36, 50 29
             C 62 22, 80 17, 92 18 Z"
          fill="url(#dolphinGlassGradient)"
          stroke="#cffafe"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        {/* Underbelly highlight curve + small pectoral fin + eye, for a
            clearer silhouette read against the glow */}
        <path d="M30 52 C 40 42, 52 34, 64 29" stroke="#ecfeff" strokeWidth="1.4" fill="none" opacity="0.85" strokeLinecap="round" />
        <path d="M58 46 C 54 50, 50 54, 48 59" stroke="#a5f3fc" strokeWidth="1.1" fill="none" opacity="0.8" strokeLinecap="round" />
        <circle cx="84" cy="24" r="1.6" fill="#083344" />

        {/* Crystalline facet lines for a "glass" read */}
        <path d="M34 56 L46 46" stroke="rgba(236,254,255,0.6)" strokeWidth="0.6" />
        <path d="M46 50 L58 40" stroke="rgba(236,254,255,0.6)" strokeWidth="0.6" />
        <path d="M58 44 L70 34" stroke="rgba(236,254,255,0.6)" strokeWidth="0.6" />
        </g>
      </svg>

      <div className="dolphin-droplets" aria-hidden="true">
        {droplets.map((d, i) => (
          <span
            key={i}
            className="dolphin-droplet"
            style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: d.delay }}
          />
        ))}
      </div>

      <style jsx>{`
        .dolphin-preview-stage {
          position: relative;
          width: 100%;
          max-width: 260px;
          aspect-ratio: 4 / 3;
          margin: 0 auto;
        }

        .dolphin-water {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 6%;
          height: 20%;
          overflow: visible;
          pointer-events: none;
        }
        .dolphin-water-svg {
          width: 100%;
          height: 100%;
          opacity: 0.85;
        }
        .dolphin-wave {
          animation: dolphin-wave-roll 2.6s ease-in-out infinite;
        }
        .dolphin-ripple {
          position: absolute;
          left: 50%;
          bottom: 40%;
          width: 30%;
          height: 18%;
          border: 2px solid rgba(207, 250, 254, 0);
          border-radius: 50%;
          transform: translate(-50%, 50%) scale(0.3);
          opacity: 0;
        }
        .dolphin-phase-splash .dolphin-ripple,
        .dolphin-phase-done .dolphin-ripple {
          border-color: rgba(207, 250, 254, 0.75);
          animation: dolphin-ripple-expand 0.9s ease-out forwards;
        }
        .dolphin-phase-splash .dolphin-ripple-2,
        .dolphin-phase-done .dolphin-ripple-2 {
          animation-delay: 0.15s;
        }

        .dolphin-body-flex {
          transform-box: fill-box;
          transform-origin: 55px 45px;
          animation: dolphin-body-curve 1.3s cubic-bezier(0.3, 0.6, 0.4, 1) forwards;
        }

        .dolphin-svg {
          position: relative;
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 0 10px rgba(103, 232, 249, 0.8));
          animation: dolphin-leap 1.3s cubic-bezier(0.3, 0.6, 0.4, 1) forwards;
        }

        .dolphin-phase-splash .dolphin-svg,
        .dolphin-phase-done .dolphin-svg {
          animation: dolphin-leap 1.3s cubic-bezier(0.3, 0.6, 0.4, 1) forwards,
            dolphin-shimmer 1.3s ease-in-out 1.3s forwards;
        }

        .dolphin-glow {
          opacity: 0.5;
          animation: dolphin-glow-pulse 1.3s ease-in-out infinite;
        }

        .dolphin-droplets {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .dolphin-droplet {
          position: absolute;
          width: 4px;
          height: 4px;
          margin: -2px;
          border-radius: 50%;
          background: #ecfeff;
          box-shadow: 0 0 6px 1px rgba(103, 232, 249, 0.9);
          opacity: 0;
        }
        .dolphin-phase-splash .dolphin-droplet,
        .dolphin-phase-done .dolphin-droplet {
          animation: dolphin-droplet-burst 0.9s ease-out forwards;
        }

        @keyframes dolphin-leap {
          0% {
            transform: translate(-60%, 40%) rotate(-18deg) scale(0.78);
          }
          55% {
            transform: translate(5%, -22%) rotate(6deg) scale(1.08);
          }
          100% {
            transform: translate(22%, 8%) rotate(0deg) scale(1);
          }
        }
        @keyframes dolphin-body-curve {
          0% {
            transform: scaleY(1) skewX(0deg);
          }
          40% {
            transform: scaleY(1.08) skewX(-6deg);
          }
          55% {
            transform: scaleY(0.92) skewX(8deg);
          }
          100% {
            transform: scaleY(1) skewX(0deg);
          }
        }
        @keyframes dolphin-wave-roll {
          0%,
          100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(-6%);
          }
        }
        @keyframes dolphin-ripple-expand {
          0% {
            opacity: 0.9;
            transform: translate(-50%, 50%) scale(0.3);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, 50%) scale(2.4);
          }
        }
        @keyframes dolphin-shimmer {
          0%,
          100% {
            filter: drop-shadow(0 0 10px rgba(103, 232, 249, 0.8));
          }
          50% {
            filter: drop-shadow(0 0 20px rgba(224, 242, 254, 1));
          }
        }
        @keyframes dolphin-glow-pulse {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.75;
          }
        }
        @keyframes dolphin-droplet-burst {
          0% {
            opacity: 0;
            transform: translate(0, 0) scale(0.6);
          }
          25% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(var(--dx, 0), 24px) scale(0.3);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dolphin-svg,
          .dolphin-glow,
          .dolphin-droplet,
          .dolphin-body-flex,
          .dolphin-wave,
          .dolphin-ripple {
            animation: none !important;
          }
          .dolphin-svg {
            transform: translate(22%, 8%) rotate(0deg) scale(1);
          }
          .dolphin-glow {
            opacity: 0.6;
          }
          .dolphin-ripple {
            opacity: 0;
          }
        }

        @media (max-width: 480px) {
          .dolphin-preview-stage {
            max-width: 190px;
          }
        }
      `}</style>
    </div>
  );
}
