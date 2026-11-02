"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Animation configuration constants
export const CELESTIAL_CASTLE_DURATION_MS = 4500; // Target duration: 4.5 seconds (Super tier)

const EMBER_COUNT = 10;
const SPARKLE_COUNT = 14;
const GODRAY_COUNT = 10;

/**
 * CelestialCastleGiftPreview — "Castillo celestial" (2,000 Coins, propuesto)
 *
 * Uses the owner-approved cinematic illustration (a layered-cloud castle
 * floating above an illuminated sky) as the primary visual asset, instead
 * of a hand-drawn SVG castle. The illustration is composited with
 * animated CSS layers — a clip-path "iris" reveal + scale/translate for
 * the entrance, a diagonal light-sweep overlay that simulates windows and
 * pathways igniting, a rotating god-ray + golden/violet glow overlay for
 * the climax, foreground drifting cloud layers for parallax depth, and a
 * particle layer (embers + SVG sparkle shoots) — so the scene has real,
 * perceptible motion across four stages:
 *
 *   1. emerging  — the castle rises out of an iris-shaped cloud opening,
 *                  with scale/translate/filter motion (not a static zoom).
 *   2. lighting  — a warm light sweep passes across the towers/paths and
 *                  overall brightness ramps up, as if windows switch on.
 *   3. spectacle — a pulsing gold+violet glow, rotating god-rays and a
 *                  burst of ember/sparkle particles play over the art.
 *   4. fading    — the whole scene dissolves gently so the Live feed
 *                  underneath is never blocked after the gift finishes.
 *
 * Self-contained, inline (non full-screen) preview card. Does not touch
 * Coins/catalog/send logic.
 *
 * Props:
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function CelestialCastleGiftPreview({ onComplete }) {
  const [phase, setPhase] = useState("emerging"); // emerging -> lighting -> spectacle -> fading -> done
  const timersRef = useRef([]);

  useEffect(() => {
    const lightingTimer = setTimeout(() => setPhase("lighting"), 1400);
    const spectacleTimer = setTimeout(() => setPhase("spectacle"), 2600);
    const fadingTimer = setTimeout(() => setPhase("fading"), 3800);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      if (onComplete) onComplete();
    }, CELESTIAL_CASTLE_DURATION_MS);

    timersRef.current = [lightingTimer, spectacleTimer, fadingTimer, doneTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [onComplete]);

  const embers = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => ({
        left: `${18 + ((i * 7) % 62)}%`,
        delay: `${(i % 6) * 0.18}s`,
        duration: `${2.1 + (i % 4) * 0.35}s`,
      })),
    []
  );

  const sparkles = useMemo(
    () =>
      Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
        rotate: (360 / SPARKLE_COUNT) * i,
        delay: `${(i % 7) * 0.06}s`,
      })),
    []
  );

  const godrays = useMemo(
    () =>
      Array.from({ length: GODRAY_COUNT }, (_, i) => ({
        rotate: (360 / GODRAY_COUNT) * i,
      })),
    []
  );

  return (
    <div className={`castle-preview-stage castle-phase-${phase}`}>
      <div className="castle-art-frame">
        {/* Primary visual asset: the owner-approved cinematic illustration */}
        <picture>
          <source
            srcSet="/gifts/celestial-castle/castle-hero-mobile.webp"
            media="(max-width: 480px)"
          />
          <img
            className="castle-hero-image"
            src="/gifts/celestial-castle/castle-hero.webp"
            alt="Castillo celestial flotando entre nubes doradas y un cielo estrellado"
            draggable={false}
          />
        </picture>

        {/* Foreground parallax clouds — pass in front of the image to sell
            depth and the "emerging between clouds" read, independent of
            whatever clouds are baked into the illustration itself. */}
        <div className="castle-cloud-front castle-cloud-front-1" aria-hidden="true" />
        <div className="castle-cloud-front castle-cloud-front-2" aria-hidden="true" />
        <div className="castle-cloud-front castle-cloud-front-3" aria-hidden="true" />

        {/* Stage 2: diagonal light sweep simulating windows/paths igniting,
            plus a lasting glow so the windows/path stay "switched on"
            instead of just flashing past once. */}
        <div className="castle-light-sweep" aria-hidden="true" />
        <div className="castle-window-glow" aria-hidden="true" />

        {/* Orbiting energy rings — animated light ribbons that travel
            around an elliptical path encircling the castle, echoing the
            golden halo already painted into the illustration but adding
            real, independent motion (dash-offset travel), not a static
            ring. */}
        <svg className="castle-energy-ring castle-energy-ring-1" viewBox="0 0 220 110" aria-hidden="true">
          <defs>
            <linearGradient id="castleRingGradA" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fcd34d" stopOpacity="0" />
              <stop offset="50%" stopColor="#ffe9a8" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
            </linearGradient>
          </defs>
          <ellipse cx="110" cy="55" rx="100" ry="34" fill="none" stroke="url(#castleRingGradA)" strokeWidth="2.6" strokeLinecap="round" pathLength="100" />
        </svg>
        <svg className="castle-energy-ring castle-energy-ring-2" viewBox="0 0 220 110" aria-hidden="true">
          <defs>
            <linearGradient id="castleRingGradB" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c084fc" stopOpacity="0" />
              <stop offset="50%" stopColor="#e9d5ff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#fcd34d" stopOpacity="0" />
            </linearGradient>
          </defs>
          <ellipse cx="110" cy="55" rx="78" ry="24" fill="none" stroke="url(#castleRingGradB)" strokeWidth="2" strokeLinecap="round" pathLength="100" />
        </svg>

        {/* Stage 3: gold + violet spectacle glow and rotating god-rays */}
        <div className="castle-spectacle-glow" aria-hidden="true" />
        <div className="castle-godray-overlay" aria-hidden="true">
          {godrays.map((ray, i) => (
            <span
              key={i}
              className="castle-godray"
              style={{ transform: `rotate(${ray.rotate}deg)` }}
            />
          ))}
        </div>

        {/* Rising embers */}
        <div className="castle-embers" aria-hidden="true">
          {embers.map((ember, i) => (
            <span
              key={i}
              className="castle-ember"
              style={{
                left: ember.left,
                animationDelay: ember.delay,
                animationDuration: ember.duration,
              }}
            />
          ))}
        </div>

        {/* Sparkle shoots radiating from the castle at the climax */}
        <div className="castle-sparkles" aria-hidden="true">
          {sparkles.map((sparkle, i) => (
            <svg
              key={i}
              className="castle-sparkle"
              viewBox="0 0 2 12"
              style={{
                transform: `rotate(${sparkle.rotate}deg)`,
                animationDelay: sparkle.delay,
              }}
            >
              <line x1="1" y1="0" x2="1" y2="12" stroke="#ffe9a8" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          ))}
        </div>
      </div>

      <style jsx>{`
        .castle-preview-stage {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 8px 0;
        }

        .castle-art-frame {
          position: relative;
          width: 100%;
          max-width: 360px;
          aspect-ratio: 941 / 1672;
          border-radius: 18px;
          overflow: hidden;
          background: #0b0b23;
          box-shadow: 0 18px 60px rgba(76, 29, 149, 0.45);
        }

        .castle-hero-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 30%;
          transform: scale(1.18) translateY(22px);
          clip-path: ellipse(10% 6% at 50% 64%);
          filter: brightness(0.45) saturate(0.7);
        }
        .castle-phase-emerging .castle-hero-image {
          animation: castle-hero-reveal 1.5s cubic-bezier(0.45, 0, 0.4, 1) forwards;
        }
        .castle-phase-lighting .castle-hero-image,
        .castle-phase-spectacle .castle-hero-image,
        .castle-phase-fading .castle-hero-image,
        .castle-phase-done .castle-hero-image {
          clip-path: ellipse(150% 150% at 50% 55%);
          transform: scale(1) translateY(0);
        }
        .castle-phase-lighting .castle-hero-image {
          filter: brightness(0.9) saturate(1.05);
          transition: filter 1.1s ease;
        }
        .castle-phase-spectacle .castle-hero-image {
          filter: brightness(1.1) saturate(1.3) contrast(1.05);
          transition: filter 1s ease;
        }
        .castle-phase-fading .castle-hero-image,
        .castle-phase-done .castle-hero-image {
          filter: brightness(0.92) saturate(1);
          transition: filter 0.8s ease;
        }

        .castle-cloud-front {
          position: absolute;
          border-radius: 50%;
          filter: blur(7px);
          opacity: 0.85;
          pointer-events: none;
          background: radial-gradient(ellipse at center, rgba(216, 203, 255, 0.6), rgba(216, 203, 255, 0) 70%);
        }
        .castle-cloud-front-1 {
          left: -22%;
          bottom: -8%;
          width: 62%;
          height: 32%;
          animation: castle-cloud-drift-1 7s ease-in-out infinite;
        }
        .castle-cloud-front-2 {
          right: -24%;
          top: 38%;
          width: 52%;
          height: 26%;
          animation: castle-cloud-drift-2 9s ease-in-out infinite 0.6s;
        }
        .castle-cloud-front-3 {
          left: 26%;
          bottom: -14%;
          width: 72%;
          height: 30%;
          animation: castle-cloud-drift-3 11s ease-in-out infinite 1.2s;
        }
        .castle-phase-spectacle .castle-cloud-front,
        .castle-phase-fading .castle-cloud-front,
        .castle-phase-done .castle-cloud-front {
          opacity: 0;
          transition: opacity 1s ease;
        }

        .castle-light-sweep {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            115deg,
            transparent 32%,
            rgba(255, 236, 180, 0) 40%,
            rgba(255, 230, 160, 0.6) 48%,
            rgba(255, 214, 130, 0) 56%,
            transparent 64%
          );
          mix-blend-mode: screen;
          opacity: 0;
          transform: translateX(-70%) translateY(8%);
          pointer-events: none;
        }
        .castle-phase-lighting .castle-light-sweep {
          opacity: 1;
          animation: castle-sweep-pass 1.3s ease-in-out forwards;
        }
        .castle-phase-spectacle .castle-light-sweep,
        .castle-phase-fading .castle-light-sweep,
        .castle-phase-done .castle-light-sweep {
          opacity: 0;
          transition: opacity 0.6s ease;
        }

        .castle-window-glow {
          position: absolute;
          inset: 0;
          opacity: 0;
          mix-blend-mode: screen;
          pointer-events: none;
          background: radial-gradient(
            ellipse 70% 38% at 50% 46%,
            rgba(255, 221, 150, 0.55) 0%,
            rgba(255, 221, 150, 0.22) 45%,
            rgba(255, 221, 150, 0) 78%
          );
        }
        .castle-phase-lighting .castle-window-glow {
          opacity: 0.85;
          transition: opacity 1.1s ease 0.3s;
        }
        .castle-phase-spectacle .castle-window-glow {
          opacity: 1;
          animation: castle-spectacle-pulse 1.1s ease-in-out infinite alternate;
        }
        .castle-phase-fading .castle-window-glow,
        .castle-phase-done .castle-window-glow {
          opacity: 0;
          transition: opacity 0.8s ease;
        }

        .castle-energy-ring {
          position: absolute;
          left: 50%;
          top: 58%;
          width: 94%;
          height: auto;
          transform: translate(-50%, -50%) rotateX(62deg) rotate(0deg);
          transform-style: preserve-3d;
          overflow: visible;
          opacity: 0;
          pointer-events: none;
        }
        .castle-energy-ring ellipse {
          stroke-dasharray: 26 74;
          stroke-dashoffset: 0;
        }
        .castle-phase-lighting .castle-energy-ring,
        .castle-phase-spectacle .castle-energy-ring {
          opacity: 0.9;
        }
        .castle-phase-lighting .castle-energy-ring-1,
        .castle-phase-spectacle .castle-energy-ring-1 {
          animation: castle-ring-orbit 3.2s linear infinite;
        }
        .castle-phase-lighting .castle-energy-ring-2,
        .castle-phase-spectacle .castle-energy-ring-2 {
          animation: castle-ring-orbit-reverse 4.4s linear infinite;
        }
        .castle-phase-fading .castle-energy-ring,
        .castle-phase-done .castle-energy-ring {
          opacity: 0;
          transition: opacity 0.6s ease;
        }

        .castle-spectacle-glow {
          position: absolute;
          inset: 0;
          opacity: 0;
          mix-blend-mode: overlay;
          pointer-events: none;
        }
        .castle-phase-spectacle .castle-spectacle-glow {
          opacity: 1;
          animation: castle-spectacle-pulse 1.1s ease-in-out infinite alternate;
        }
        .castle-phase-fading .castle-spectacle-glow,
        .castle-phase-done .castle-spectacle-glow {
          opacity: 0;
          transition: opacity 0.8s ease;
        }

        .castle-godray-overlay {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 10%;
          height: 10%;
          top: 32%;
          opacity: 0;
          mix-blend-mode: screen;
          pointer-events: none;
        }
        .castle-phase-spectacle .castle-godray-overlay {
          opacity: 0.85;
          animation: castle-godray-spin 6s linear infinite;
        }
        .castle-phase-fading .castle-godray-overlay,
        .castle-phase-done .castle-godray-overlay {
          opacity: 0;
          transition: opacity 0.6s ease;
        }
        .castle-godray {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 3px;
          height: 420%;
          background: linear-gradient(to bottom, rgba(255, 236, 190, 0.85), rgba(255, 236, 190, 0) 55%);
          transform-origin: top center;
          filter: drop-shadow(0 0 3px rgba(255, 221, 150, 0.7));
        }

        .castle-embers {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          opacity: 0;
        }
        .castle-phase-lighting .castle-embers,
        .castle-phase-spectacle .castle-embers,
        .castle-phase-fading .castle-embers {
          opacity: 1;
          transition: opacity 0.5s ease;
        }
        .castle-ember {
          position: absolute;
          bottom: 16%;
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
          top: -8%;
          width: 1px;
          height: 1px;
          z-index: 4;
          pointer-events: none;
          opacity: 0;
        }
        .castle-phase-spectacle .castle-sparkles {
          opacity: 1;
        }
        .castle-sparkle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 10px;
          height: 60px;
          overflow: visible;
          transform-origin: top center;
          opacity: 0;
        }
        .castle-phase-spectacle .castle-sparkle {
          animation: castle-sparkle-shoot 1.1s ease-out forwards;
        }

        @keyframes castle-hero-reveal {
          0% {
            clip-path: ellipse(10% 6% at 50% 64%);
            transform: scale(1.18) translateY(22px);
            filter: brightness(0.45) saturate(0.7);
          }
          55% {
            clip-path: ellipse(72% 66% at 50% 57%);
            transform: scale(1.06) translateY(9px);
            filter: brightness(0.62) saturate(0.85);
          }
          100% {
            clip-path: ellipse(150% 150% at 50% 55%);
            transform: scale(1) translateY(0);
            filter: brightness(0.8) saturate(1);
          }
        }

        @keyframes castle-cloud-drift-1 {
          0%,
          100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(20%, -8%);
          }
        }
        @keyframes castle-cloud-drift-2 {
          0%,
          100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(-18%, 6%);
          }
        }
        @keyframes castle-cloud-drift-3 {
          0%,
          100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(-14%, -10%);
          }
        }

        @keyframes castle-sweep-pass {
          0% {
            transform: translateX(-70%) translateY(10%);
          }
          100% {
            transform: translateX(70%) translateY(-10%);
          }
        }

        @keyframes castle-spectacle-pulse {
          0% {
            background: radial-gradient(
              circle at 50% 42%,
              rgba(255, 214, 140, 0.55) 0%,
              rgba(192, 132, 252, 0.35) 45%,
              rgba(255, 214, 140, 0) 75%
            );
          }
          100% {
            background: radial-gradient(
              circle at 50% 40%,
              rgba(255, 214, 140, 0.78) 0%,
              rgba(192, 132, 252, 0.55) 45%,
              rgba(255, 214, 140, 0) 80%
            );
          }
        }

        @keyframes castle-godray-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes castle-ember-rise {
          0% {
            opacity: 0;
            transform: translateY(0) scale(0.6);
          }
          15% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(-120%) scale(1.1);
          }
        }

        @keyframes castle-sparkle-shoot {
          0% {
            opacity: 0;
            height: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            height: 80px;
            transform: translateY(-20px);
          }
        }

        @keyframes castle-ring-orbit {
          0% {
            stroke-dashoffset: 0;
            transform: translate(-50%, -50%) rotateX(62deg) rotate(0deg);
          }
          100% {
            stroke-dashoffset: -100;
            transform: translate(-50%, -50%) rotateX(62deg) rotate(360deg);
          }
        }
        @keyframes castle-ring-orbit-reverse {
          0% {
            stroke-dashoffset: 0;
            transform: translate(-50%, -50%) rotateX(62deg) rotate(0deg);
          }
          100% {
            stroke-dashoffset: 100;
            transform: translate(-50%, -50%) rotateX(62deg) rotate(-360deg);
          }
        }

        .castle-phase-fading .castle-art-frame {
          animation: castle-exit-fade 0.7s ease-in forwards;
        }
        .castle-phase-done .castle-art-frame {
          opacity: 0;
          transform: scale(0.94);
        }
        @keyframes castle-exit-fade {
          0% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: scale(0.94);
            filter: blur(2px);
          }
        }

        @media (max-width: 480px) {
          .castle-art-frame {
            max-width: 240px;
            border-radius: 14px;
          }
          .castle-godray {
            width: 2px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .castle-hero-image {
            animation: none !important;
            clip-path: none !important;
            transform: none !important;
            filter: brightness(0.95) saturate(1.05) !important;
          }
          .castle-cloud-front,
          .castle-light-sweep,
          .castle-window-glow,
          .castle-energy-ring,
          .castle-spectacle-glow,
          .castle-godray-overlay,
          .castle-ember,
          .castle-sparkle {
            animation: none !important;
            opacity: 0 !important;
          }
          .castle-phase-fading .castle-art-frame,
          .castle-phase-done .castle-art-frame {
            animation: none !important;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
