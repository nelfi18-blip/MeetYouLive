"use client";

import { useEffect, useRef, useState } from "react";
import { RARITY_STYLES } from "@/lib/gifts";

/**
 * GiftEffect — animates a received/sent gift over the live stream.
 *
 * Props:
 *  - gift     { icon, name, rarity }   Gift object to display
 *  - onDone   () => void               Called when animation finishes
 */
export default function GiftEffect({ gift, onDone }) {
  const rarity = gift?.rarity ?? "common";
  const style = RARITY_STYLES[rarity] ?? RARITY_STYLES.common;
  const containerRef = useRef(null);
  const [particles, setParticles] = useState([]);

  /* Generate particles for rare+ gifts */
  useEffect(() => {
    if (style.particleCount > 0) {
      const pts = Array.from({ length: style.particleCount }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 4 + Math.random() * 8,
        delay: Math.random() * 0.6,
        duration: 0.8 + Math.random() * 0.8,
        rx: Math.random(),
        ry: Math.random(),
      }));
      setParticles(pts);
    }
  }, [style.particleCount]);

  /* Auto-dismiss after animation */
  useEffect(() => {
    const durations = { "effect-float": 1800, "effect-mid": 2400, "effect-full": 3200 };
    const ms = durations[style.animationClass] ?? 2000;
    const t = setTimeout(() => onDone?.(), ms);
    return () => clearTimeout(t);
  }, [style.animationClass, onDone]);

  const isFullOverlay = style.animationClass === "effect-full";
  const isMid = style.animationClass === "effect-mid";

  return (
    <div
      ref={containerRef}
      className={`gift-effect-root ${style.animationClass}`}
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* Overlay backdrop for legendary / mythic */}
      {style.overlayOpacity > 0 && (
        <div
          className="gift-overlay"
          style={{ background: style.color, opacity: style.overlayOpacity }}
        />
      )}

      {/* Particles */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="gift-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: style.color,
            boxShadow: `0 0 ${p.size * 2}px ${style.glow}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--rx": p.rx,
            "--ry": p.ry,
          }}
        />
      ))}

      {/* Main gift card */}
      <div
        className="gift-card"
        style={{
          background: style.gradient,
          boxShadow: `0 0 40px ${style.glow}, 0 0 80px ${style.glow}`,
        }}
      >
        <span className="gift-icon">{gift?.icon ?? "🎁"}</span>
        <span className="gift-name">{gift?.name ?? "Regalo"}</span>
        <span
          className="gift-rarity-label"
          style={{ color: style.color, textShadow: `0 0 8px ${style.glow}` }}
        >
          {style.label}
        </span>
      </div>

      <style jsx>{`
        .gift-effect-root {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ── Overlay ──────────────────────────── */
        .gift-overlay {
          position: absolute;
          inset: 0;
          animation: overlayPulse 0.6s ease-out forwards;
        }
        @keyframes overlayPulse {
          0%   { opacity: 0; }
          30%  { opacity: 1; }
          100% { opacity: 0; }
        }

        /* ── Particles ────────────────────────── */
        .gift-particle {
          position: absolute;
          border-radius: 50%;
          animation: particleBurst linear forwards;
        }
        @keyframes particleBurst {
          0%   { transform: scale(0) translate(0, 0); opacity: 1; }
          100% { transform: scale(1) translate(
                   calc((var(--rx, 1) - 0.5) * 200px),
                   calc((var(--ry, 1) - 0.5) * 200px)
                 ); opacity: 0; }
        }

        /* ── Gift card ────────────────────────── */
        .gift-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 1.25rem 2rem;
          border-radius: 1.25rem;
          border: 2px solid rgba(255,255,255,0.25);
          backdrop-filter: blur(6px);
          position: relative;
          z-index: 1;
        }
        .gift-icon {
          font-size: 3.5rem;
          line-height: 1;
        }
        .gift-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        .gift-rarity-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        /* ── Float animation (common / uncommon) ─ */
        .effect-float .gift-card {
          animation: floatUp 1.8s ease-out forwards;
          position: fixed;
          bottom: 5rem;
          left: 1.5rem;
        }
        @keyframes floatUp {
          0%   { opacity: 0; transform: translateY(40px) scale(0.85); }
          15%  { opacity: 1; transform: translateY(0)    scale(1);    }
          70%  { opacity: 1; transform: translateY(-20px) scale(1);   }
          100% { opacity: 0; transform: translateY(-60px) scale(0.9); }
        }

        /* ── Mid animation (rare / epic) ─────── */
        .effect-mid .gift-card {
          animation: midPop 2.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }
        @keyframes midPop {
          0%   { opacity: 0; transform: scale(0.5) rotate(-6deg); }
          20%  { opacity: 1; transform: scale(1.15) rotate(2deg); }
          35%  { transform: scale(1) rotate(0deg); }
          75%  { opacity: 1; transform: scale(1) rotate(0deg); }
          100% { opacity: 0; transform: scale(0.85) translateY(-30px); }
        }

        /* ── Full overlay animation (legendary / mythic) */
        .effect-full .gift-card {
          animation: fullDrop 3.2s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }
        @keyframes fullDrop {
          0%   { opacity: 0; transform: scale(0.3) rotate(-12deg); }
          15%  { opacity: 1; transform: scale(1.3) rotate(4deg); }
          28%  { transform: scale(1) rotate(-1deg); }
          35%  { transform: scale(1.05) rotate(0deg); }
          80%  { opacity: 1; transform: scale(1) rotate(0deg); }
          100% { opacity: 0; transform: scale(0.9) translateY(-50px); }
        }
      `}</style>
    </div>
  );
}
