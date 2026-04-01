"use client";

import { useEffect, useRef, useState } from "react";

/* ─── Tier mapping by rarity ────────────────────────────────────── */
const GIFT_TIER = {
  common:    1,
  uncommon:  1,
  rare:      2,
  epic:      2,
  legendary: 3,
  mythic:    3,
};

/* ─── Per-tier visual config ────────────────────────────────────── */
const TIER_CONFIG = {
  1: {
    duration:      2200,
    particleCount: 0,
    glowColor:     "rgba(255,45,120,0.45)",
    glowSize:      "0 0 24px",
    bgGrad:        "radial-gradient(ellipse at center, rgba(255,45,120,0.18) 0%, transparent 70%)",
    borderColor:   "rgba(255,45,120,0.5)",
    textGrad:      "linear-gradient(135deg, #ff2d78, #e040fb)",
    label:         null,
  },
  2: {
    duration:      4000,
    particleCount: 10,
    glowColor:     "rgba(192,132,252,0.55)",
    glowSize:      "0 0 40px",
    bgGrad:        "radial-gradient(ellipse at center, rgba(192,132,252,0.22) 0%, transparent 70%)",
    borderColor:   "rgba(192,132,252,0.6)",
    textGrad:      "linear-gradient(135deg, #60a5fa, #c084fc)",
    label:         null,
  },
  3: {
    duration:      6500,
    particleCount: 22,
    glowColor:     "rgba(251,191,36,0.65)",
    glowSize:      "0 0 60px",
    bgGrad:        "radial-gradient(ellipse at center, rgba(251,191,36,0.28) 0%, transparent 70%)",
    borderColor:   "rgba(251,191,36,0.75)",
    textGrad:      "linear-gradient(135deg, #fcd34d, #fbbf24, #f59e0b)",
    label:         "✨ MOMENTO VIP ✨",
  },
};

/* ─── Seeded pseudo-random (deterministic per gift id) ─────────── */
function seededRand(seed, i) {
  const x = Math.sin(seed + i * 137.508) * 10000;
  return x - Math.floor(x);
}

function buildParticles(count, idStr) {
  // Use a simple hash of the full ID string for better randomness
  const seed = idStr ? idStr.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) : 0;
  return Array.from({ length: count }, (_, i) => ({
    id:       i,
    left:     5 + seededRand(seed, i * 2)     * 90,
    delay:    seededRand(seed, i * 2 + 1)     * 0.8,
    duration: 1.2 + seededRand(seed, i * 3)   * 1.6,
    size:     4   + seededRand(seed, i * 4)   * 6,
    opacity:  0.55 + seededRand(seed, i * 5)  * 0.45,
  }));
}

/* ─── Component ─────────────────────────────────────────────────── */
export default function GiftAnimation({ gift, onComplete, soundMuted }) {
  const [phase, setPhase] = useState("enter"); // enter | hold | exit
  const timers = useRef([]);

  const rarity   = gift?.rarity || "common";
  const tier     = GIFT_TIER[rarity] || 1;
  const cfg      = TIER_CONFIG[tier];
  const particles = buildParticles(cfg.particleCount, gift?._id || "");

  useEffect(() => {
    if (!gift) return;

    // hold → exit at (duration - 600 ms)
    const holdTimer = setTimeout(() => setPhase("exit"), cfg.duration - 600);
    // call onComplete at full duration
    const doneTimer = setTimeout(() => {
      setPhase("enter");
      onComplete?.();
    }, cfg.duration);

    timers.current = [holdTimer, doneTimer];
    return () => timers.current.forEach(clearTimeout);
  }, [gift, cfg.duration]);

  if (!gift) return null;

  const senderName = gift.sender?.username || gift.sender?.name || "Alguien";
  const giftIcon   = gift.giftCatalogItem?.icon || gift.icon || "🎁";
  const giftName   = gift.giftCatalogItem?.name || gift.name || "Regalo";

  return (
    <div
      className={`ga-root ga-tier-${tier} ga-phase-${phase}`}
      role="status"
      aria-live="polite"
      aria-label={`${senderName} envió ${giftName}`}
    >
      {/* ── Particles ─────────────────────────────────── */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="ga-particle"
          style={{
            left:              `${p.left}%`,
            animationDelay:    `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width:             `${p.size}px`,
            height:            `${p.size}px`,
            opacity:           p.opacity,
          }}
        />
      ))}

      {/* ── Card ──────────────────────────────────────── */}
      <div className="ga-card">
        {cfg.label && <div className="ga-vip-label">{cfg.label}</div>}

        <span className="ga-gift-icon">{giftIcon}</span>

        <div className="ga-info">
          <span className="ga-sender">{senderName}</span>
          <span className="ga-verb">envió</span>
          <span className="ga-gift-name">{giftName}</span>
        </div>

        {gift.message && (
          <p className="ga-message">&ldquo;{gift.message}&rdquo;</p>
        )}
      </div>

      <style jsx>{`
        /* ── Root overlay ─────────────────────────────── */
        .ga-root {
          position: absolute;
          left: 0;
          right: 0;
          z-index: 50;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          overflow: hidden;
          /* Honour prefers-reduced-motion by using opacity only */
        }

        /* Tier 1 – top of video, compact */
        .ga-tier-1 { top: 0.75rem; }
        /* Tier 2 – centre-ish */
        .ga-tier-2 { top: 50%; transform: translateY(-50%); }
        /* Tier 3 – bottom-centre VIP banner */
        .ga-tier-3 { bottom: 3.5rem; top: auto; }

        /* ── Phase transitions ───────────────────────── */
        .ga-phase-enter { animation: ga-fade-in 0.35s ease forwards; }
        .ga-phase-hold  { opacity: 1; }
        .ga-phase-exit  { animation: ga-fade-out 0.6s ease forwards; }

        @keyframes ga-fade-in  { from { opacity: 0; transform: scale(0.82) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes ga-fade-out { from { opacity: 1; } to { opacity: 0; transform: scale(0.92) translateY(-6px); } }

        /* Reduced motion – keep opacity transitions only */
        @media (prefers-reduced-motion: reduce) {
          .ga-phase-enter { animation: ga-fade-in-simple 0.3s ease forwards; }
          .ga-phase-exit  { animation: ga-fade-out-simple 0.4s ease forwards; }
          @keyframes ga-fade-in-simple  { from { opacity: 0; } to { opacity: 1; } }
          @keyframes ga-fade-out-simple { from { opacity: 1; } to { opacity: 0; } }
        }

        /* ── Card ─────────────────────────────────────── */
        .ga-card {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.55rem 1.1rem;
          border-radius: 999px;
          backdrop-filter: blur(14px);
          border: 1.5px solid ${cfg.borderColor};
          background: rgba(6,2,15,0.82);
          box-shadow: ${cfg.glowSize} ${cfg.glowColor}, 0 4px 24px rgba(0,0,0,0.65);
          flex-wrap: wrap;
          justify-content: center;
          max-width: min(90vw, 460px);
        }

        /* Tier 3 gets a wider, pill-shaped premium card */
        .ga-tier-3 .ga-card {
          padding: 0.75rem 1.75rem;
          border-radius: 22px;
          max-width: min(92vw, 520px);
          background: linear-gradient(135deg, rgba(20,10,40,0.94) 0%, rgba(40,20,5,0.94) 100%);
          flex-direction: column;
          gap: 0.45rem;
        }

        /* ── VIP label ────────────────────────────────── */
        .ga-vip-label {
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          background: ${cfg.textGrad};
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-align: center;
          width: 100%;
        }

        /* ── Gift icon ────────────────────────────────── */
        .ga-gift-icon {
          font-size: ${tier === 3 ? "2.6rem" : tier === 2 ? "2rem" : "1.5rem"};
          line-height: 1;
          filter: drop-shadow(0 0 8px ${cfg.glowColor});
          animation: ga-icon-pulse ${tier === 3 ? "1.2s" : "1.8s"} ease-in-out infinite alternate;
        }

        @keyframes ga-icon-pulse {
          from { filter: drop-shadow(0 0 6px ${cfg.glowColor}); transform: scale(1); }
          to   { filter: drop-shadow(0 0 18px ${cfg.glowColor}); transform: scale(1.1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .ga-gift-icon { animation: none; }
        }

        /* ── Info row ─────────────────────────────────── */
        .ga-info {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .ga-sender {
          font-weight: 800;
          font-size: ${tier === 3 ? "0.95rem" : "0.82rem"};
          color: #fff;
        }

        .ga-verb {
          font-size: ${tier === 3 ? "0.82rem" : "0.75rem"};
          color: rgba(255,255,255,0.6);
        }

        .ga-gift-name {
          font-weight: 800;
          font-size: ${tier === 3 ? "0.95rem" : "0.82rem"};
          background: ${cfg.textGrad};
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Optional message ─────────────────────────── */
        .ga-message {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.7);
          text-align: center;
          margin: 0;
          font-style: italic;
          max-width: 340px;
          line-height: 1.4;
        }

        /* ── Particles ────────────────────────────────── */
        .ga-particle {
          position: absolute;
          bottom: 0;
          border-radius: 50%;
          background: ${cfg.glowColor};
          animation: ga-rise linear infinite;
          pointer-events: none;
        }

        @keyframes ga-rise {
          0%   { transform: translateY(0)   scale(1);    opacity: var(--p-op, 0.7); }
          80%  { opacity: calc(var(--p-op, 0.7) * 0.4); }
          100% { transform: translateY(-90px) scale(0.5); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ga-particle { display: none; }
        }
      `}</style>
    </div>
  );
}
