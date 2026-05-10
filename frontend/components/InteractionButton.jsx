"use client";

import { useState } from "react";

/**
 * InteractionButton - Premium branded action button for MeetYouLive
 * 
 * Props:
 *  - variant: "fade" | "spark" | "pulse" | "magnet" | "flash-live"
 *  - onClick: function
 *  - disabled: boolean
 *  - loading: boolean
 *  - label: string
 *  - coinCost: number (optional - shows coin badge if provided)
 */
export default function InteractionButton({
  variant = "spark",
  onClick,
  disabled = false,
  loading = false,
  label,
  coinCost,
  className = "",
}) {
  const [isPressed, setIsPressed] = useState(false);

  const handlePress = () => {
    if (disabled || loading) return;
    
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 300);
    
    // Haptic feedback on mobile
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(30);
    }
    
    onClick?.();
  };

  const getVariantConfig = () => {
    switch (variant) {
      case "fade":
        return {
          icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ),
          gradient: "linear-gradient(135deg, rgba(51, 51, 51, 0.4), rgba(30, 30, 30, 0.6))",
          glow: "0 0 20px rgba(100, 100, 100, 0.3)",
          borderColor: "rgba(100, 100, 100, 0.3)",
          textColor: "#94a3b8",
          hoverGlow: "0 0 30px rgba(100, 100, 100, 0.5)",
        };
      case "spark":
        return {
          icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          ),
          gradient: "linear-gradient(135deg, #ff4fa3, #e040fb)",
          glow: "0 0 20px rgba(224, 64, 251, 0.5), 0 0 40px rgba(255, 79, 163, 0.3)",
          borderColor: "rgba(224, 64, 251, 0.5)",
          textColor: "#ff4fa3",
          hoverGlow: "0 0 30px rgba(224, 64, 251, 0.8), 0 0 60px rgba(255, 79, 163, 0.5)",
        };
      case "pulse":
        return {
          icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <circle cx="12" cy="12" r="8" opacity="0.5" />
              <circle cx="12" cy="12" r="11" opacity="0.2" />
            </svg>
          ),
          gradient: "linear-gradient(135deg, #22d3ee, #7c3aed)",
          glow: "0 0 20px rgba(34, 211, 238, 0.5), 0 0 40px rgba(124, 58, 237, 0.3)",
          borderColor: "rgba(34, 211, 238, 0.5)",
          textColor: "#22d3ee",
          hoverGlow: "0 0 30px rgba(34, 211, 238, 0.8), 0 0 60px rgba(124, 58, 237, 0.5)",
        };
      case "magnet":
        return {
          icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              <path d="M12 2L9 8l-7 1 5.5 5.5L6 22l6-3.5 6 3.5-1.5-7.5L22 9l-7-1-3-6z" opacity="0.5" />
            </svg>
          ),
          gradient: "linear-gradient(135deg, #8b5cf6, #c040ff)",
          glow: "0 0 20px rgba(139, 92, 246, 0.5), 0 0 40px rgba(192, 64, 255, 0.3)",
          borderColor: "rgba(139, 92, 246, 0.5)",
          textColor: "#c4b5fd",
          hoverGlow: "0 0 30px rgba(139, 92, 246, 0.8), 0 0 60px rgba(192, 64, 255, 0.5)",
        };
      case "flash-live":
        return {
          icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" fill="currentColor" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
              <path d="M13 2l-2 5 5-1-2 5" strokeWidth="2.5" stroke="#fbbf24" fill="#fbbf24" opacity="0.8" />
            </svg>
          ),
          gradient: "linear-gradient(135deg, #fbbf24, #fb923c)",
          glow: "0 0 20px rgba(251, 191, 36, 0.5), 0 0 40px rgba(251, 146, 60, 0.3)",
          borderColor: "rgba(251, 191, 36, 0.5)",
          textColor: "#fbbf24",
          hoverGlow: "0 0 30px rgba(251, 191, 36, 0.8), 0 0 60px rgba(251, 146, 60, 0.5)",
        };
      default:
        return {
          icon: null,
          gradient: "linear-gradient(135deg, #e040fb, #8b5cf6)",
          glow: "0 0 20px rgba(224, 64, 251, 0.4)",
          borderColor: "rgba(224, 64, 251, 0.3)",
          textColor: "#e040fb",
          hoverGlow: "0 0 30px rgba(224, 64, 251, 0.6)",
        };
    }
  };

  const config = getVariantConfig();

  return (
    <>
      <button
        className={`interaction-button ${variant} ${isPressed ? "pressed" : ""} ${className}`}
        onClick={handlePress}
        disabled={disabled || loading}
        aria-label={label}
      >
        <div className="interaction-button-inner">
          {loading ? (
            <div className="interaction-spinner" />
          ) : (
            <>
              <div className="interaction-icon">{config.icon}</div>
              {label && <span className="interaction-label">{label}</span>}
              {coinCost && (
                <span className="interaction-coin-badge">
                  🪙{coinCost}
                </span>
              )}
            </>
          )}
        </div>
        
        {/* Animated glow rings for premium effect */}
        <div className="interaction-glow-ring ring-1" />
        <div className="interaction-glow-ring ring-2" />
      </button>

      <style jsx>{`
        .interaction-button {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem;
          min-width: 70px;
          background: ${config.gradient};
          border: 2px solid ${config.borderColor};
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: ${config.glow};
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          overflow: hidden;
        }

        .interaction-button::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .interaction-button:hover:not(:disabled)::before {
          opacity: 1;
        }

        .interaction-button:hover:not(:disabled) {
          transform: translateY(-4px) scale(1.05);
          box-shadow: ${config.hoverGlow};
          border-color: ${config.textColor};
        }

        .interaction-button:active:not(:disabled),
        .interaction-button.pressed {
          transform: translateY(-2px) scale(0.98);
        }

        .interaction-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .interaction-button-inner {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
        }

        .interaction-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
        }

        .interaction-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: white;
          text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
        }

        .interaction-coin-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          color: white;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 0.15rem 0.4rem;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(251, 191, 36, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .interaction-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        /* Animated glow rings - pulse effect */
        .interaction-glow-ring {
          position: absolute;
          inset: -10px;
          border: 2px solid ${config.textColor};
          border-radius: 24px;
          opacity: 0;
          pointer-events: none;
        }

        .interaction-button:hover:not(:disabled) .ring-1 {
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .interaction-button:hover:not(:disabled) .ring-2 {
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.2, 1) 0.5s infinite;
        }

        /* Pulse animation for PULSE variant */
        .interaction-button.pulse .interaction-icon {
          animation: pulse-icon 2s ease-in-out infinite;
        }

        /* Sparkle animation for SPARK variant */
        .interaction-button.spark .interaction-icon {
          animation: sparkle 1.5s ease-in-out infinite;
        }

        /* Fade animation for FADE variant */
        .interaction-button.fade .interaction-icon {
          animation: fade-pulse 3s ease-in-out infinite;
        }

        /* Magnet attraction animation */
        .interaction-button.magnet .interaction-icon {
          animation: magnet-pull 2s ease-in-out infinite;
        }

        /* Flash live animation */
        .interaction-button.flash-live .interaction-icon {
          animation: flash-blink 1s ease-in-out infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.4;
          }
          100% {
            transform: scale(1.3);
            opacity: 0;
          }
        }

        @keyframes pulse-icon {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.8;
          }
        }

        @keyframes sparkle {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            filter: brightness(1);
          }
          25% {
            transform: scale(1.1) rotate(-5deg);
            filter: brightness(1.3);
          }
          75% {
            transform: scale(1.1) rotate(5deg);
            filter: brightness(1.3);
          }
        }

        @keyframes fade-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }

        @keyframes magnet-pull {
          0%, 100% {
            transform: scale(1) translateY(0);
          }
          50% {
            transform: scale(1.08) translateY(-2px);
          }
        }

        @keyframes flash-blink {
          0%, 50%, 100% {
            opacity: 1;
          }
          25%, 75% {
            opacity: 0.7;
          }
        }

        /* Mobile optimization */
        @media (max-width: 600px) {
          .interaction-button {
            min-width: 60px;
            padding: 0.85rem 0.75rem;
          }
          
          .interaction-label {
            font-size: 0.65rem;
          }
        }
      `}</style>
    </>
  );
}
