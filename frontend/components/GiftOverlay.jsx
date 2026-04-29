"use client";

import { useState, useEffect, useRef } from "react";

/**
 * GiftOverlay
 * 
 * Displays queued gift animations in real-time.
 * - Fullscreen animations for super gifts
 * - Floating animations for normal gifts
 * - Queue system prevents overlapping animations
 * - Optional sound playback
 * 
 * Usage:
 *   <GiftOverlay giftQueue={giftQueue} onGiftProcessed={callback} />
 */

const GiftOverlay = ({ giftQueue = [], onGiftProcessed }) => {
  const [currentGift, setCurrentGift] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const audioRef = useRef(null);

  // Process next gift in queue
  useEffect(() => {
    if (isAnimating || giftQueue.length === 0) return;

    const nextGift = giftQueue[0];
    setCurrentGift(nextGift);
    setIsAnimating(true);

    // Play sound if available
    if (nextGift.soundUrl) {
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        const audio = new Audio(nextGift.soundUrl);
        audio.volume = 0.5;
        audio.play().catch((err) => {
          console.log("[GiftOverlay] Sound playback failed:", err.message);
        });
        audioRef.current = audio;
      } catch (err) {
        console.error("[GiftOverlay] Sound error:", err);
      }
    }

    // Determine animation duration based on gift type
    const duration = nextGift.isSuper 
      ? 5000  // Super gifts: 5 seconds
      : 3000; // Normal gifts: 3 seconds

    // Remove gift after animation completes
    const timer = setTimeout(() => {
      setCurrentGift(null);
      setIsAnimating(false);
      
      if (onGiftProcessed) {
        onGiftProcessed(nextGift);
      }
    }, duration);

    return () => {
      clearTimeout(timer);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [giftQueue, isAnimating, onGiftProcessed]);

  if (!currentGift) return null;

  // Render super gift (fullscreen)
  if (currentGift.isSuper) {
    return (
      <div className="gift-overlay gift-overlay--super">
        <div className="gift-overlay__bg" />
        <div className="gift-overlay__content">
          <div className="gift-overlay__icon-super">
            {currentGift.icon || "🎁"}
          </div>
          <div className="gift-overlay__text-super">
            🔥 <strong>{currentGift.senderName}</strong> envió
          </div>
          <div className="gift-overlay__gift-name-super">
            {currentGift.giftName}
          </div>
          {currentGift.coins > 0 && (
            <div className="gift-overlay__coins-super">
              🪙 {currentGift.coins} coins
            </div>
          )}
        </div>

        <style jsx>{`
          .gift-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            pointer-events: none;
          }

          .gift-overlay--super .gift-overlay__bg {
            position: absolute;
            inset: 0;
            background: radial-gradient(ellipse at center, rgba(251,191,36,0.3) 0%, rgba(0,0,0,0.85) 100%);
            animation: bgFadeIn 0.5s ease-out forwards, bgFadeOut 0.8s ease-in 4.2s forwards;
          }

          @keyframes bgFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes bgFadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
          }

          .gift-overlay__content {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            padding: 2rem;
            text-align: center;
          }

          .gift-overlay__icon-super {
            font-size: 8rem;
            animation: iconPop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            filter: drop-shadow(0 0 30px rgba(251,191,36,0.8));
          }

          @keyframes iconPop {
            0% { transform: scale(0) rotate(-30deg); opacity: 0; }
            60% { transform: scale(1.3) rotate(10deg); }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }

          .gift-overlay__text-super {
            font-size: 1.5rem;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.95);
            animation: textSlideUp 0.5s ease-out 0.3s both;
          }

          .gift-overlay__gift-name-super {
            font-size: 2.5rem;
            font-weight: 900;
            color: #fbbf24;
            text-shadow: 0 0 25px rgba(251,191,36,0.8);
            animation: textSlideUp 0.5s ease-out 0.5s both, glow 1.5s ease-in-out infinite;
          }

          @keyframes textSlideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }

          @keyframes glow {
            0%, 100% { filter: brightness(1); }
            50% { filter: brightness(1.4) drop-shadow(0 0 15px currentColor); }
          }

          .gift-overlay__coins-super {
            font-size: 1.2rem;
            font-weight: 800;
            color: #fff;
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid #fbbf24;
            border-radius: 999px;
            padding: 0.5rem 1.5rem;
            animation: textSlideUp 0.5s ease-out 0.7s both;
          }

          @media (max-width: 640px) {
            .gift-overlay__icon-super {
              font-size: 5rem;
            }
            .gift-overlay__text-super {
              font-size: 1.2rem;
            }
            .gift-overlay__gift-name-super {
              font-size: 2rem;
            }
            .gift-overlay__coins-super {
              font-size: 1rem;
            }
          }
        `}</style>
      </div>
    );
  }

  // Render normal gift (floating)
  return (
    <div className="gift-overlay gift-overlay--normal">
      <div className="gift-overlay__floating">
        <div className="gift-overlay__icon-normal">
          {currentGift.icon || "🎁"}
        </div>
        <div className="gift-overlay__text-normal">
          <div className="gift-overlay__sender">
            {currentGift.senderName}
          </div>
          <div className="gift-overlay__gift-name">
            {currentGift.giftName}
          </div>
          {currentGift.coins > 0 && (
            <div className="gift-overlay__coins">
              🪙 {currentGift.coins}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .gift-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          pointer-events: none;
        }

        .gift-overlay--normal .gift-overlay__floating {
          position: absolute;
          bottom: 120px;
          right: 20px;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: rgba(0, 0, 0, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          padding: 0.85rem 1.2rem;
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          animation: slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards,
                     slideOut 0.4s ease-in 2.6s forwards;
          max-width: 280px;
        }

        @keyframes slideIn {
          from { 
            transform: translateX(120%);
            opacity: 0;
          }
          to { 
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideOut {
          from { 
            transform: translateY(0);
            opacity: 1;
          }
          to { 
            transform: translateY(-30px);
            opacity: 0;
          }
        }

        .gift-overlay__icon-normal {
          font-size: 2.5rem;
          flex-shrink: 0;
          animation: iconBounce 0.5s ease-out forwards;
        }

        @keyframes iconBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }

        .gift-overlay__text-normal {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 0;
        }

        .gift-overlay__sender {
          font-size: 0.9rem;
          font-weight: 800;
          color: #fbbf24;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gift-overlay__gift-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gift-overlay__coins {
          font-size: 0.75rem;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.7);
        }

        @media (max-width: 640px) {
          .gift-overlay--normal .gift-overlay__floating {
            bottom: 100px;
            right: 10px;
            left: 10px;
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
};

export default GiftOverlay;
