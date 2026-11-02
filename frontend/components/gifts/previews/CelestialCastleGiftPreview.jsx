"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animation configuration constants
export const CELESTIAL_CASTLE_DURATION_MS = 4500; // Target duration: 4.5 seconds (Super tier)

// Windows are grouped per tower so the "lighting wave" sweeps visibly from
// the side towers into the central keep instead of flashing all at once.
const LEFT_TOWER_WINDOWS = [
  { x: 15, y: 96, delay: "0s" },
  { x: 15, y: 108, delay: "0.08s" },
  { x: 15, y: 120, delay: "0.16s" },
];
const RIGHT_TOWER_WINDOWS = [
  { x: 105, y: 96, delay: "0.05s" },
  { x: 105, y: 108, delay: "0.13s" },
  { x: 105, y: 120, delay: "0.21s" },
];
const KEEP_WINDOWS = [
  { x: 52, y: 70, delay: "0.3s" },
  { x: 68, y: 70, delay: "0.34s" },
  { x: 48, y: 86, delay: "0.4s" },
  { x: 60, y: 86, delay: "0.46s" },
  { x: 72, y: 86, delay: "0.52s" },
  { x: 48, y: 102, delay: "0.58s" },
  { x: 60, y: 102, delay: "0.64s" },
  { x: 72, y: 102, delay: "0.7s" },
  { x: 48, y: 118, delay: "0.76s" },
  { x: 60, y: 118, delay: "0.82s" },
  { x: 72, y: 118, delay: "0.88s" },
];
const ALL_WINDOWS = [...LEFT_TOWER_WINDOWS, ...RIGHT_TOWER_WINDOWS, ...KEEP_WINDOWS];

const STAR_COUNT = 26;
const EMBER_COUNT = 10;
const SPARKLE_COUNT = 12;

/**
 * CelestialCastleGiftPreview — "Castillo celestial" (2,000 Coins, propuesto)
 *
 * Super-tier cinematic scene, redesigned per the "no small flat icon"
 * creative direction: a full night-sky backdrop (gradient sky, glowing
 * moon, distant mountain silhouette) with two independently drifting,
 * blurred cloud layers that part to reveal a majestic multi-tower castle
 * (two flanking drum towers with conical roofs, a tall crenellated keep,
 * an arched gatehouse) rising in a staggered sequence. Windows light up
 * in a wave from the outer towers into the keep, banners wave on every
 * tower, birds cross the sky, and the finale blooms a golden halo behind
 * the keep with radiating god-rays, rising embers and a starburst over
 * the central spire before settling into a soft afterglow.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function CelestialCastleGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("rising"); // rising -> windowsLit -> halo -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const windowsTimer = setTimeout(() => setPhase("windowsLit"), 1700);
    const haloTimer = setTimeout(() => setPhase("halo"), 3000);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, CELESTIAL_CASTLE_DURATION_MS);

    timersRef.current = [windowsTimer, haloTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        left: `${(i * 17) % 100}%`,
        top: `${(i * 31) % 45}%`,
        size: 1 + (i % 3),
        delay: `${(i % 9) * 0.22}s`,
      })),
    []
  );

  const embers = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => ({
        left: `${22 + ((i * 7) % 56)}%`,
        delay: `${(i % 6) * 0.18}s`,
        duration: `${2.1 + (i % 4) * 0.35}s`,
      })),
    []
  );

  const sparkles = useMemo(
    () =>
      Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
        rotate: (360 / SPARKLE_COUNT) * i,
        delay: `${(i % 6) * 0.05}s`,
      })),
    []
  );

  return (
    <div className={`castle-preview-stage castle-phase-${phase}`}>
      {/* Night sky backdrop */}
      <svg className="castle-sky-svg" viewBox="0 0 120 140" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="castleSkyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="45%" stopColor="#4c1d95" />
            <stop offset="78%" stopColor="#7e22ce" />
            <stop offset="100%" stopColor="#312e81" />
          </linearGradient>
          <radialGradient id="castleMoonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(224,231,255,0.85)" />
            <stop offset="100%" stopColor="rgba(224,231,255,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="120" height="140" fill="url(#castleSkyGradient)" />
        <circle cx="94" cy="26" r="20" fill="url(#castleMoonGlow)" />
        <circle cx="94" cy="26" r="9" fill="#f8fafc" />
        <circle cx="91" cy="23" r="1.6" fill="#cbd5e1" opacity="0.6" />
        <circle cx="97" cy="29" r="1.1" fill="#cbd5e1" opacity="0.5" />
        {/* Distant mountain silhouette */}
        <path
          d="M0 95 L14 78 L24 90 L36 70 L50 92 L64 76 L78 94 L92 80 L106 92 L120 84 L120 140 L0 140 Z"
          fill="#2e1065"
          opacity="0.75"
        />
      </svg>

      <div className="castle-stars" aria-hidden="true">
        {stars.map((s, i) => (
          <span
            key={i}
            className="castle-star"
            style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}
          />
        ))}
      </div>

      {/* Birds crossing the sky during the rise */}
      <div className="castle-birds" aria-hidden="true">
        <svg className="castle-bird castle-bird-1" viewBox="0 0 10 4"><path d="M0 4 Q2.5 0 5 4 Q7.5 0 10 4" stroke="#c7d2fe" strokeWidth="0.8" fill="none" /></svg>
        <svg className="castle-bird castle-bird-2" viewBox="0 0 10 4"><path d="M0 4 Q2.5 0 5 4 Q7.5 0 10 4" stroke="#c7d2fe" strokeWidth="0.8" fill="none" /></svg>
      </div>

      {/* Radiant god-rays behind the keep, only visible during the halo climax */}
      <div className="castle-godrays" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="castle-godray" style={{ transform: `rotate(${i * (360 / 14)}deg)` }} />
        ))}
      </div>
      <div className="castle-halo" aria-hidden="true" />

      {/* Rising embers from the lit windows */}
      <div className="castle-embers" aria-hidden="true">
        {embers.map((e, i) => (
          <span
            key={i}
            className="castle-ember"
            style={{ left: e.left, animationDelay: e.delay, animationDuration: e.duration }}
          />
        ))}
      </div>

      {/* Finale starburst over the central spire */}
      <div className="castle-sparkles" aria-hidden="true">
        {sparkles.map((s, i) => (
          <span
            key={i}
            className="castle-sparkle"
            style={{ transform: `rotate(${s.rotate}deg)`, animationDelay: s.delay }}
          />
        ))}
      </div>

      {/* Cloud layers: one drifts behind the castle, one drifts in front of its base */}
      <div className="castle-clouds castle-clouds-back" aria-hidden="true">
        <span className="castle-cloud" style={{ left: "-10%", top: "38%" }} />
        <span className="castle-cloud" style={{ left: "55%", top: "30%" }} />
      </div>
      <div className="castle-clouds castle-clouds-mid" aria-hidden="true">
        <span className="castle-cloud" style={{ left: "10%", top: "58%" }} />
        <span className="castle-cloud" style={{ left: "60%", top: "62%" }} />
      </div>

      <svg className="castle-svg" viewBox="0 0 120 140" role="img" aria-label="Celestial castle gift animation">
        <defs>
          <linearGradient id="castleStoneGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4338ca" />
            <stop offset="45%" stopColor="#818cf8" />
            <stop offset="60%" stopColor="#c7d2fe" />
            <stop offset="100%" stopColor="#3730a3" />
          </linearGradient>
          <linearGradient id="castleRoofGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <radialGradient id="castleGateGlow" cx="50%" cy="100%" r="100%">
            <stop offset="0%" stopColor="rgba(254,243,199,0.9)" />
            <stop offset="100%" stopColor="rgba(254,243,199,0)" />
          </radialGradient>
        </defs>

        {/* Left drum tower with conical roof */}
        <g className="castle-tower castle-tower-left">
          <rect x="6" y="92" width="24" height="40" rx="3" fill="url(#castleStoneGradient)" />
          <path d="M4 92 L18 68 L32 92 Z" fill="url(#castleRoofGradient)" />
          <line x1="18" y1="68" x2="18" y2="56" stroke="#c7d2fe" strokeWidth="1.2" />
          <path className="castle-flag castle-flag-left" d="M18 56 L28 60 L18 64 Z" fill="#fbbf24" />
        </g>

        {/* Right drum tower with conical roof */}
        <g className="castle-tower castle-tower-right">
          <rect x="90" y="92" width="24" height="40" rx="3" fill="url(#castleStoneGradient)" />
          <path d="M88 92 L102 68 L116 92 Z" fill="url(#castleRoofGradient)" />
          <line x1="102" y1="68" x2="102" y2="56" stroke="#c7d2fe" strokeWidth="1.2" />
          <path className="castle-flag castle-flag-right" d="M102 56 L112 60 L102 64 Z" fill="#fbbf24" />
        </g>

        {/* Curtain wall with crenellations connecting the towers to the keep */}
        <g className="castle-wall" fill="url(#castleStoneGradient)">
          <rect x="30" y="112" width="18" height="20" />
          <rect x="72" y="112" width="18" height="20" />
          {[32, 37, 42].map((x) => (
            <rect key={`l-${x}`} x={x} y="107" width="4" height="6" />
          ))}
          {[74, 79, 84].map((x) => (
            <rect key={`r-${x}`} x={x} y="107" width="4" height="6" />
          ))}
        </g>

        {/* Central keep (tallest, focal tower) */}
        <g className="castle-tower castle-tower-keep">
          <rect x="42" y="66" width="36" height="66" rx="2" fill="url(#castleStoneGradient)" />
          {/* Crenellations along the keep roofline */}
          {[44, 50, 56, 62, 68, 74].map((x) => (
            <rect key={x} x={x} y="60" width="4" height="7" fill="url(#castleStoneGradient)" />
          ))}
          {/* Small central turret */}
          <rect x="54" y="42" width="12" height="20" rx="2" fill="url(#castleStoneGradient)" />
          <path d="M52 42 L60 26 L68 42 Z" fill="url(#castleRoofGradient)" />
          <line x1="60" y1="26" x2="60" y2="12" stroke="#c7d2fe" strokeWidth="1.2" />
          <path className="castle-flag castle-flag-center" d="M60 12 L72 16 L60 20 Z" fill="#fde68a" />
        </g>

        {/* Arched gatehouse with warm interior glow */}
        <path d="M52 132 L52 110 Q60 100 68 110 L68 132 Z" fill="#1e1b4b" />
        <path d="M54 132 L54 112 Q60 104 66 112 L66 132 Z" fill="url(#castleGateGlow)" opacity="0.8" />
        <g className="castle-gate-bars" stroke="#312e81" strokeWidth="1">
          <line x1="57" y1="132" x2="57" y2="109" />
          <line x1="60" y1="132" x2="60" y2="104" />
          <line x1="63" y1="132" x2="63" y2="109" />
        </g>

        {/* Windows, light up progressively left/right towers first, then the keep */}
        <g className="castle-windows">
          {ALL_WINDOWS.map((w, i) => (
            <rect
              key={i}
              className="castle-window"
              x={w.x - 1.8}
              y={w.y}
              width="3.6"
              height="5"
              rx="1"
              fill="#fef3c7"
              style={{ animationDelay: w.delay }}
            />
          ))}
        </g>
      </svg>

      <style jsx>{`
        .castle-preview-stage {
          position: relative;
          width: 100%;
          max-width: 420px;
          aspect-ratio: 6 / 7;
          margin: 0 auto;
          overflow: hidden;
          border-radius: 14px;
          isolation: isolate;
        }

        .castle-sky-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
        }

        .castle-stars {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
        }
        .castle-star {
          position: absolute;
          background: #e0e7ff;
          border-radius: 50%;
          opacity: 0.4;
          animation: castle-star-twinkle 2.4s ease-in-out infinite;
        }

        .castle-birds {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          opacity: 0;
        }
        .castle-phase-rising .castle-birds,
        .castle-phase-windowsLit .castle-birds {
          opacity: 1;
        }
        .castle-bird {
          position: absolute;
          width: 14px;
          height: 6px;
          top: 18%;
          left: -8%;
        }
        .castle-bird-1 {
          animation: castle-bird-fly 3.6s linear infinite;
        }
        .castle-bird-2 {
          top: 24%;
          animation: castle-bird-fly 4.4s linear 0.8s infinite;
        }

        .castle-clouds {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          filter: blur(5px);
        }
        .castle-clouds-back {
          z-index: 2;
          opacity: 0.8;
        }
        .castle-clouds-mid {
          z-index: 5;
          opacity: 0.9;
        }
        .castle-cloud {
          position: absolute;
          width: 46%;
          height: 16%;
          background: radial-gradient(ellipse, rgba(226, 232, 240, 0.85), rgba(226, 232, 240, 0));
          border-radius: 50%;
        }
        .castle-clouds-back .castle-cloud {
          animation: castle-cloud-drift 14s linear infinite;
        }
        .castle-clouds-mid .castle-cloud {
          animation: castle-cloud-drift 9s linear infinite;
        }
        .castle-phase-halo .castle-clouds-mid,
        .castle-phase-done .castle-clouds-mid {
          opacity: 0.35;
          transition: opacity 1.2s ease;
        }

        .castle-godrays {
          position: absolute;
          inset: 0;
          margin: auto;
          top: -6%;
          width: 1px;
          height: 1px;
          z-index: 3;
          pointer-events: none;
          opacity: 0;
        }
        .castle-phase-halo .castle-godrays,
        .castle-phase-done .castle-godrays {
          opacity: 1;
          animation: castle-godrays-spin 10s linear infinite;
        }
        .castle-godray {
          position: absolute;
          top: 0;
          left: 0;
          width: 3.5px;
          height: 52%;
          background: linear-gradient(to bottom, rgba(254, 240, 180, 1), rgba(253, 230, 138, 0));
          transform-origin: top center;
          filter: drop-shadow(0 0 3px rgba(253, 230, 138, 0.8));
        }

        .castle-halo {
          position: absolute;
          left: 0;
          right: 0;
          margin: auto;
          top: 12%;
          width: 62%;
          height: 34%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(254, 240, 180, 0.95), rgba(253, 211, 100, 0.35) 55%, rgba(253, 230, 138, 0));
          opacity: 0;
          pointer-events: none;
          z-index: 3;
        }
        .castle-phase-halo .castle-halo {
          animation: castle-halo-bloom 1.4s ease-out forwards;
        }
        .castle-phase-done .castle-halo {
          opacity: 0.4;
          transition: opacity 1.1s ease;
        }

        .castle-embers {
          position: absolute;
          inset: 0;
          z-index: 6;
          pointer-events: none;
          opacity: 0;
        }
        .castle-phase-windowsLit .castle-embers,
        .castle-phase-halo .castle-embers,
        .castle-phase-done .castle-embers {
          opacity: 1;
        }
        .castle-ember {
          position: absolute;
          bottom: 22%;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #fde68a;
          box-shadow: 0 0 6px rgba(253, 230, 138, 0.95);
          animation: castle-ember-rise 2.6s ease-in infinite;
        }

        .castle-sparkles {
          position: absolute;
          inset: 0;
          margin: auto;
          top: -22%;
          width: 1px;
          height: 1px;
          z-index: 6;
          pointer-events: none;
          opacity: 0;
        }
        .castle-phase-halo .castle-sparkles {
          opacity: 1;
        }
        .castle-sparkle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 2px;
          height: 0;
          background: linear-gradient(to bottom, rgba(254, 240, 138, 0.95), rgba(254, 240, 138, 0));
          transform-origin: top center;
        }
        .castle-phase-halo .castle-sparkle {
          animation: castle-sparkle-shoot 1.1s ease-out forwards;
        }

        .castle-svg {
          position: relative;
          width: 100%;
          height: 100%;
          z-index: 4;
        }

        .castle-tower {
          opacity: 0;
          transform: translateY(26px);
        }
        .castle-tower-left {
          animation: castle-rise 1.1s cubic-bezier(0.22, 0.85, 0.3, 1.1) 0.1s forwards;
        }
        .castle-tower-right {
          animation: castle-rise 1.1s cubic-bezier(0.22, 0.85, 0.3, 1.1) 0.25s forwards;
        }
        .castle-tower-keep {
          animation: castle-rise 1.2s cubic-bezier(0.22, 0.85, 0.3, 1.1) 0.5s forwards;
        }
        .castle-wall {
          opacity: 0;
          animation: castle-fade-in 1s ease-out 0.7s forwards;
        }

        .castle-window {
          opacity: 0;
        }
        .castle-phase-windowsLit .castle-window,
        .castle-phase-halo .castle-window,
        .castle-phase-done .castle-window {
          animation: castle-window-glow 1.3s ease-in-out infinite;
        }

        .castle-flag {
          transform-origin: center left;
          animation: castle-flag-wave 1.4s ease-in-out infinite;
        }
        .castle-flag-right {
          animation-delay: 0.3s;
        }
        .castle-flag-center {
          animation-delay: 0.15s;
        }

        @keyframes castle-rise {
          0% {
            opacity: 0;
            transform: translateY(26px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes castle-fade-in {
          to {
            opacity: 1;
          }
        }
        @keyframes castle-window-glow {
          0%,
          100% {
            opacity: 0.55;
            filter: drop-shadow(0 0 1px rgba(254, 243, 199, 0.6));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 4px rgba(254, 243, 199, 1));
          }
        }
        @keyframes castle-flag-wave {
          0%,
          100% {
            transform: skewX(0deg);
          }
          50% {
            transform: skewX(-14deg);
          }
        }
        @keyframes castle-star-twinkle {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.9;
          }
        }
        @keyframes castle-bird-fly {
          0% {
            left: -8%;
            transform: translateY(0);
          }
          50% {
            transform: translateY(-6px);
          }
          100% {
            left: 108%;
            transform: translateY(0);
          }
        }
        @keyframes castle-cloud-drift {
          0% {
            transform: translateX(-20%);
          }
          100% {
            transform: translateX(140%);
          }
        }
        @keyframes castle-godrays-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes castle-halo-bloom {
          0% {
            opacity: 0;
            transform: scale(0.7);
          }
          55% {
            opacity: 1;
            transform: scale(1.2);
          }
          100% {
            opacity: 0.5;
            transform: scale(1);
          }
        }
        @keyframes castle-ember-rise {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          100% {
            transform: translateY(-90px) scale(0.4);
            opacity: 0;
          }
        }
        @keyframes castle-sparkle-shoot {
          0% {
            height: 0;
            opacity: 1;
          }
          100% {
            height: 32px;
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .castle-tower,
          .castle-wall,
          .castle-window,
          .castle-flag,
          .castle-star,
          .castle-halo,
          .castle-godrays,
          .castle-godray,
          .castle-ember,
          .castle-sparkle,
          .castle-bird,
          .castle-cloud {
            animation: none !important;
          }
          .castle-tower,
          .castle-wall {
            opacity: 1;
            transform: translateY(0);
          }
          .castle-window {
            opacity: 1;
          }
          .castle-halo {
            opacity: 0.4;
          }
          .castle-embers,
          .castle-sparkles,
          .castle-birds {
            opacity: 0;
          }
        }

        @media (max-width: 480px) {
          .castle-preview-stage {
            max-width: 280px;
          }
        }
      `}</style>
    </div>
  );
}
