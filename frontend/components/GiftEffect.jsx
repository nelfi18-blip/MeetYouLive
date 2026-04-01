"use client";

/**
 * GiftEffect — animated gift overlay rendered inside the video container.
 *
 * Props:
 *  - gift       {object}  Gift object from the catalog (icon, name, rarity)
 *  - senderName {string}  Display name of the sender
 *
 * Visual tiers by rarity:
 *  - common / uncommon  → small corner badge, subtle float
 *  - rare               → medium centred card with purple glow
 *  - epic               → large centred card with vivid glow
 *  - legendary / mythic → full overlay with backdrop + particle rain
 */
export default function GiftEffect({ gift, senderName }) {
  if (!gift) return null;

  const rarity = gift.rarity || "common";

  /* Map catalog rarities to display groups */
  const group =
    rarity === "legendary" || rarity === "mythic"
      ? "vip"
      : rarity === "epic"
      ? "epic"
      : rarity === "rare"
      ? "premium"
      : "common";

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
    epic: {
      glow: "0 0 30px rgba(192, 132, 252, 0.6)",
      border: "1px solid rgba(192,132,252,0.45)",
      bg: "rgba(30, 8, 60, 0.85)",
      duration: "7s",
      scale: "1.08",
    },
    vip: {
      glow: "0 0 30px rgba(250, 204, 21, 0.5)",
      border: "1px solid rgba(250,204,21,0.45)",
      bg: "rgba(45, 30, 5, 0.82)",
      duration: "7s",
      scale: "1.08",
    },
  };

  const style = stylesByRarity[group] || stylesByRarity.common;
  const isBig = group === "epic" || group === "vip";
  const isVip = group === "vip";

  return (
    <>
      <div
        className={`gift-effect gift-effect-${group}${isBig ? " gift-effect-big" : ""}`}
        style={{
          "--ge-glow": style.glow,
          "--ge-border": style.border,
          "--ge-bg": style.bg,
          "--ge-duration": style.duration,
          "--ge-scale": style.scale,
        }}
        aria-live="polite"
        aria-label={`${senderName} envió ${gift.name}`}
      >
        {isVip && (
          <div className="gift-particles" aria-hidden="true" />
        )}

        <div className="gift-effect-inner">
          <span className="gift-effect-icon">{gift.icon || "🎁"}</span>
          <div className="gift-effect-info">
            <span className="gift-effect-sender">{senderName}</span>
            <span className="gift-effect-name">{gift.name}</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        /* ── Base ─────────────────────────────────────────────────────── */
        .gift-effect {
          position: absolute;
          pointer-events: none;
          animation: geFloat var(--ge-duration, 2.2s) ease-in-out forwards;
        }

        /* ── Small corner badge (common / uncommon) ───────────────────── */
        .gift-effect:not(.gift-effect-big) {
          bottom: 52px;
          left: 12px;
          z-index: 2;
          transform-origin: left bottom;
        }

        /* ── Large centred overlay (epic / vip) ───────────────────────── */
        .gift-effect-big {
          inset: 0;
          z-index: 4;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(3px);
        }

        /* ── Inner card ───────────────────────────────────────────────── */
        .gift-effect-inner {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: var(--ge-bg);
          border: var(--ge-border);
          border-radius: 12px;
          padding: 0.65rem 1.1rem;
          box-shadow: var(--ge-glow), 0 8px 32px rgba(0, 0, 0, 0.55);
          transform: scale(var(--ge-scale, 1));
          max-width: 300px;
          backdrop-filter: blur(8px);
        }

        .gift-effect-big .gift-effect-inner {
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 240px;
          padding: 1.75rem 2.25rem;
          border-radius: 20px;
          gap: 0.6rem;
        }

        /* ── Gift icon ────────────────────────────────────────────────── */
        .gift-effect-icon {
          font-size: 2rem;
          line-height: 1;
          filter: drop-shadow(var(--ge-glow));
          animation: gePulse 1.5s ease-in-out infinite;
          flex-shrink: 0;
        }

        .gift-effect-big .gift-effect-icon {
          font-size: 4rem;
        }

        /* ── Text info ────────────────────────────────────────────────── */
        .gift-effect-info {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }

        .gift-effect-sender {
          font-size: 0.68rem;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
          letter-spacing: 0.03em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .gift-effect-name {
          font-size: 0.88rem;
          color: #fff;
          font-weight: 800;
          letter-spacing: 0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .gift-effect-big .gift-effect-sender {
          font-size: 0.82rem;
        }

        .gift-effect-big .gift-effect-name {
          font-size: 1.15rem;
        }

        /* ── VIP particle rain ────────────────────────────────────────── */
        .gift-particles {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .gift-particles::before,
        .gift-particles::after {
          content: "✨ ✨ ✨ ✨ ✨";
          position: absolute;
          top: -15%;
          left: 50%;
          transform: translateX(-50%);
          font-size: 1.1rem;
          white-space: nowrap;
          animation: geParticles var(--ge-duration, 7s) linear forwards;
          opacity: 0;
        }

        .gift-particles::after {
          animation-delay: 0.5s;
          left: 30%;
          content: "⭐ ⭐ ⭐ ⭐ ⭐";
        }

        /* ── Keyframes ────────────────────────────────────────────────── */
        @keyframes geFloat {
          0%   { opacity: 0; transform: translateY(18px) scale(0.88); }
          12%  { opacity: 1; transform: translateY(0)    scale(1);    }
          80%  { opacity: 1; transform: translateY(0)    scale(1);    }
          100% { opacity: 0; transform: translateY(-8px) scale(0.95); }
        }

        @keyframes gePulse {
          0%, 100% { transform: scale(1);    }
          50%       { transform: scale(1.14); }
        }

        @keyframes geParticles {
          0%   { opacity: 0; top: -15%; }
          10%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { opacity: 0; top: 110%; }
        }
      `}</style>
    </>
  );
}
