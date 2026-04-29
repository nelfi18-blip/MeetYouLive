"use client";

import { useEffect, useState } from "react";

/**
 * GiftAnimation - displays floating or full-screen gift animations
 * 
 * Props:
 *  - gift: Gift object with { icon, name, isSuper, rarity, quantity }
 *  - onComplete: Callback when animation completes
 *  - senderName: Name of the sender (optional)
 */
export default function GiftAnimation({ gift, onComplete, senderName }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const duration = gift.isSuper ? 4000 : 2500;
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, duration);

    return () => clearTimeout(timer);
  }, [gift, onComplete]);

  if (!visible) return null;

  // Rarity colors
  const RARITY_COLORS = {
    common: "#94a3b8",
    uncommon: "#4ade80",
    rare: "#60a5fa",
    epic: "#c084fc",
    legendary: "#fbbf24",
    mythic: "#f43f5e",
  };

  const rarityColor = RARITY_COLORS[gift.rarity] || RARITY_COLORS.common;

  if (gift.isSuper) {
    // Full-screen super gift animation
    return (
      <>
        <div className="gift-anim-super-backdrop" />
        <div className="gift-anim-super">
          <div className="gift-anim-super-content">
            {/* Super badge */}
            <div className="gift-anim-super-badge">
              ⭐ SUPER REGALO ⭐
            </div>

            {/* Gift icon with pulse animation */}
            <div className="gift-anim-super-icon-wrap">
              <div className="gift-anim-super-icon">{gift.icon}</div>
              <div className="gift-anim-super-ring" style={{ borderColor: rarityColor }} />
              <div className="gift-anim-super-ring gift-anim-super-ring-2" style={{ borderColor: rarityColor }} />
            </div>

            {/* Gift name */}
            <div className="gift-anim-super-name" style={{ color: rarityColor }}>
              {gift.name}
            </div>

            {/* Quantity (if > 1) */}
            {gift.quantity > 1 && (
              <div className="gift-anim-super-qty">x{gift.quantity}</div>
            )}

            {/* Sender name */}
            {senderName && (
              <div className="gift-anim-super-sender">
                De: <strong>{senderName}</strong>
              </div>
            )}
          </div>

          {/* Particle effects */}
          <div className="gift-anim-particles">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="gift-anim-particle"
                style={{
                  left: `${10 + Math.random() * 80}%`,
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              >
                ✨
              </div>
            ))}
          </div>
        </div>

        <style jsx>{`
          .gift-anim-super-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            z-index: 9998;
            animation: fade-in 0.3s ease;
          }

          .gift-anim-super {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: zoom-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }

          .gift-anim-super-content {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.2rem;
            z-index: 2;
          }

          .gift-anim-super-badge {
            font-size: 0.9rem;
            font-weight: 900;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: #fbbf24;
            background: linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15));
            border: 2px solid rgba(251,191,36,0.6);
            padding: 0.5rem 1.5rem;
            border-radius: 999px;
            animation: pulse-glow 2s ease-in-out infinite;
          }

          .gift-anim-super-icon-wrap {
            position: relative;
            width: 180px;
            height: 180px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .gift-anim-super-icon {
            font-size: 8rem;
            line-height: 1;
            animation: bounce-scale 1s ease-in-out infinite;
            filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
          }

          .gift-anim-super-ring {
            position: absolute;
            inset: -20px;
            border: 3px solid;
            border-radius: 50%;
            opacity: 0.6;
            animation: ring-expand 2s ease-out infinite;
          }

          .gift-anim-super-ring-2 {
            animation-delay: 1s;
          }

          .gift-anim-super-name {
            font-size: 2.5rem;
            font-weight: 900;
            text-align: center;
            letter-spacing: 0.02em;
            text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            animation: float 3s ease-in-out infinite;
          }

          .gift-anim-super-qty {
            font-size: 1.8rem;
            font-weight: 800;
            color: #fbbf24;
            background: rgba(251,191,36,0.15);
            border: 2px solid rgba(251,191,36,0.4);
            padding: 0.4rem 1rem;
            border-radius: 999px;
          }

          .gift-anim-super-sender {
            font-size: 1.1rem;
            color: rgba(255, 255, 255, 0.7);
            text-align: center;
          }

          .gift-anim-super-sender strong {
            color: #fff;
            font-weight: 700;
          }

          .gift-anim-particles {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 1;
          }

          .gift-anim-particle {
            position: absolute;
            top: -50px;
            font-size: 1.5rem;
            animation: particle-fall linear forwards;
            opacity: 0;
          }

          @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes zoom-in {
            from {
              opacity: 0;
              transform: scale(0.5);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.5); }
            50% { box-shadow: 0 0 40px rgba(251,191,36,0.8); }
          }

          @keyframes bounce-scale {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }

          @keyframes ring-expand {
            0% {
              transform: scale(1);
              opacity: 0.6;
            }
            100% {
              transform: scale(2);
              opacity: 0;
            }
          }

          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }

          @keyframes particle-fall {
            0% {
              opacity: 1;
              transform: translateY(0) rotate(0deg);
            }
            100% {
              opacity: 0;
              transform: translateY(100vh) rotate(360deg);
            }
          }
        `}</style>
      </>
    );
  }

  // Floating normal gift animation
  return (
    <>
      <div className="gift-anim-floating">
        <div className="gift-anim-floating-content">
          <div className="gift-anim-floating-icon">{gift.icon}</div>
          {gift.quantity > 1 && (
            <div className="gift-anim-floating-qty">x{gift.quantity}</div>
          )}
        </div>
        {senderName && (
          <div className="gift-anim-floating-sender">{senderName}</div>
        )}
      </div>

      <style jsx>{`
        .gift-anim-floating {
          position: fixed;
          bottom: 30%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          animation: float-up 2.5s ease-out forwards;
        }

        .gift-anim-floating-content {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          border: 2px solid ${rarityColor};
          border-radius: 999px;
          padding: 0.8rem 1.5rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 20px ${rarityColor}40;
        }

        .gift-anim-floating-icon {
          font-size: 3rem;
          line-height: 1;
          filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5));
        }

        .gift-anim-floating-qty {
          font-size: 1.5rem;
          font-weight: 800;
          color: #fbbf24;
        }

        .gift-anim-floating-sender {
          font-size: 0.9rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          padding: 0.4rem 1rem;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        @keyframes float-up {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(50px) scale(0.8);
          }
          10% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
          90% {
            opacity: 1;
            transform: translateX(-50%) translateY(-100px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) translateY(-150px) scale(0.8);
          }
        }
      `}</style>
    </>
  );
}
