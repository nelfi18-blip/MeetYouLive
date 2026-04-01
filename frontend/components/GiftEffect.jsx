"use client";

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
