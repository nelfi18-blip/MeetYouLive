"use client";

import { useEffect, useRef, useState } from "react";

// Animation configuration constants
export const EXPLORER_SHIP_DURATION_MS = 4000; // Target duration: 4 seconds

/**
 * ExplorerShipGiftPreview — "Nave exploradora" (800 Coins, propuesto)
 *
 * A recognizable, higher-impact futuristic ship silhouette (SVG) that:
 *  - Warps in from the left edge of its stage (a quick scale/stretch "jump
 *    to sub-light" entrance), banking gently as it accelerates.
 *  - Flies across in a dynamic arc with a layered engine trail: a soft
 *    outer glow trail plus a brighter inner core trail, both tracking the
 *    ship's position, and twin side-thruster flares plus a main engine
 *    flare that flicker independently for a sense of propulsion.
 *  - Has visible hull volume via a dual-gradient body (bright topside
 *    highlight + darker underside), a glass cockpit dome with a reflection
 *    highlight, and distinct engine nacelles — not a flat icon.
 *  - Exits off the right edge with a brief warp-out stretch, trail fading
 *    out shortly after.
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
      <div className="ship-trail ship-trail-outer" aria-hidden="true" />
      <div className="ship-trail ship-trail-core" aria-hidden="true" />

      <svg
        className="ship-svg"
        viewBox="0 0 160 70"
        role="img"
        aria-label="Explorer ship gift animation"
      >
        <defs>
          <linearGradient id="shipHullGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="35%" stopColor="#7dd3fc" />
            <stop offset="70%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#075985" />
          </linearGradient>
          <linearGradient id="shipTopHighlight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="shipFlameGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(56,189,248,0)" />
            <stop offset="100%" stopColor="rgba(125,211,252,0.95)" />
          </linearGradient>
        </defs>

        {/* Main engine exhaust flare */}
        <ellipse className="ship-flame ship-flame-main" cx="8" cy="35" rx="11" ry="4.5" fill="url(#shipFlameGradient)" />
        {/* Twin side-thruster flares for a stronger sense of propulsion */}
        <ellipse className="ship-flame ship-flame-side" cx="22" cy="24" rx="5" ry="2.4" fill="url(#shipFlameGradient)" />
        <ellipse className="ship-flame ship-flame-side" cx="22" cy="46" rx="5" ry="2.4" fill="url(#shipFlameGradient)" />

        {/* Engine nacelles, give the hull more volume at the rear */}
        <ellipse cx="30" cy="35" rx="9" ry="5" fill="#0ea5e9" opacity="0.9" />
        <ellipse cx="22" cy="35" rx="5" ry="4" fill="#38bdf8" />

        {/* Hull — a recognizable, higher-detail explorer-ship silhouette */}
        <path
          className="ship-hull"
          d="M20 35 L50 20 L115 24 L148 35 L115 46 L50 50 Z"
          fill="url(#shipHullGradient)"
          stroke="#0ea5e9"
          strokeWidth="1"
        />
        {/* Topside specular highlight strip, gives the hull volume */}
        <path d="M20 35 L50 20 L115 24 L148 35 L115 32 L50 29 Z" fill="url(#shipTopHighlight)" opacity="0.75" />

        {/* Cockpit glass dome + reflection highlight */}
        <ellipse cx="100" cy="34" rx="11" ry="7" fill="#0f172a" opacity="0.7" />
        <ellipse cx="100" cy="34" rx="11" ry="7" fill="none" stroke="#bae6fd" strokeWidth="1" />
        <ellipse cx="97" cy="31" rx="4" ry="2" fill="#ffffff" opacity="0.6" />

        {/* Wing fins */}
        <path className="ship-hull" d="M65 22 L52 4 L78 22 Z" fill="url(#shipHullGradient)" stroke="#0ea5e9" strokeWidth="1" />
        <path className="ship-hull" d="M65 48 L52 66 L78 48 Z" fill="url(#shipHullGradient)" stroke="#0ea5e9" strokeWidth="1" />
      </svg>

      <style jsx>{`
        .ship-preview-stage {
          position: relative;
          width: 100%;
          max-width: 340px;
          height: 170px;
          margin: 0 auto;
          overflow: hidden;
        }

        .ship-svg {
          position: absolute;
          top: 50%;
          left: -45%;
          width: 65%;
          transform: translate(0, -50%) scaleX(1);
          filter: drop-shadow(0 0 12px rgba(56, 189, 248, 0.65));
          animation: ship-warp-in 0.4s ease-out forwards,
            ship-fly-in-across 3.3s 0.1s cubic-bezier(0.33, 0.1, 0.2, 1) forwards;
        }

        .ship-phase-exiting .ship-svg,
        .ship-phase-done .ship-svg {
          animation: ship-warp-in 0.4s ease-out forwards,
            ship-fly-in-across 3.3s 0.1s cubic-bezier(0.33, 0.1, 0.2, 1) forwards,
            ship-warp-out 0.6s ease-in 3.3s forwards;
        }

        .ship-flame-main {
          animation: ship-flame-flicker 0.4s ease-in-out infinite;
        }
        .ship-flame-side {
          animation: ship-flame-flicker 0.3s ease-in-out infinite;
          animation-delay: 0.15s;
        }

        .ship-trail {
          position: absolute;
          top: 50%;
          left: -10%;
          width: 0%;
          transform: translateY(-50%);
          border-radius: 999px;
          pointer-events: none;
        }

        .ship-trail-outer {
          height: 16px;
          background: linear-gradient(
            90deg,
            rgba(56, 189, 248, 0) 0%,
            rgba(56, 189, 248, 0.18) 45%,
            rgba(125, 211, 252, 0.55) 100%
          );
          filter: blur(5px);
          animation: ship-trail-grow 3.3s 0.1s cubic-bezier(0.33, 0.1, 0.2, 1) forwards;
        }

        .ship-trail-core {
          height: 5px;
          background: linear-gradient(
            90deg,
            rgba(224, 242, 254, 0) 0%,
            rgba(224, 242, 254, 0.5) 50%,
            rgba(255, 255, 255, 0.95) 100%
          );
          filter: blur(1px);
          animation: ship-trail-grow 3.3s 0.1s cubic-bezier(0.33, 0.1, 0.2, 1) forwards;
        }

        .ship-phase-exiting .ship-trail,
        .ship-phase-done .ship-trail {
          animation-name: ship-trail-grow, ship-exit-fade;
          animation-duration: 3.3s, 0.9s;
          animation-delay: 0.1s, 3.2s;
          animation-timing-function: cubic-bezier(0.33, 0.1, 0.2, 1), ease-in;
          animation-fill-mode: forwards, forwards;
        }

        @keyframes ship-warp-in {
          0% {
            opacity: 0;
            transform: translate(0, -50%) scaleX(2.4) scaleY(0.6);
          }
          100% {
            opacity: 1;
            transform: translate(0, -50%) scaleX(1) scaleY(1);
          }
        }

        @keyframes ship-warp-out {
          to {
            opacity: 0;
            transform: translate(0, -50%) scaleX(2.2) scaleY(0.55);
          }
        }

        @keyframes ship-fly-in-across {
          0% {
            left: -45%;
            transform: translate(0, -50%) translateY(10px) rotate(-6deg);
          }
          15% {
            transform: translate(0, -50%) translateY(-8px) rotate(3deg);
          }
          50% {
            transform: translate(0, -50%) translateY(0px) rotate(0deg);
          }
          100% {
            left: 100%;
            transform: translate(0, -50%) translateY(-5px) rotate(4deg);
          }
        }

        @keyframes ship-trail-grow {
          0% {
            left: -10%;
            width: 0%;
          }
          100% {
            left: 0%;
            width: 118%;
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
          .ship-flame-main,
          .ship-flame-side {
            animation: none !important;
          }
          .ship-svg {
            left: 35%;
            opacity: 1;
            transform: translate(0, -50%);
          }
          .ship-trail {
            left: 0;
            width: 50%;
          }
        }

        @media (max-width: 480px) {
          .ship-preview-stage {
            height: 115px;
          }
        }
      `}</style>
    </div>
  );
}
