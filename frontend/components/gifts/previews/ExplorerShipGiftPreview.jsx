"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const EXPLORER_SHIP_DURATION_MS = 4000; // Target duration: 4 seconds

/**
 * ExplorerShipGiftPreview — "Nave exploradora" (800 Coins, propuesto)
 *
 * A recognizable futuristic ship silhouette (SVG) that:
 *  - Enters from the left edge of its stage.
 *  - Flies across in a gentle arc while leaving a fading luminous trail
 *    behind it (a stretched, animated gradient streak — no particle engine
 *    or 3D assets required).
 *  - Exits off the right edge, trail fading out shortly after.
 *
 * Self-contained, inline (non full-screen) preview card for the isolated
 * dev preview route only. Does not touch Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function ExplorerShipGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("flying"); // flying -> exiting -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const exitTimer = setTimeout(() => setPhase("exiting"), EXPLORER_SHIP_DURATION_MS - 700);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, EXPLORER_SHIP_DURATION_MS);

    timersRef.current = [exitTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  return (
    <div className={`ship-preview-stage ship-phase-${phase}`}>
      <div className="ship-trail" aria-hidden="true" />

      <svg
        className="ship-svg"
        viewBox="0 0 160 60"
        role="img"
        aria-label="Explorer ship gift animation"
      >
        <defs>
          <linearGradient id="shipHullGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="#a5f3fc" />
            <stop offset="100%" stopColor="#e0f2fe" />
          </linearGradient>
          <linearGradient id="shipFlameGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(56,189,248,0)" />
            <stop offset="100%" stopColor="rgba(125,211,252,0.95)" />
          </linearGradient>
        </defs>

        {/* Exhaust flare */}
        <ellipse className="ship-flame" cx="8" cy="30" rx="10" ry="4" fill="url(#shipFlameGradient)" />

        {/* Hull — a recognizable sleek explorer-ship silhouette */}
        <path
          className="ship-hull"
          d="M18 30
             L46 20 L108 24
             L142 30
             L108 36 L46 40 Z"
          fill="url(#shipHullGradient)"
          stroke="#0ea5e9"
          strokeWidth="1.2"
        />
        {/* Cockpit */}
        <ellipse cx="96" cy="29" rx="10" ry="6" fill="#0f172a" opacity="0.65" />
        <ellipse cx="96" cy="29" rx="10" ry="6" fill="none" stroke="#7dd3fc" strokeWidth="1" />
        {/* Wing fins */}
        <path className="ship-hull" d="M60 20 L50 6 L70 20 Z" fill="url(#shipHullGradient)" stroke="#0ea5e9" strokeWidth="1" />
        <path className="ship-hull" d="M60 40 L50 54 L70 40 Z" fill="url(#shipHullGradient)" stroke="#0ea5e9" strokeWidth="1" />
      </svg>

      <style jsx>{`
        .ship-preview-stage {
          position: relative;
          width: 100%;
          max-width: 320px;
          height: 160px;
          margin: 0 auto;
          overflow: hidden;
        }

        .ship-svg {
          position: absolute;
          top: 50%;
          left: -40%;
          width: 65%;
          transform: translate(0, -50%);
          filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.6));
          animation: ship-fly-in-across 3.3s cubic-bezier(0.33, 0.1, 0.2, 1) forwards;
        }

        .ship-phase-exiting .ship-svg,
        .ship-phase-done .ship-svg {
          animation: ship-fly-in-across 3.3s cubic-bezier(0.33, 0.1, 0.2, 1) forwards,
            ship-exit-fade 0.7s ease-in 3.3s forwards;
        }

        .ship-flame {
          animation: ship-flame-flicker 0.4s ease-in-out infinite;
        }

        .ship-trail {
          position: absolute;
          top: 50%;
          left: -10%;
          width: 0%;
          height: 10px;
          transform: translateY(-50%);
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            rgba(56, 189, 248, 0) 0%,
            rgba(56, 189, 248, 0.25) 40%,
            rgba(165, 243, 252, 0.85) 100%
          );
          filter: blur(2px);
          animation: ship-trail-grow 3.3s cubic-bezier(0.33, 0.1, 0.2, 1) forwards;
        }

        .ship-phase-exiting .ship-trail,
        .ship-phase-done .ship-trail {
          animation: ship-trail-grow 3.3s cubic-bezier(0.33, 0.1, 0.2, 1) forwards,
            ship-exit-fade 0.9s ease-in 3.2s forwards;
        }

        @keyframes ship-fly-in-across {
          0% {
            left: -40%;
            transform: translate(0, -50%) translateY(10px);
          }
          15% {
            transform: translate(0, -50%) translateY(-6px);
          }
          50% {
            transform: translate(0, -50%) translateY(0px);
          }
          100% {
            left: 100%;
            transform: translate(0, -50%) translateY(-4px);
          }
        }

        @keyframes ship-trail-grow {
          0% {
            left: -10%;
            width: 0%;
          }
          100% {
            left: 0%;
            width: 115%;
          }
        }

        @keyframes ship-exit-fade {
          to {
            opacity: 0;
          }
        }

        @keyframes ship-flame-flicker {
          0%,
          100% {
            opacity: 0.7;
            transform: scaleX(1);
          }
          50% {
            opacity: 1;
            transform: scaleX(1.25);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ship-svg,
          .ship-trail,
          .ship-flame {
            animation: none !important;
          }
          .ship-svg {
            left: 35%;
          }
          .ship-trail {
            left: 0;
            width: 50%;
          }
        }

        @media (max-width: 480px) {
          .ship-preview-stage {
            height: 110px;
          }
        }
      `}</style>
    </div>
  );
}
