"use client";

const BIG_RARITIES = ["epic", "legendary", "mythic"];

const FULLSCREEN_CFG = {
  epic: {
    overlayBg: "radial-gradient(ellipse at center, rgba(192,132,252,0.2) 0%, rgba(0,0,0,0.88) 100%)",
    glowColor: "rgba(192,132,252,0.65)",
    accent: "#c084fc",
    particles: ["✨", "💜", "⚡", "💫", "✨"],
    duration: "4.5s",
  },
  legendary: {
    overlayBg: "radial-gradient(ellipse at center, rgba(251,191,36,0.22) 0%, rgba(0,0,0,0.88) 100%)",
    glowColor: "rgba(251,191,36,0.7)",
    accent: "#fbbf24",
    particles: ["✨", "⭐", "💫", "🌟", "✨"],
    duration: "6s",
  },
  mythic: {
    overlayBg: "radial-gradient(ellipse at center, rgba(244,63,94,0.28) 0%, rgba(0,0,0,0.92) 100%)",
    glowColor: "rgba(244,63,94,0.75)",
    accent: "#f43f5e",
    particles: ["💥", "🔥", "❤️‍🔥", "💫", "💥"],
    duration: "7s",
  },
};

const SMALL_CFG = {
  common:   { glow: "0 0 18px rgba(148,163,184,0.4)",  border: "1px solid rgba(255,255,255,0.12)", bg: "rgba(12,8,26,0.72)",   duration: "2.2s", iconSize: "1.75rem" },
  uncommon: { glow: "0 0 22px rgba(74,222,128,0.45)",  border: "1px solid rgba(74,222,128,0.3)",  bg: "rgba(8,24,16,0.8)",    duration: "2.8s", iconSize: "1.75rem" },
  rare:     { glow: "0 0 26px rgba(96,165,250,0.5)",   border: "1px solid rgba(96,165,250,0.4)",  bg: "rgba(8,16,38,0.82)",   duration: "3.5s", iconSize: "2rem"    },
  epic:     { glow: "0 0 30px rgba(192,132,252,0.55)", border: "1px solid rgba(192,132,252,0.45)",bg: "rgba(28,12,52,0.85)",  duration: "4.5s", iconSize: "2rem"    },
};

export default function GiftEffect({ gift, senderName }) {
  if (!gift) return null;

  const rarity = gift.rarity || "common";
  const isBig = BIG_RARITIES.includes(rarity);

  if (isBig) {
    const cfg = FULLSCREEN_CFG[rarity];
    return (
      <>
        <div className="gift-fullscreen" style={{ background: cfg.overlayBg, animationDuration: cfg.duration }}>
          <div className="gfs-particles">
            {cfg.particles.map((p, i) => (
              <span key={i} className={`gfs-particle gfs-particle-${i}`}>{p}</span>
            ))}
          </div>
          <div className="gfs-body">
            <div className="gfs-icon" style={{ filter: `drop-shadow(0 0 24px ${cfg.glowColor})` }}>
              {gift.icon || "🎁"}
            </div>
            <div className="gfs-gift-name" style={{ color: cfg.accent }}>{gift.name || "Regalo"}</div>
            <div className="gfs-sender">
              <span className="gfs-sender-label">enviado por</span>
              <span className="gfs-sender-name" style={{ color: cfg.accent }}>
                {senderName || "Alguien"}
              </span>
            </div>
            {gift.coinCost > 0 && (
              <div className="gfs-coins" style={{ borderColor: cfg.accent }}>
                🪙 {gift.coinCost} coins
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          .gift-fullscreen {
            position: absolute;
            inset: 0;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: gfs-fade ease-in-out forwards;
          }

          @keyframes gfs-fade {
            0%   { opacity: 0; }
            10%  { opacity: 1; }
            80%  { opacity: 1; }
            100% { opacity: 0; }
          }

          .gfs-particles {
            position: absolute;
            inset: 0;
            pointer-events: none;
          }

          .gfs-particle {
            position: absolute;
            font-size: 1.8rem;
            animation: gfs-particle-float linear infinite;
          }

          .gfs-particle-0 { left: 12%; top: 20%; animation-duration: 2.2s; animation-delay: 0s; }
          .gfs-particle-1 { left: 75%; top: 15%; animation-duration: 2.6s; animation-delay: 0.3s; }
          .gfs-particle-2 { left: 25%; top: 70%; animation-duration: 2s;   animation-delay: 0.6s; }
          .gfs-particle-3 { left: 80%; top: 65%; animation-duration: 2.4s; animation-delay: 0.1s; }
          .gfs-particle-4 { left: 50%; top: 10%; animation-duration: 1.9s; animation-delay: 0.4s; }

          @keyframes gfs-particle-float {
            0%   { transform: translateY(0) scale(1);    opacity: 1; }
            50%  { transform: translateY(-30px) scale(1.2); opacity: 0.8; }
            100% { transform: translateY(0) scale(1);    opacity: 1; }
          }

          .gfs-body {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.6rem;
            text-align: center;
            padding: 0 1.5rem;
          }

          .gfs-icon {
            font-size: 5rem;
            animation: gfs-icon-pop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both;
          }

          @keyframes gfs-icon-pop {
            0%   { transform: scale(0) rotate(-20deg); }
            70%  { transform: scale(1.2) rotate(5deg); }
            100% { transform: scale(1) rotate(0deg); }
          }

          .gfs-gift-name {
            font-size: 1.5rem;
            font-weight: 900;
            letter-spacing: 0.04em;
            text-shadow: 0 0 20px currentColor;
          }

          .gfs-sender {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.15rem;
          }

          .gfs-sender-label {
            font-size: 0.7rem;
            color: rgba(255,255,255,0.6);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 600;
          }

          .gfs-sender-name {
            font-size: 1.4rem;
            font-weight: 900;
            text-shadow: 0 0 16px currentColor;
            animation: gfs-name-glow 1.2s ease-in-out infinite alternate;
          }

          @keyframes gfs-name-glow {
            from { filter: brightness(1); }
            to   { filter: brightness(1.35) drop-shadow(0 0 8px currentColor); }
          }

          .gfs-coins {
            margin-top: 0.2rem;
            font-size: 0.85rem;
            font-weight: 800;
            color: #fff;
            border: 1px solid;
            border-radius: 100px;
            padding: 0.2rem 0.8rem;
            background: rgba(0,0,0,0.4);
            letter-spacing: 0.04em;
          }
        `}</style>
      </>
    );
  }

  // Small pill for common / uncommon / rare / epic
  const style = SMALL_CFG[rarity] || SMALL_CFG.common;

  return (
    <>
      <div
        className="gift-effect"
        style={{
          background: style.bg,
          border: style.border,
          boxShadow: style.glow,
          animationDuration: style.duration,
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
          font-size: ${style.iconSize};
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
          0%  { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.92); }
          15% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
          85% { opacity: 1; }
          100%{ opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
      `}</style>
    </>
  );
}
