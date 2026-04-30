"use client";

import { useEffect, useState } from "react";

/**
 * SuperGiftAnimation - Full-screen animation overlay for super tier gifts
 * 
 * Displays a dramatic full-screen animation when a super gift is sent in a live stream.
 * Features:
 * - Dark semi-transparent background overlay
 * - Animated gift icon with glow effects
 * - Large sender name display
 * - Neon/glow visual effects
 * - Auto-disappears after 3-5 seconds
 * - Pauses UI interaction briefly
 * 
 * Props:
 *  - gift: { icon, name, animationType }
 *  - sender: string - Sender's display name
 *  - value: number - Gift value in coins
 *  - onComplete: callback when animation finishes
 */
export default function SuperGiftAnimation({ gift, sender, value, onComplete }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Super gift animation duration: 4 seconds
    const duration = 4000;
    
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, duration);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  // Determine animation intensity based on value
  const isUltraHigh = value >= 2000;
  const isHigh = value >= 800;

  return (
    <>
      {/* Dark background overlay - pauses UI interaction */}
      <div className="super-gift-backdrop" />
      
      {/* Main animation container */}
      <div className="super-gift-animation">
        <div className="super-gift-content">
          
          {/* Super badge at top */}
          <div className="super-gift-badge">
            {isUltraHigh ? "✨ REGALO MÍTICO ✨" : "🔥 SUPER REGALO 🔥"}
          </div>

          {/* Large sender name with glow */}
          <div className="super-gift-sender">
            <strong>{sender}</strong>
          </div>

          <div className="super-gift-sent-text">envió</div>

          {/* Animated gift icon with glow ring */}
          <div className="super-gift-icon-container">
            <div className="super-gift-glow-ring super-gift-glow-ring-1" />
            <div className="super-gift-glow-ring super-gift-glow-ring-2" />
            <div className="super-gift-glow-ring super-gift-glow-ring-3" />
            <div className="super-gift-icon">
              {gift.icon || "🎁"}
            </div>
          </div>

          {/* Gift name */}
          <div className="super-gift-name">
            {gift.name}
          </div>

          {/* Value display */}
          <div className="super-gift-value">
            💰 {value.toLocaleString()} coins
          </div>
        </div>

        {/* Particle effects */}
        <div className="super-gift-particles">
          {Array.from({ length: 30 }, (_, i) => (
            <div
              key={i}
              className="super-gift-particle"
              style={{
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            >
              {i % 4 === 0 ? "✨" : i % 4 === 1 ? "💫" : i % 4 === 2 ? "⭐" : "🌟"}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        /* ═══ BACKDROP ═══ */
        .super-gift-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.92);
          backdrop-filter: blur(12px);
          z-index: 10000;
          animation: backdrop-fade-in 0.4s ease;
        }

        /* ═══ MAIN CONTAINER ═══ */
        .super-gift-animation {
          position: fixed;
          inset: 0;
          z-index: 10001;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          animation: scale-in 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .super-gift-content {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          z-index: 2;
        }

        /* ═══ SUPER BADGE ═══ */
        .super-gift-badge {
          font-size: 1rem;
          font-weight: 900;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #fbbf24;
          background: linear-gradient(135deg, rgba(251,191,36,0.3), rgba(245,158,11,0.2));
          border: 3px solid rgba(251,191,36,0.7);
          padding: 0.7rem 2rem;
          border-radius: 999px;
          box-shadow: 0 0 40px rgba(251,191,36,0.6), 0 8px 24px rgba(0,0,0,0.5);
          animation: pulse-glow 2s ease-in-out infinite;
        }

        /* ═══ SENDER NAME (BIG) ═══ */
        .super-gift-sender {
          font-size: 3.5rem;
          font-weight: 900;
          text-align: center;
          color: #ffffff;
          text-shadow: 
            0 0 20px rgba(251,191,36,0.8),
            0 0 40px rgba(251,191,36,0.6),
            0 8px 30px rgba(0,0,0,0.8);
          letter-spacing: 0.05em;
          animation: glow-pulse 2s ease-in-out infinite;
        }

        .super-gift-sent-text {
          font-size: 1.2rem;
          color: rgba(255, 255, 255, 0.8);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* ═══ GIFT ICON WITH NEON RINGS ═══ */
        .super-gift-icon-container {
          position: relative;
          width: 220px;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 1rem 0;
        }

        .super-gift-icon {
          font-size: 10rem;
          line-height: 1;
          animation: bounce-rotate 2s ease-in-out infinite;
          filter: 
            drop-shadow(0 0 20px rgba(251,191,36,0.8))
            drop-shadow(0 15px 40px rgba(0,0,0,0.7));
        }

        .super-gift-glow-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 4px solid rgba(251,191,36,0.8);
          animation: ring-pulse 2s ease-out infinite;
        }

        .super-gift-glow-ring-2 {
          animation-delay: 0.5s;
          border-color: rgba(245,158,11,0.6);
        }

        .super-gift-glow-ring-3 {
          animation-delay: 1s;
          border-color: rgba(251,191,36,0.4);
        }

        /* ═══ GIFT NAME ═══ */
        .super-gift-name {
          font-size: 2.8rem;
          font-weight: 800;
          text-align: center;
          color: #fbbf24;
          text-shadow: 
            0 0 20px rgba(251,191,36,0.8),
            0 4px 20px rgba(0,0,0,0.6);
          letter-spacing: 0.03em;
          animation: float-text 3s ease-in-out infinite;
        }

        /* ═══ VALUE ═══ */
        .super-gift-value {
          font-size: 1.6rem;
          font-weight: 700;
          color: #fbbf24;
          background: rgba(251,191,36,0.2);
          border: 2px solid rgba(251,191,36,0.5);
          padding: 0.6rem 1.5rem;
          border-radius: 999px;
          box-shadow: 0 0 20px rgba(251,191,36,0.4);
        }

        /* ═══ PARTICLES ═══ */
        .super-gift-particles {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          overflow: hidden;
        }

        .super-gift-particle {
          position: absolute;
          top: -60px;
          font-size: 2rem;
          animation: particle-fall linear forwards;
          opacity: 0;
        }

        /* ═══ ANIMATIONS ═══ */
        @keyframes backdrop-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.6);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes pulse-glow {
          0%, 100% { 
            box-shadow: 0 0 40px rgba(251,191,36,0.6), 0 8px 24px rgba(0,0,0,0.5);
          }
          50% { 
            box-shadow: 0 0 70px rgba(251,191,36,0.9), 0 12px 36px rgba(0,0,0,0.6);
          }
        }

        @keyframes glow-pulse {
          0%, 100% {
            text-shadow: 
              0 0 20px rgba(251,191,36,0.8),
              0 0 40px rgba(251,191,36,0.6),
              0 8px 30px rgba(0,0,0,0.8);
          }
          50% {
            text-shadow: 
              0 0 35px rgba(251,191,36,1),
              0 0 60px rgba(251,191,36,0.8),
              0 12px 40px rgba(0,0,0,0.9);
          }
        }

        @keyframes bounce-rotate {
          0%, 100% { 
            transform: scale(1) rotate(0deg); 
          }
          25% { 
            transform: scale(1.1) rotate(-5deg); 
          }
          50% { 
            transform: scale(1.15) rotate(0deg); 
          }
          75% { 
            transform: scale(1.1) rotate(5deg); 
          }
        }

        @keyframes ring-pulse {
          0% {
            transform: scale(1);
            opacity: 0.8;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }

        @keyframes float-text {
          0%, 100% { 
            transform: translateY(0); 
          }
          50% { 
            transform: translateY(-15px); 
          }
        }

        @keyframes particle-fall {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateY(110vh) rotate(720deg);
          }
        }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 768px) {
          .super-gift-sender {
            font-size: 2.5rem;
          }
          .super-gift-icon {
            font-size: 7rem;
          }
          .super-gift-name {
            font-size: 2rem;
          }
          .super-gift-value {
            font-size: 1.2rem;
          }
          .super-gift-icon-container {
            width: 160px;
            height: 160px;
          }
        }
      `}</style>
    </>
  );
}
