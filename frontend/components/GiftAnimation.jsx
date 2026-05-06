"use client";

import { useEffect, useState } from "react";

// Animation duration constants
const SUPER_GIFT_DURATION = 5000;  // Full-screen super gift animation duration (ms) - extended for better experience
const NORMAL_GIFT_DURATION = 3000; // Floating normal gift animation duration (ms) - extended

// Particle spawn configuration
// Particles spawn between 10% and 90% horizontally to stay within viewport
const PARTICLE_LEFT_MIN = 10;     // Minimum left position (%) - provides left padding
const PARTICLE_LEFT_RANGE = 80;   // Range of left positions (%) - provides right padding

// Helper function for random particle positioning
const getRandomParticleLeft = () => `${PARTICLE_LEFT_MIN + Math.random() * PARTICLE_LEFT_RANGE}%`;

// Particle types for variety
const PARTICLE_TYPES = ['✨', '💫', '⭐', '🌟', '✦', '◆', '❖'];

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
    const duration = gift.isSuper ? SUPER_GIFT_DURATION : NORMAL_GIFT_DURATION;
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, duration);

    return () => clearTimeout(timer);
  }, [gift, onComplete]);

  if (!visible) return null;

  // Rarity colors with gradients for more beautiful effects
  const RARITY_STYLES = {
    common: {
      color: "#94a3b8",
      gradient: "linear-gradient(135deg, #64748b 0%, #94a3b8 100%)",
      shadow: "0 0 30px rgba(148,163,184,0.6), 0 0 60px rgba(148,163,184,0.3)"
    },
    uncommon: {
      color: "#4ade80",
      gradient: "linear-gradient(135deg, #22c55e 0%, #4ade80 100%)",
      shadow: "0 0 30px rgba(74,222,128,0.6), 0 0 60px rgba(74,222,128,0.3)"
    },
    rare: {
      color: "#60a5fa",
      gradient: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)",
      shadow: "0 0 30px rgba(96,165,250,0.6), 0 0 60px rgba(96,165,250,0.3)"
    },
    epic: {
      color: "#c084fc",
      gradient: "linear-gradient(135deg, #a855f7 0%, #c084fc 100%)",
      shadow: "0 0 30px rgba(192,132,252,0.6), 0 0 60px rgba(192,132,252,0.3)"
    },
    legendary: {
      color: "#fbbf24",
      gradient: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #fde047 100%)",
      shadow: "0 0 30px rgba(251,191,36,0.8), 0 0 60px rgba(251,191,36,0.5), 0 0 90px rgba(251,191,36,0.3)"
    },
    mythic: {
      color: "#f43f5e",
      gradient: "linear-gradient(135deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)",
      shadow: "0 0 30px rgba(244,63,94,0.8), 0 0 60px rgba(244,63,94,0.5), 0 0 90px rgba(244,63,94,0.3)"
    },
  };

  const rarityStyle = RARITY_STYLES[gift.rarity] || RARITY_STYLES.common;

  if (gift.isSuper) {
    // Full-screen super gift animation with enhanced visual effects
    return (
      <>
        <div className="gift-anim-super-backdrop" />
        {/* Radial gradient overlay for depth */}
        <div className="gift-anim-radial-overlay" style={{
          background: `radial-gradient(circle at center, ${rarityStyle.color}10 0%, transparent 70%)`
        }} />
        
        <div className="gift-anim-super">
          <div className="gift-anim-super-content">
            {/* Holographic rings */}
            <div className="gift-anim-holo-rings">
              <div className="gift-anim-holo-ring" style={{ borderColor: rarityStyle.color }} />
              <div className="gift-anim-holo-ring" style={{ borderColor: rarityStyle.color, animationDelay: '0.3s' }} />
              <div className="gift-anim-holo-ring" style={{ borderColor: rarityStyle.color, animationDelay: '0.6s' }} />
            </div>

            {/* Super badge with gradient */}
            <div className="gift-anim-super-badge" style={{ 
              background: rarityStyle.gradient,
              boxShadow: rarityStyle.shadow
            }}>
              ⭐ SUPER REGALO ⭐
            </div>

            {/* Gift icon with 3D effect and multiple rings */}
            <div className="gift-anim-super-icon-wrap">
              <div className="gift-anim-super-icon" style={{
                textShadow: rarityStyle.shadow
              }}>{gift.icon}</div>
              <div className="gift-anim-super-ring gift-anim-super-ring-1" style={{ borderColor: rarityStyle.color }} />
              <div className="gift-anim-super-ring gift-anim-super-ring-2" style={{ borderColor: rarityStyle.color }} />
              <div className="gift-anim-super-ring gift-anim-super-ring-3" style={{ borderColor: rarityStyle.color }} />
              {/* Glow effect */}
              <div className="gift-anim-super-glow" style={{ 
                background: `radial-gradient(circle, ${rarityStyle.color}40 0%, transparent 70%)` 
              }} />
            </div>

            {/* Gift name with gradient text */}
            <div className="gift-anim-super-name" style={{ 
              background: rarityStyle.gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: `drop-shadow(0 0 20px ${rarityStyle.color})`
            }}>
              {gift.name}
            </div>

            {/* Quantity (if > 1) */}
            {gift.quantity > 1 && (
              <div className="gift-anim-super-qty" style={{
                background: rarityStyle.gradient,
                boxShadow: rarityStyle.shadow
              }}>x{gift.quantity}</div>
            )}

            {/* Sender name with glow */}
            {senderName && (
              <div className="gift-anim-super-sender">
                De: <strong style={{ color: rarityStyle.color }}>{senderName}</strong>
              </div>
            )}
          </div>

          {/* Enhanced particle effects with variety */}
          <div className="gift-anim-particles">
            {Array.from({ length: 30 }, (_, i) => (
              <div
                key={i}
                className="gift-anim-particle"
                style={{
                  left: getRandomParticleLeft(),
                  animationDelay: `${Math.random() * 1.5}s`,
                  animationDuration: `${2.5 + Math.random() * 2}s`,
                  fontSize: `${1 + Math.random() * 0.8}rem`,
                  color: i % 3 === 0 ? rarityStyle.color : 'white',
                }}
              >
                {PARTICLE_TYPES[i % PARTICLE_TYPES.length]}
              </div>
            ))}
          </div>
          
          {/* Light beams effect */}
          <div className="gift-anim-light-beams">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="gift-anim-light-beam"
                style={{
                  transform: `rotate(${i * 45}deg)`,
                  background: `linear-gradient(to bottom, ${rarityStyle.color}40 0%, transparent 100%)`,
                  animationDelay: `${i * 0.1}s`
                }}
              />
            ))}
          </div>
        </div>

        <style jsx>{`
          .gift-anim-super-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.92);
            backdrop-filter: blur(12px) saturate(150%);
            z-index: 9998;
            animation: fade-in 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .gift-anim-radial-overlay {
            position: fixed;
            inset: 0;
            z-index: 9998;
            animation: pulse-radial 3s ease-in-out infinite;
            pointer-events: none;
          }

          .gift-anim-super {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: zoom-in-bounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
          }

          .gift-anim-super-content {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.5rem;
            z-index: 3;
          }
          
          .gift-anim-holo-rings {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 400px;
            height: 400px;
            pointer-events: none;
            z-index: 1;
          }
          
          .gift-anim-holo-ring {
            position: absolute;
            inset: 0;
            border: 2px solid;
            border-radius: 50%;
            opacity: 0.3;
            animation: holo-rotate 6s linear infinite;
            mix-blend-mode: screen;
          }

          .gift-anim-super-badge {
            font-size: 1rem;
            font-weight: 900;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            color: #ffffff;
            padding: 0.75rem 2rem;
            border-radius: 999px;
            animation: pulse-glow-intense 2s ease-in-out infinite, badge-float 3s ease-in-out infinite;
            backdrop-filter: blur(8px);
            border: 2px solid rgba(255, 255, 255, 0.3);
            position: relative;
            overflow: hidden;
          }
          
          .gift-anim-super-badge::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: linear-gradient(
              45deg,
              transparent 30%,
              rgba(255, 255, 255, 0.3) 50%,
              transparent 70%
            );
            animation: shine 3s ease-in-out infinite;
          }

          .gift-anim-super-icon-wrap {
            position: relative;
            width: 200px;
            height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .gift-anim-super-icon {
            font-size: 9rem;
            line-height: 1;
            animation: bounce-rotate-3d 2s ease-in-out infinite;
            transform-style: preserve-3d;
            position: relative;
            z-index: 2;
          }
          
          .gift-anim-super-glow {
            position: absolute;
            inset: -60px;
            border-radius: 50%;
            animation: pulse-glow-size 2s ease-in-out infinite;
            z-index: 1;
          }

          .gift-anim-super-ring {
            position: absolute;
            border-radius: 50%;
            opacity: 0.7;
            mix-blend-mode: screen;
          }
          
          .gift-anim-super-ring-1 {
            inset: -30px;
            border: 3px solid;
            animation: ring-expand-rotate 3s ease-out infinite;
          }
          
          .gift-anim-super-ring-2 {
            inset: -50px;
            border: 2px solid;
            animation: ring-expand-rotate 3s ease-out infinite 1s;
          }
          
          .gift-anim-super-ring-3 {
            inset: -70px;
            border: 2px solid;
            animation: ring-expand-rotate 3s ease-out infinite 2s;
          }

          .gift-anim-super-name {
            font-size: 2.8rem;
            font-weight: 900;
            text-align: center;
            letter-spacing: 0.05em;
            animation: float-3d 4s ease-in-out infinite;
            transform-style: preserve-3d;
            position: relative;
          }
          
          .gift-anim-super-name::after {
            content: attr(data-text);
            position: absolute;
            left: 0;
            top: 0;
            z-index: -1;
            filter: blur(15px);
            opacity: 0.6;
          }

          .gift-anim-super-qty {
            font-size: 2rem;
            font-weight: 800;
            color: #ffffff;
            padding: 0.5rem 1.5rem;
            border-radius: 999px;
            animation: pulse-scale 2s ease-in-out infinite;
            backdrop-filter: blur(8px);
            border: 2px solid rgba(255, 255, 255, 0.3);
          }

          .gift-anim-super-sender {
            font-size: 1.2rem;
            color: rgba(255, 255, 255, 0.8);
            text-align: center;
            animation: fade-in-up 0.6s ease-out 0.3s both;
          }

          .gift-anim-super-sender strong {
            font-weight: 700;
            filter: drop-shadow(0 0 10px currentColor);
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
            animation: particle-fall-spin linear forwards;
            opacity: 0;
            will-change: transform, opacity;
          }
          
          .gift-anim-light-beams {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 800px;
            height: 800px;
            margin-left: -400px;
            margin-top: -400px;
            pointer-events: none;
            z-index: 0;
          }
          
          .gift-anim-light-beam {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100px;
            height: 400px;
            margin-left: -50px;
            margin-top: -200px;
            transform-origin: center center;
            animation: rotate-beam 12s linear infinite;
            opacity: 0.3;
            filter: blur(20px);
          }

          @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes fade-in-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          @keyframes pulse-radial {
            0%, 100% { opacity: 0.3; transform: scale(0.95); }
            50% { opacity: 0.6; transform: scale(1.05); }
          }

          @keyframes zoom-in-bounce {
            0% {
              opacity: 0;
              transform: scale(0.3) rotate(-5deg);
            }
            50% {
              transform: scale(1.05) rotate(2deg);
            }
            70% {
              transform: scale(0.95) rotate(-1deg);
            }
            100% {
              opacity: 1;
              transform: scale(1) rotate(0deg);
            }
          }
          
          @keyframes holo-rotate {
            0% { transform: rotate(0deg) scale(1); opacity: 0.3; }
            50% { transform: rotate(180deg) scale(1.1); opacity: 0.5; }
            100% { transform: rotate(360deg) scale(1); opacity: 0.3; }
          }
          
          @keyframes shine {
            0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
            100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
          }

          @keyframes pulse-glow-intense {
            0%, 100% { 
              filter: brightness(1) contrast(1);
              transform: scale(1);
            }
            50% { 
              filter: brightness(1.3) contrast(1.1);
              transform: scale(1.05);
            }
          }
          
          @keyframes badge-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }

          @keyframes bounce-rotate-3d {
            0%, 100% { 
              transform: scale(1) rotateY(0deg) rotateZ(0deg);
            }
            25% {
              transform: scale(1.15) rotateY(180deg) rotateZ(5deg);
            }
            50% {
              transform: scale(1) rotateY(360deg) rotateZ(0deg);
            }
            75% {
              transform: scale(1.15) rotateY(540deg) rotateZ(-5deg);
            }
          }
          
          @keyframes pulse-glow-size {
            0%, 100% {
              transform: scale(1);
              opacity: 0.4;
            }
            50% {
              transform: scale(1.3);
              opacity: 0.7;
            }
          }

          @keyframes ring-expand-rotate {
            0% {
              transform: scale(0.8) rotate(0deg);
              opacity: 0.8;
            }
            50% {
              opacity: 0.4;
            }
            100% {
              transform: scale(1.5) rotate(180deg);
              opacity: 0;
            }
          }

          @keyframes float-3d {
            0%, 100% { 
              transform: translateY(0) translateZ(0) rotateX(0deg);
            }
            50% { 
              transform: translateY(-15px) translateZ(20px) rotateX(5deg);
            }
          }
          
          @keyframes pulse-scale {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.1);
            }
          }

          @keyframes particle-fall-spin {
            0% {
              opacity: 1;
              transform: translateY(0) rotate(0deg) scale(0);
            }
            10% {
              opacity: 1;
              transform: translateY(10vh) rotate(36deg) scale(1);
            }
            90% {
              opacity: 0.7;
            }
            100% {
              opacity: 0;
              transform: translateY(100vh) rotate(720deg) scale(0.5);
            }
          }
          
          @keyframes rotate-beam {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </>
    );
  }

  // Floating normal gift animation with enhanced beauty
  return (
    <>
      <div className="gift-anim-floating">
        {/* Sparkle particles around the gift */}
        <div className="gift-anim-sparkles">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="gift-anim-sparkle"
              style={{
                '--angle': `${i * 45}deg`,
                animationDelay: `${i * 0.1}s`,
                color: rarityStyle.color
              }}
            >
              ✨
            </div>
          ))}
        </div>
        
        <div className="gift-anim-floating-content" style={{
          borderColor: rarityStyle.color,
          boxShadow: rarityStyle.shadow,
          background: `linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 100%)`
        }}>
          {/* Shine effect overlay */}
          <div className="gift-anim-shine" />
          
          <div className="gift-anim-floating-icon" style={{
            filter: `drop-shadow(0 0 15px ${rarityStyle.color})`
          }}>{gift.icon}</div>
          
          {gift.quantity > 1 && (
            <div className="gift-anim-floating-qty" style={{
              background: rarityStyle.gradient,
              boxShadow: `0 0 15px ${rarityStyle.color}`
            }}>x{gift.quantity}</div>
          )}
        </div>
        
        {senderName && (
          <div className="gift-anim-floating-sender" style={{
            color: rarityStyle.color,
            textShadow: `0 0 10px ${rarityStyle.color}`
          }}>{senderName}</div>
        )}
        
        {/* Ripple effect */}
        <div className="gift-anim-ripple" style={{ borderColor: rarityStyle.color }} />
        <div className="gift-anim-ripple" style={{ borderColor: rarityStyle.color, animationDelay: '0.5s' }} />
      </div>

      <style jsx>{`
        .gift-anim-floating {
          position: fixed;
          bottom: 35%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          animation: float-up-bounce 3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        .gift-anim-sparkles {
          position: absolute;
          width: 150px;
          height: 150px;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        
        .gift-anim-sparkle {
          position: absolute;
          top: 50%;
          left: 50%;
          font-size: 1.2rem;
          animation: sparkle-orbit 2s ease-in-out infinite;
          transform-origin: center;
        }

        .gift-anim-floating-content {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          backdrop-filter: blur(12px) saturate(150%);
          border: 3px solid;
          border-radius: 999px;
          padding: 1rem 2rem;
          animation: pulse-border 2s ease-in-out infinite;
          overflow: hidden;
        }
        
        .gift-anim-shine {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            45deg,
            transparent 30%,
            rgba(255, 255, 255, 0.4) 50%,
            transparent 70%
          );
          animation: shine-sweep 2.5s ease-in-out infinite;
        }

        .gift-anim-floating-icon {
          font-size: 3.5rem;
          line-height: 1;
          animation: icon-bounce-3d 1.5s ease-in-out infinite;
          transform-style: preserve-3d;
          position: relative;
          z-index: 1;
        }

        .gift-anim-floating-qty {
          font-size: 1.8rem;
          font-weight: 800;
          color: #ffffff;
          padding: 0.3rem 0.8rem;
          border-radius: 999px;
          animation: qty-pulse 1.5s ease-in-out infinite;
          position: relative;
          z-index: 1;
        }

        .gift-anim-floating-sender {
          font-size: 1.1rem;
          font-weight: 700;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          padding: 0.5rem 1.25rem;
          border-radius: 999px;
          border: 2px solid;
          animation: sender-glow 2s ease-in-out infinite;
        }
        
        .gift-anim-ripple {
          position: absolute;
          inset: -20px;
          border: 3px solid;
          border-radius: 999px;
          opacity: 0;
          animation: ripple-expand 2s ease-out infinite;
        }

        @keyframes float-up-bounce {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(80px) scale(0.5) rotate(-10deg);
          }
          15% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1.1) rotate(5deg);
          }
          25% {
            transform: translateX(-50%) translateY(-10px) scale(1) rotate(0deg);
          }
          35% {
            transform: translateX(-50%) translateY(0) scale(1) rotate(0deg);
          }
          85% {
            opacity: 1;
            transform: translateX(-50%) translateY(-80px) scale(1) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) translateY(-150px) scale(0.7) rotate(5deg);
          }
        }
        
        @keyframes sparkle-orbit {
          0% {
            transform: rotate(var(--angle)) translateX(60px) scale(0);
            opacity: 0;
          }
          20% {
            transform: rotate(var(--angle)) translateX(60px) scale(1);
            opacity: 1;
          }
          80% {
            transform: rotate(calc(var(--angle) + 180deg)) translateX(70px) scale(1);
            opacity: 1;
          }
          100% {
            transform: rotate(calc(var(--angle) + 180deg)) translateX(70px) scale(0);
            opacity: 0;
          }
        }
        
        @keyframes shine-sweep {
          0% {
            transform: translateX(-100%) translateY(-100%) rotate(45deg);
          }
          100% {
            transform: translateX(100%) translateY(100%) rotate(45deg);
          }
        }
        
        @keyframes pulse-border {
          0%, 100% {
            border-width: 3px;
            filter: brightness(1);
          }
          50% {
            border-width: 4px;
            filter: brightness(1.3);
          }
        }

        @keyframes icon-bounce-3d {
          0%, 100% {
            transform: scale(1) rotateY(0deg);
          }
          25% {
            transform: scale(1.1) rotateY(180deg);
          }
          50% {
            transform: scale(1) rotateY(360deg);
          }
          75% {
            transform: scale(1.1) rotateY(540deg);
          }
        }
        
        @keyframes qty-pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.15);
          }
        }
        
        @keyframes sender-glow {
          0%, 100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.3) drop-shadow(0 0 20px currentColor);
          }
        }
        
        @keyframes ripple-expand {
          0% {
            transform: scale(1);
            opacity: 0.8;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
