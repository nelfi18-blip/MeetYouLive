"use client";

import { useEffect, useState } from "react";
import { getRarityStyle, getRarityEffectCfg } from "@/lib/giftConstants";

/**
 * Rarity tiers drive animation intensity:
 *  common    → subtle float (bottom-left corner)
 *  uncommon  → soft glow float with sender tag
 *  rare      → mid-screen reveal with pulse ring
 *  epic      → centered banner + colour burst
 *  legendary → full-width moment + shimmer
 *  mythic    → full overlay + particle shower
 */

/** Tiny floating particles used for legendary / mythic */
function Particles({ color }) {
  const particles = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="particles-wrap" aria-hidden>
      {particles.map((i) => (
        <span
          key={i}
          className="particle"
          style={{
            "--angle": `${(i / 12) * 360}deg`,
            "--delay": `${(i * 0.08).toFixed(2)}s`,
            "--color": color,
          }}
        />
      ))}
      <style jsx>{`
        .particles-wrap {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          border-radius: inherit;
        }
        .particle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color);
          transform-origin: center;
          animation: burst 0.9s ease-out var(--delay) both;
        }
        @keyframes burst {
          0%   { transform: translate(-50%,-50%) rotate(var(--angle)) translateY(0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) rotate(var(--angle)) translateY(-80px) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/**
 * GiftEffect
 *
 * Props:
 *  gift       – { icon, name, rarity, coinCost }
 *  senderName – display name of the sender
 *  context    – "live" | "chat" | "profile"   (default "live")
 *  onDone     – callback when animation completes
 */
export default function GiftEffect({ gift, senderName = "Tú", context = "live", onDone }) {
  const [visible, setVisible] = useState(true);

  const rs = getRarityStyle(gift?.rarity);
  const cfg = getRarityEffectCfg(gift?.rarity);
  const { size, duration, fullOverlay } = cfg;
  const { color, glow, label } = rs;

  useEffect(() => {
    if (!gift) return;
    const t = setTimeout(() => {
      setVisible(false);
      if (onDone) onDone();
    }, duration);
    return () => clearTimeout(t);
  }, [gift, duration, onDone]);

  if (!gift || !visible) return null;

  const isChat    = context === "chat";
  const isProfile = context === "profile";

  /* For chat / profile we always use a compact, elegant presentation */
  const effectiveSize = isChat || isProfile ? "sm" : size;
  const showOverlay   = fullOverlay && !isChat && !isProfile;

  return (
    <div className={`gift-effect gift-effect-${effectiveSize} gift-effect-${gift.rarity}`} aria-live="polite" aria-label={`${senderName} envió ${gift.name}`}>
      {showOverlay && <div className="gift-bg-overlay" />}
      {(gift.rarity === "legendary" || gift.rarity === "mythic") && !isChat && !isProfile && (
        <Particles color={color} />
      )}
      <div className="gift-effect-card" style={{ "--c": color, "--g": glow }}>
        <span className="gift-effect-icon">{gift.icon}</span>
        {effectiveSize !== "sm" && (
          <div className="gift-effect-meta">
            <span className="gift-effect-name">{gift.name}</span>
            <span className="gift-effect-rarity">{label}</span>
          </div>
        )}
        <span className="gift-effect-sender">
          {effectiveSize === "sm" ? `${gift.icon}` : null}
          {effectiveSize !== "sm" && (
            <>{senderName} · {gift.coinCost} 🪙</>
          )}
        </span>
        {effectiveSize === "sm" && (
          <span className="gift-effect-sm-label">{senderName}</span>
        )}
      </div>

      <style jsx>{`
        /* ─── Base wrapper ───────────────────────────── */
        .gift-effect {
          position: absolute;
          z-index: 200;
          pointer-events: none;
          animation: gift-fade-in 0.35s ease forwards;
        }

        @keyframes gift-fade-in {
          from { opacity: 0; transform: translateY(12px) scale(0.88); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }

        /* ─── Background overlay (legendary / mythic only) ─ */
        .gift-bg-overlay {
          position: fixed;
          inset: 0;
          z-index: -1;
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, transparent 70%);
          animation: overlay-pulse ${duration}ms ease-in-out forwards;
          pointer-events: none;
        }

        @keyframes overlay-pulse {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }

        /* ─── Sizes ──────────────────────────────────── */

        /* sm — common / uncommon (chat, profile, or low-rarity in live) */
        .gift-effect-sm {
          bottom: 54px;
          left: 12px;
          animation: gift-float-sm ${duration}ms ease forwards;
        }

        @keyframes gift-float-sm {
          0%   { opacity: 0; transform: translateY(0)    scale(0.8); }
          15%  { opacity: 1; transform: translateY(-8px) scale(1);   }
          75%  { opacity: 1; transform: translateY(-18px) scale(1);  }
          100% { opacity: 0; transform: translateY(-30px) scale(0.9);}
        }

        /* md — rare */
        .gift-effect-md {
          bottom: 60px;
          left: 50%;
          transform: translateX(-50%);
          animation: gift-float-md ${duration}ms ease forwards;
        }

        @keyframes gift-float-md {
          0%   { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.75); }
          18%  { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1.05); }
          80%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1);   }
          100% { opacity: 0; transform: translateX(-50%) translateY(-24px) scale(0.9); }
        }

        /* lg — epic */
        .gift-effect-lg {
          bottom: 72px;
          left: 50%;
          transform: translateX(-50%);
          animation: gift-float-lg ${duration}ms ease forwards;
        }

        @keyframes gift-float-lg {
          0%   { opacity: 0; transform: translateX(-50%) scale(0.6); }
          15%  { opacity: 1; transform: translateX(-50%) scale(1.08); }
          25%  { transform: translateX(-50%) scale(1);  }
          80%  { opacity: 1; transform: translateX(-50%) translateY(-14px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-30px) scale(0.9); }
        }

        /* xl — legendary */
        .gift-effect-xl {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: gift-reveal-xl ${duration}ms ease forwards;
        }

        @keyframes gift-reveal-xl {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.5) rotate(-6deg); }
          18%  { opacity: 1; transform: translate(-50%,-50%) scale(1.12) rotate(1deg); }
          28%  { transform: translate(-50%,-50%) scale(1) rotate(0); }
          75%  { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(0.85); }
        }

        /* xxl — mythic */
        .gift-effect-xxl {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: gift-reveal-xxl ${duration}ms ease forwards;
        }

        @keyframes gift-reveal-xxl {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.4); }
          12%  { opacity: 1; transform: translate(-50%,-50%) scale(1.18); }
          22%  { transform: translate(-50%,-50%) scale(1);  }
          70%  { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(0.82); }
        }

        /* ─── Card ───────────────────────────────────── */
        .gift-effect-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          background: rgba(10, 4, 24, 0.88);
          border: 1.5px solid var(--c);
          border-radius: 14px;
          padding: 0.65rem 1rem;
          box-shadow:
            0 0 18px var(--g),
            0 4px 24px rgba(0,0,0,0.6);
          backdrop-filter: blur(10px);
          white-space: nowrap;
          position: relative;
          overflow: visible;
        }

        /* ─── Per-rarity pulse on card ─────────────── */
        .gift-effect-rare .gift-effect-card,
        .gift-effect-epic .gift-effect-card {
          animation: card-pulse-ring 0.8s ease 0.2s;
        }

        @keyframes card-pulse-ring {
          0%   { box-shadow: 0 0 18px var(--g), 0 4px 24px rgba(0,0,0,0.6); }
          50%  { box-shadow: 0 0 38px var(--g), 0 0 60px var(--g); }
          100% { box-shadow: 0 0 18px var(--g), 0 4px 24px rgba(0,0,0,0.6); }
        }

        .gift-effect-legendary .gift-effect-card,
        .gift-effect-mythic .gift-effect-card {
          animation: card-shimmer 1.4s ease 0.3s infinite alternate;
        }

        @keyframes card-shimmer {
          0%   { box-shadow: 0 0 24px var(--g), 0 4px 32px rgba(0,0,0,0.7); }
          100% { box-shadow: 0 0 56px var(--g), 0 0 80px var(--g); }
        }

        /* ─── Icon ───────────────────────────────────── */
        .gift-effect-icon {
          font-size: ${
            effectiveSize === "sm"  ? "1.6rem" :
            effectiveSize === "md"  ? "2.4rem" :
            effectiveSize === "lg"  ? "3.2rem" :
            effectiveSize === "xl"  ? "4.4rem" :
                                      "5.6rem"
          };
          line-height: 1;
          filter: drop-shadow(0 0 8px var(--g));
          animation: icon-bounce 0.5s ease 0.15s both;
        }

        @keyframes icon-bounce {
          0%   { transform: scale(0.7); }
          60%  { transform: scale(1.15); }
          100% { transform: scale(1); }
        }

        /* ─── Text ───────────────────────────────────── */
        .gift-effect-meta {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.1rem;
        }

        .gift-effect-name {
          font-size: ${effectiveSize === "xl" || effectiveSize === "xxl" ? "1.1rem" : "0.85rem"};
          font-weight: 800;
          color: var(--c);
          letter-spacing: 0.03em;
          text-shadow: 0 0 10px var(--g);
        }

        .gift-effect-rarity {
          font-size: 0.65rem;
          font-weight: 700;
          color: var(--c);
          opacity: 0.8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .gift-effect-sender {
          font-size: ${effectiveSize === "xl" || effectiveSize === "xxl" ? "0.88rem" : "0.72rem"};
          color: rgba(255,255,255,0.7);
          font-weight: 600;
          margin-top: 0.1rem;
        }

        .gift-effect-sm-label {
          font-size: 0.62rem;
          color: rgba(255,255,255,0.55);
          font-weight: 600;
        }
      `}</style>
    </div>
export default function GiftEffect({ gift, senderName }) {
  if (!gift) return null;

  const rarity = gift.rarity || "common";

  const stylesByRarity = {
    common: {
      glow: "0 0 18px rgba(255, 77, 216, 0.35)",
      border: "1px solid rgba(255,255,255,0.12)",
      bg: "rgba(12, 8, 26, 0.72)",
      duration: "2.2s",
      scale: "1",
    },
    premium: {
      glow: "0 0 24px rgba(168, 85, 247, 0.45)",
      border: "1px solid rgba(168,85,247,0.35)",
      bg: "rgba(28, 12, 52, 0.8)",
      duration: "4.5s",
      scale: "1.04",
    },
    vip: {
      glow: "0 0 30px rgba(250, 204, 21, 0.5)",
      border: "1px solid rgba(250,204,21,0.45)",
      bg: "rgba(45, 30, 5, 0.82)",
      duration: "7s",
      scale: "1.08",
    },
    epic: {
      glow: "0 0 30px rgba(250, 204, 21, 0.5)",
      border: "1px solid rgba(250,204,21,0.45)",
      bg: "rgba(45, 30, 5, 0.82)",
      duration: "7s",
      scale: "1.08",
    },
  };

  const style = stylesByRarity[rarity] || stylesByRarity.common;

  return (
    <>
      <div
        className="gift-effect"
        style={{
          background: style.bg,
          border: style.border,
          boxShadow: style.glow,
          animationDuration: style.duration,
          transform: `scale(${style.scale})`,
        }}
      >
        <div className="gift-icon">{gift.icon || "🎁"}</div>
        <div className="gift-copy">
          <div className="gift-title">{gift.name || "Regalo"}</div>
          <div className="gift-subtitle">
            {senderName || "Alguien"} envió un regalo
          </div>
        </div>
      </div>

      <style jsx>{`
        .gift-effect {
          position: absolute;
          left: 50%;
          top: 18%;
          transform: translateX(-50%);
          z-index: 4;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          border-radius: 999px;
          backdrop-filter: blur(10px);
          animation: gift-pop ease-in-out forwards;
          max-width: calc(100% - 2rem);
        }

        .gift-icon {
          font-size: 1.75rem;
        }

        .gift-copy {
          display: flex;
          flex-direction: column;
        }

        .gift-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: #fff;
        }

        .gift-subtitle {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.8);
        }

        @keyframes gift-pop {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(12px) scale(0.92);
          }
          15% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
          85% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
          }
        }
      `}</style>
    </>
  );
}
