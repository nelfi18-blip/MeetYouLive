"use client";

import { useEffect, useState } from "react";

// Rarity configuration: intensity 1 (common) → 6 (mythic)
const RARITY_CONFIG = {
  common:    { intensity: 1, duration: 2200, color: "#94a3b8", glow: "rgba(148,163,184,0.3)",  label: "Común"      },
  uncommon:  { intensity: 2, duration: 2600, color: "#4ade80", glow: "rgba(74,222,128,0.3)",   label: "Poco común" },
  rare:      { intensity: 3, duration: 3000, color: "#60a5fa", glow: "rgba(96,165,250,0.35)",  label: "Raro"       },
  epic:      { intensity: 4, duration: 3600, color: "#c084fc", glow: "rgba(192,132,252,0.4)",  label: "Épico"      },
  legendary: { intensity: 5, duration: 4200, color: "#fbbf24", glow: "rgba(251,191,36,0.42)", label: "Legendario" },
  mythic:    { intensity: 6, duration: 5200, color: "#f43f5e", glow: "rgba(244,63,94,0.45)",  label: "Mítico"     },
};

/** Exported rarity color/glow/label map for use in other components */
export const GIFT_RARITY_STYLES = Object.fromEntries(
  Object.entries(RARITY_CONFIG).map(([key, val]) => [
    key,
    { color: val.color, glow: val.glow, label: val.label },
  ])
);

// Particle counts per rarity (only for live context)
const PARTICLE_COUNTS = { 1: 0, 2: 0, 3: 5, 4: 10, 5: 16, 6: 22 };

/**
 * GiftEffect — renders a themed animation overlay when a gift is sent.
 *
 * Props:
 *   gift       {object}  — catalog item (icon, name, rarity, coinCost)
 *   senderName {string}  — display name of the sender
 *   context    {string}  — "live" (default) | "chat"
 *   onDone     {func}    — called when animation finishes
 */
export default function GiftEffect({ gift, senderName, context = "live", onDone }) {
  const [visible, setVisible] = useState(true);
  const cfg = RARITY_CONFIG[gift?.rarity] ?? RARITY_CONFIG.common;
  const intensity = cfg.intensity;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, cfg.duration);
    return () => clearTimeout(timer);
  }, [cfg.duration, onDone]);

  if (!visible || !gift) return null;

  const isMajor     = intensity >= 5; // legendary + mythic
  const isProminent = intensity >= 4; // epic+
  const isVisible   = intensity >= 3; // rare+
  const particleCount = context === "live" ? (PARTICLE_COUNTS[intensity] ?? 0) : 0;

  const cardClass = isMajor
    ? "gfx-card-major"
    : isProminent
    ? "gfx-card-prominent"
    : "gfx-card-subtle";

  return (
    <div
      className={`gfx gfx-${gift.rarity} gfx-ctx-${context}`}
      style={{ "--rarity-color": cfg.color, "--rarity-glow": cfg.glow }}
      aria-live="polite"
      aria-label={`Regalo: ${gift.name}`}
    >
      {/* Background radial glow — rare+ live only */}
      {isVisible && context === "live" && <div className="gfx-bg" />}

      {/* Mythic border flash */}
      {intensity === 6 && context === "live" && <div className="gfx-border-flash" />}

      {/* Particles — rare+ live only */}
      {particleCount > 0 &&
        Array.from({ length: particleCount }, (_, i) => (
          <span
            key={i}
            className="gfx-particle"
            style={{
              "--angle": `${Math.round((360 / particleCount) * i)}deg`,
              "--delay": `${(i * 0.055).toFixed(3)}s`,
            }}
          />
        ))}

      {/* Main card */}
      <div className={`gfx-card ${cardClass}`}>
        <div className="gfx-icon">{gift.icon}</div>
        {isVisible && <div className="gfx-name">{gift.name}</div>}
        {isProminent && senderName && (
          <div className="gfx-sender">de {senderName}</div>
        )}
        {isMajor && (
          <div className="gfx-rarity-badge">{cfg.label}</div>
        )}
      </div>

      <style jsx>{`
        /* ── Container ─────────────────────────────── */
        .gfx {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        /* Chat context: fixed bottom-right toast */
        .gfx-ctx-chat {
          position: fixed;
          bottom: 90px;
          right: 1.25rem;
          inset: auto;
          z-index: 500;
          width: auto;
          height: auto;
          overflow: visible;
        }

        /* ── Background glow ───────────────────────── */
        .gfx-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse at center,
            var(--rarity-glow) 0%,
            transparent 68%
          );
          animation: gfx-bg-fade ${cfg.duration}ms ease forwards;
        }

        @keyframes gfx-bg-fade {
          0%   { opacity: 0; }
          12%  { opacity: 1; }
          65%  { opacity: 0.75; }
          100% { opacity: 0; }
        }

        /* ── Mythic border flash ───────────────────── */
        .gfx-border-flash {
          position: absolute;
          inset: 0;
          border: 2px solid var(--rarity-color);
          animation: gfx-border-flash ${cfg.duration}ms ease forwards;
          pointer-events: none;
        }

        @keyframes gfx-border-flash {
          0%   { opacity: 0; box-shadow: inset 0 0 0 transparent; }
          10%  { opacity: 1; box-shadow: inset 0 0 40px var(--rarity-glow); }
          30%  { opacity: 0.8; }
          60%  { opacity: 0.6; }
          100% { opacity: 0; }
        }

        /* ── Particles ─────────────────────────────── */
        .gfx-particle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--rarity-color);
          box-shadow: 0 0 6px var(--rarity-glow);
          animation: gfx-particle-fly 1.4s ease-out var(--delay, 0s) both;
        }

        @keyframes gfx-particle-fly {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) rotate(var(--angle, 0deg)) translateY(0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--angle, 0deg)) translateY(-90px);
          }
        }

        /* ── Main card ─────────────────────────────── */
        .gfx-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          position: relative;
          z-index: 2;
        }

        /* Subtle (common/uncommon): floating emoji only */
        .gfx-card-subtle {
          animation: gfx-float-up ${cfg.duration}ms ease forwards;
        }

        /* Prominent (rare/epic): pill card */
        .gfx-card-prominent {
          background: rgba(12, 6, 28, 0.88);
          border: 1px solid var(--rarity-color);
          border-radius: 16px;
          padding: 0.9rem 1.4rem;
          backdrop-filter: blur(10px);
          box-shadow: 0 0 28px var(--rarity-glow), 0 8px 32px rgba(0, 0, 0, 0.55);
          animation: gfx-card-in ${cfg.duration}ms ease forwards;
        }

        /* Major (legendary/mythic): big banner */
        .gfx-card-major {
          background: rgba(10, 4, 22, 0.94);
          border: 2px solid var(--rarity-color);
          border-radius: 22px;
          padding: 1.2rem 2.2rem;
          backdrop-filter: blur(14px);
          box-shadow:
            0 0 60px var(--rarity-glow),
            0 12px 48px rgba(0, 0, 0, 0.65),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
          animation: gfx-banner-major ${cfg.duration}ms ease forwards;
        }

        /* ── Card animations ───────────────────────── */
        @keyframes gfx-float-up {
          0%   { opacity: 0; transform: translateY(36px) scale(0.65); }
          18%  { opacity: 1; transform: translateY(0) scale(1); }
          72%  { opacity: 1; transform: translateY(-18px) scale(1); }
          100% { opacity: 0; transform: translateY(-36px) scale(0.88); }
        }

        @keyframes gfx-card-in {
          0%   { opacity: 0; transform: scale(0.72) translateY(18px); }
          18%  { opacity: 1; transform: scale(1.04) translateY(0); }
          26%  { transform: scale(1); }
          72%  { opacity: 1; transform: scale(1) translateY(-8px); }
          100% { opacity: 0; transform: scale(0.94) translateY(-18px); }
        }

        @keyframes gfx-banner-major {
          0%   { opacity: 0; transform: scale(0.5) translateY(24px); }
          14%  { opacity: 1; transform: scale(1.07) translateY(0); }
          22%  { transform: scale(1); }
          72%  { opacity: 1; transform: scale(1) translateY(-6px); }
          100% { opacity: 0; transform: scale(0.92) translateY(-14px); }
        }

        /* ── Card children ─────────────────────────── */
        .gfx-icon {
          font-size: 2.4rem;
          line-height: 1;
          filter: drop-shadow(0 0 8px var(--rarity-glow));
        }

        .gfx-card-major .gfx-icon { font-size: 3.4rem; }

        .gfx-name {
          font-size: 0.92rem;
          font-weight: 800;
          color: var(--rarity-color);
          letter-spacing: 0.04em;
          text-shadow: 0 0 12px var(--rarity-glow);
          text-align: center;
          font-family: inherit;
        }

        .gfx-card-major .gfx-name { font-size: 1.22rem; }

        .gfx-sender {
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.68);
          font-weight: 600;
          text-align: center;
          font-family: inherit;
        }

        .gfx-rarity-badge {
          font-size: 0.62rem;
          font-weight: 900;
          color: var(--rarity-color);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--rarity-color);
          border-radius: 999px;
          padding: 0.12rem 0.6rem;
          text-shadow: 0 0 8px var(--rarity-glow);
          font-family: inherit;
        }

        /* ── Chat context overrides ─────────────────── */
        .gfx-ctx-chat .gfx-card {
          background: rgba(12, 6, 28, 0.94);
          border: 1px solid var(--rarity-color);
          border-radius: 14px;
          padding: 0.55rem 1rem;
          box-shadow: 0 0 18px var(--rarity-glow), 0 4px 16px rgba(0, 0, 0, 0.5);
          animation: gfx-chat-toast 2.8s ease forwards;
          backdrop-filter: blur(10px);
          flex-direction: row;
          gap: 0.5rem;
        }

        .gfx-ctx-chat .gfx-icon { font-size: 1.5rem; }
        .gfx-ctx-chat .gfx-name { font-size: 0.78rem; }

        @keyframes gfx-chat-toast {
          0%   { opacity: 0; transform: translateX(20px) scale(0.88); }
          14%  { opacity: 1; transform: translateX(0) scale(1); }
          72%  { opacity: 1; transform: translateX(0) scale(1); }
          100% { opacity: 0; transform: translateX(10px) scale(0.94); }
        }
      `}</style>
    </div>
  );
}
