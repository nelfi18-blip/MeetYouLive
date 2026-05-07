"use client";

import { useState, useEffect, useRef } from "react";

/**
 * SuperGiftExplosion - Ultra-premium gift animation with particle effects
 * Displays for legendary and mythic gifts with explosive visuals
 */
export default function SuperGiftExplosion({ gift, senderName, quantity = 1, onComplete }) {
  const [particles, setParticles] = useState([]);
  const [rings, setRings] = useState([]);
  const canvasRef = useRef(null);

  useEffect(() => {
    // Generate particles
    const particleCount = Math.min(quantity * 2, 100);
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      angle: (Math.PI * 2 * i) / particleCount,
      distance: 0,
      speed: 2 + Math.random() * 3,
      size: 4 + Math.random() * 8,
      color: gift.rarity === "mythic" 
        ? `hsl(${Math.random() * 60 + 280}, 100%, ${60 + Math.random() * 20}%)` // Purple-pink
        : `hsl(${Math.random() * 40 + 30}, 100%, ${60 + Math.random() * 20}%)`, // Gold-orange
      opacity: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
    }));
    setParticles(newParticles);

    // Generate shockwave rings
    const newRings = Array.from({ length: 3 }, (_, i) => ({
      id: i,
      delay: i * 200,
      scale: 0,
    }));
    setRings(newRings);

    // Complete animation after duration
    const duration = gift.rarity === "mythic" ? 5000 : 4000;
    const timer = setTimeout(() => {
      if (onComplete) onComplete();
    }, duration);

    return () => clearTimeout(timer);
  }, [gift, quantity, onComplete]);

  return (
    <>
      <div className="super-gift-explosion">
        {/* Central gift icon */}
        <div className="gift-center">
          <div className="gift-icon-mega">{gift.icon || "🎁"}</div>
          <div className="gift-glow" />
        </div>

        {/* Particle explosion */}
        <div className="particles-container">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="particle"
              style={{
                "--angle": `${particle.angle}rad`,
                "--speed": particle.speed,
                "--size": `${particle.size}px`,
                "--color": particle.color,
                "--rotation": `${particle.rotation}deg`,
                "--rotation-speed": `${particle.rotationSpeed}deg`,
              }}
            />
          ))}
        </div>

        {/* Shockwave rings */}
        {rings.map((ring) => (
          <div
            key={ring.id}
            className="shockwave-ring"
            style={{ animationDelay: `${ring.delay}ms` }}
          />
        ))}

        {/* Gift info overlay */}
        <div className="gift-info-overlay">
          <div className="gift-sender gradient-text-animated">{senderName}</div>
          <div className="gift-name">{gift.name || "Regalo épico"}</div>
          {quantity > 1 && (
            <div className="gift-quantity">×{quantity}</div>
          )}
        </div>

        {/* Light rays */}
        <div className="light-rays">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="light-ray"
              style={{ transform: `rotate(${(360 / 12) * i}deg)` }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        .super-gift-explosion {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          overflow: hidden;
          background: radial-gradient(circle at center, rgba(139, 92, 246, 0.2) 0%, transparent 60%);
          animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .gift-center {
          position: relative;
          z-index: 10;
          animation: scaleIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        @keyframes scaleIn {
          from {
            transform: scale(0) rotate(-180deg);
            opacity: 0;
          }
          to {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        .gift-icon-mega {
          font-size: 8rem;
          filter: drop-shadow(0 0 30px rgba(224, 64, 251, 0.8));
          animation: iconFloat 3s ease-in-out infinite, iconRotate 10s linear infinite;
        }

        @keyframes iconFloat {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes iconRotate {
          from {
            transform: rotateY(0deg);
          }
          to {
            transform: rotateY(360deg);
          }
        }

        .gift-glow {
          position: absolute;
          inset: -50%;
          background: radial-gradient(circle, rgba(224, 64, 251, 0.6) 0%, transparent 70%);
          animation: glowPulse 2s ease-in-out infinite;
          filter: blur(40px);
        }

        @keyframes glowPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.3);
            opacity: 1;
          }
        }

        .particles-container {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .particle {
          position: absolute;
          width: var(--size);
          height: var(--size);
          background: var(--color);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--color);
          animation: particleExplosion 3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
          transform-origin: center;
        }

        @keyframes particleExplosion {
          0% {
            transform: translate(0, 0) rotate(0deg) scale(1);
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: 
              translate(
                calc(cos(var(--angle)) * var(--speed) * 150px),
                calc(sin(var(--angle)) * var(--speed) * 150px)
              )
              rotate(calc(var(--rotation) + var(--rotation-speed) * 3))
              scale(0.2);
            opacity: 0;
          }
        }

        .shockwave-ring {
          position: absolute;
          inset: 50%;
          border: 3px solid rgba(224, 64, 251, 0.6);
          border-radius: 50%;
          animation: shockwave 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        @keyframes shockwave {
          0% {
            inset: 50%;
            opacity: 1;
            border-width: 3px;
          }
          100% {
            inset: -100%;
            opacity: 0;
            border-width: 0px;
          }
        }

        .gift-info-overlay {
          position: absolute;
          bottom: 15%;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          z-index: 5;
          animation: slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        .gift-sender {
          font-size: 1.8rem;
          font-weight: 900;
          margin-bottom: 0.5rem;
          text-shadow: 0 0 20px rgba(224, 64, 251, 0.8);
        }

        .gift-name {
          font-size: 1.3rem;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
          margin-bottom: 0.3rem;
        }

        .gift-quantity {
          font-size: 2.5rem;
          font-weight: 900;
          background: var(--grad-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: quantityPulse 1s ease-in-out infinite;
        }

        @keyframes quantityPulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.2);
          }
        }

        .light-rays {
          position: absolute;
          inset: 0;
          animation: raysRotate 20s linear infinite;
        }

        @keyframes raysRotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .light-ray {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 4px;
          height: 40%;
          background: linear-gradient(to top, transparent 0%, rgba(224, 64, 251, 0.6) 50%, transparent 100%);
          transform-origin: center bottom;
          opacity: 0;
          animation: rayPulse 2s ease-in-out infinite;
          filter: blur(2px);
        }

        .light-ray:nth-child(odd) {
          animation-delay: 1s;
        }

        @keyframes rayPulse {
          0%, 100% {
            opacity: 0;
            transform: translateY(-50%) scale(1, 0.5);
          }
          50% {
            opacity: 0.8;
            transform: translateY(-50%) scale(1, 1.2);
          }
        }
      `}</style>
    </>
  );
}
