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
        </defs>

        <ellipse className="dolphin-glow" cx="60" cy="48" r="42" fill="url(#dolphinGlow)" />

        {/* Recognizable leaping dolphin silhouette: beak, melon head, dorsal
            fin, curved body and tail flukes */}
        <path
          className="dolphin-body"
          d="M18 62
             C 20 44, 38 28, 58 26
             C 66 25, 70 20, 76 16
             C 74 22, 70 26, 66 29
             C 78 30, 90 36, 96 46
             C 88 44, 80 44, 74 46
             C 80 50, 90 54, 96 64
             C 86 58, 76 56, 68 56
             C 60 66, 44 72, 30 70
             C 36 66, 40 60, 40 54
             C 32 58, 24 60, 18 62 Z"
          fill="url(#dolphinGlassGradient)"
          stroke="#cffafe"
          strokeWidth="0.8"
        />
        <path d="M24 56 C 34 46, 48 36, 60 32" stroke="#ecfeff" strokeWidth="1.4" fill="none" opacity="0.8" strokeLinecap="round" />
        <circle cx="70" cy="30" r="1.6" fill="#083344" />

        {/* Crystalline facet lines for a "glass" read */}
        <path d="M34 56 L46 44" stroke="rgba(236,254,255,0.6)" strokeWidth="0.6" />
        <path d="M46 52 L58 40" stroke="rgba(236,254,255,0.6)" strokeWidth="0.6" />
        <path d="M58 48 L70 38" stroke="rgba(236,254,255,0.6)" strokeWidth="0.6" />
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
            transform: translate(-30%, 25%) rotate(-8deg) scale(0.85);
          }
          55% {
            transform: translate(0%, -12%) rotate(4deg) scale(1.05);
          }
          100% {
            transform: translate(14%, 6%) rotate(0deg) scale(1);
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
          .dolphin-droplet {
            animation: none !important;
          }
          .dolphin-svg {
            transform: translate(14%, 6%) rotate(0deg) scale(1);
          }
          .dolphin-glow {
            opacity: 0.6;
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
