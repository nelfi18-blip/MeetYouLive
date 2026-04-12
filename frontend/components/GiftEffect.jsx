"use client";

export default function GiftEffect({ gift, senderName }) {
  if (!gift) return null;

  const rarity = gift.rarity || "common";

  const stylesByRarity = {
    common: {
      glow: "0 0 18px rgba(148,163,184,0.4)",
      border: "1px solid rgba(255,255,255,0.12)",
      bg: "rgba(12, 8, 26, 0.72)",
      duration: "2.2s",
      scale: "1",
    },
    uncommon: {
      glow: "0 0 22px rgba(74,222,128,0.45)",
      border: "1px solid rgba(74,222,128,0.3)",
      bg: "rgba(8, 24, 16, 0.8)",
      duration: "2.8s",
      scale: "1.02",
    },
    rare: {
      glow: "0 0 26px rgba(96,165,250,0.5)",
      border: "1px solid rgba(96,165,250,0.4)",
      bg: "rgba(8, 16, 38, 0.82)",
      duration: "3.5s",
      scale: "1.04",
    },
    epic: {
      glow: "0 0 30px rgba(192,132,252,0.55)",
      border: "1px solid rgba(192,132,252,0.45)",
      bg: "rgba(28, 12, 52, 0.85)",
      duration: "4.5s",
      scale: "1.06",
    },
    legendary: {
      glow: "0 0 36px rgba(251,191,36,0.6)",
      border: "1px solid rgba(251,191,36,0.5)",
      bg: "rgba(45, 30, 5, 0.88)",
      duration: "6s",
      scale: "1.1",
    },
    mythic: {
      glow: "0 0 42px rgba(244,63,94,0.65)",
      border: "1px solid rgba(244,63,94,0.55)",
      bg: "rgba(40, 6, 18, 0.9)",
      duration: "7s",
      scale: "1.12",
    },
  };

  const style = stylesByRarity[rarity] || stylesByRarity.common;

  const RARITY_ICON_SIZE = {
    common: "1.75rem",
    uncommon: "1.75rem",
    rare: "2rem",
    epic: "2rem",
    legendary: "2.4rem",
    mythic: "2.4rem",
  };
  const iconSize = RARITY_ICON_SIZE[rarity] || "1.75rem";

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
          font-size: ${iconSize};
          animation: giftIconPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }

        @keyframes giftIconPop {
          0%   { transform: scale(0.4) rotate(-10deg); }
          60%  { transform: scale(1.25) rotate(5deg); }
          100% { transform: scale(1) rotate(0deg); }
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
