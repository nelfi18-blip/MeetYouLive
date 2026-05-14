"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InteractionButton from "./InteractionButton";

/**
 * InteractionBar - Premium bottom action bar for dating interactions
 * 
 * Props:
 *  - profile: current profile object
 *  - onFade: () => void - skip/pass action
 *  - onSpark: () => void - standard like action
 *  - onPulse: () => void - boost visibility action (paid)
 *  - onMagnet: () => void - super like action (paid)
 *  - onFlashLive: () => void - instant video invite action
 *  - disabled: boolean
 *  - boostPrice: number (default 100 coins)
 *  - magnetPrice: number (default 50 coins)
 */
export default function InteractionBar({
  profile,
  onFade,
  onSpark,
  onPulse,
  onMagnet,
  onFlashLive,
  disabled = false,
  boostPrice = 100,
  magnetPrice = 50,
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState(null);

  const handleAction = async (action, callback) => {
    if (disabled || loadingAction) return;
    
    setLoadingAction(action);
    try {
      await callback?.();
    } finally {
      // Clear loading state after animation completes
      setTimeout(() => setLoadingAction(null), 500);
    }
  };

  return (
    <>
      <div className="interaction-bar">
        <div className="interaction-bar-inner">
          {/* FADE - Skip/Pass */}
          <InteractionButton
            variant="fade"
            label="FADE"
            onClick={() => handleAction("fade", onFade)}
            disabled={disabled}
            loading={loadingAction === "fade"}
          />

          {/* SPARK - Standard Like */}
          <InteractionButton
            variant="spark"
            label="SPARK"
            onClick={() => handleAction("spark", onSpark)}
            disabled={disabled}
            loading={loadingAction === "spark"}
          />

          {/* PULSE - Boost Visibility */}
          <InteractionButton
            variant="pulse"
            label="PULSE"
            coinCost={boostPrice}
            onClick={() => handleAction("pulse", onPulse)}
            disabled={disabled}
            loading={loadingAction === "pulse"}
          />

          {/* MAGNET - Super Like */}
          <InteractionButton
            variant="magnet"
            label="MAGNET"
            coinCost={magnetPrice}
            onClick={() => handleAction("magnet", onMagnet)}
            disabled={disabled}
            loading={loadingAction === "magnet"}
          />

          {/* FLASH LIVE - Instant Video Invite */}
          <InteractionButton
            variant="flash-live"
            label="FLASH"
            onClick={() => handleAction("flash-live", onFlashLive)}
            disabled={disabled}
            loading={loadingAction === "flash-live"}
          />
        </div>

        {/* Glassmorphic backdrop */}
        <div className="interaction-bar-backdrop" />
      </div>

      <style jsx>{`
        .interaction-bar {
          position: fixed;
          /* Sit above the bottom navigation (which is ~70px tall + safe area) */
          bottom: calc(70px + env(safe-area-inset-bottom));
          left: 0;
          right: 0;
          z-index: 90; /* Below bottom-nav (z 1000) but above page content */
          padding: 0.5rem 1rem 1rem;
          display: flex;
          justify-content: center;
          pointer-events: none;
        }

        .interaction-bar-inner {
          position: relative;
          z-index: 2;
          display: flex;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          background: rgba(15, 8, 33, 0.85);
          backdrop-filter: blur(24px) saturate(1.5);
          -webkit-backdrop-filter: blur(24px) saturate(1.5);
          border: 1px solid rgba(224, 64, 251, 0.2);
          border-radius: 30px;
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.6),
            0 0 0 1px rgba(224, 64, 251, 0.1) inset,
            0 0 60px rgba(224, 64, 251, 0.15);
          pointer-events: auto;
          max-width: 600px;
          width: 100%;
        }

        .interaction-bar-backdrop {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(15, 8, 33, 0.4) 30%,
            rgba(15, 8, 33, 0.9) 100%
          );
          pointer-events: none;
          z-index: 1;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .interaction-bar {
            padding: 0.5rem 0.75rem 0.75rem;
          }

          .interaction-bar-inner {
            gap: 0.5rem;
            padding: 0.85rem 1rem;
            border-radius: 25px;
          }
        }

        @media (max-width: 480px) {
          .interaction-bar {
            padding: 0.5rem;
          }

          .interaction-bar-inner {
            gap: 0.4rem;
            padding: 0.75rem 0.85rem;
            border-radius: 20px;
          }
        }

        /* Safe area is already included in the bottom offset above; no extra padding needed */
      `}</style>
    </>
  );
}
