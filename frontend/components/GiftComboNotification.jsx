"use client";

import { useEffect, useState, useRef } from "react";

/**
 * GiftComboNotification
 * 
 * Displays when a user maintains a gift combo streak (rapid successive gifts within 3 seconds).
 * Shows: "🔥 Juan x10 COMBO!"
 * 
 * Usage:
 *   Listen to GIFT_COMBO socket event and pass data to this component
 */

export default function GiftComboNotification({ combo }) {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    // Safeguard: Validate combo data before displaying
    // Backend emits only combos >= 2, but this defensive check prevents
    // display issues if socket event structure changes in the future
    if (!combo || !combo.username || !combo.comboCount || combo.comboCount < 2) {
      setVisible(false); // Explicitly hide if validation fails
      return;
    }

    // Show the notification
    setVisible(true);

    // Clear existing timer
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    // Auto-hide after 3 seconds
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, 3000);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [combo]);

  if (!visible || !combo) return null;

  const { username, comboCount } = combo;

  // Intensity classes based on combo count
  const intensityClass =
    comboCount >= 20 ? "gcn-mega" :
    comboCount >= 10 ? "gcn-huge" :
    comboCount >= 5 ? "gcn-big" :
    "gcn-normal";

  return (
    <div className={`gcn ${intensityClass}`}>
      <div className="gcn-fire">🔥</div>
      <div className="gcn-content">
        <div className="gcn-username">{username}</div>
        <div className="gcn-combo">x{comboCount} COMBO!</div>
      </div>

      <style jsx>{`
        .gcn {
          /* Color variables for consistency and maintainability */
          --color-primary: rgba(255, 64, 129, 0.95);
          --color-secondary: rgba(244, 63, 94, 0.95);
          --color-tertiary: rgba(239, 68, 68, 0.95);
          --color-border: rgba(255, 255, 255, 0.3);
          --color-shadow-primary: rgba(244, 63, 94, 0.6);
          --color-shadow-primary-strong: rgba(244, 63, 94, 0.7);
          --color-shadow-primary-stronger: rgba(244, 63, 94, 0.8);
          --color-shadow-primary-strongest: rgba(244, 63, 94, 0.9);
          --color-shadow-primary-full: rgba(244, 63, 94, 1);
          --color-shadow-glow: rgba(255, 64, 129, 0.4);
          --color-shadow-glow-medium: rgba(255, 64, 129, 0.5);
          --color-shadow-glow-strong: rgba(255, 64, 129, 0.6);
          --color-shadow-glow-stronger: rgba(255, 64, 129, 0.7);
          --color-shadow-glow-strongest: rgba(255, 64, 129, 0.8);
          --color-shadow-inset: rgba(255, 255, 255, 0.2);
          --color-shadow-inset-strong: rgba(255, 255, 255, 0.3);
          --color-gold: rgba(255, 215, 0, 0.3);
          --color-gold-medium: rgba(255, 215, 0, 0.5);
          --color-gold-solid: #ffd700;
          --color-gold-glow: rgba(255, 215, 0, 0.8);
          --color-fire-glow: rgba(255, 165, 0, 0.8);
          --color-text-white: #fff;
          --color-text-shadow: rgba(0, 0, 0, 0.5);
          --color-text-shadow-dark: rgba(0, 0, 0, 0.3);
          
          position: fixed;
          top: 20%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          border-radius: 16px;
          background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 50%, var(--color-tertiary) 100%);
          border: 2px solid var(--color-border);
          box-shadow: 
            0 8px 32px var(--color-shadow-primary),
            0 0 80px var(--color-shadow-glow),
            inset 0 1px 0 var(--color-shadow-inset);
          animation: gcnSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
                     gcnShake 0.6s ease-in-out 0.4s both;
          pointer-events: none;
        }

        @keyframes gcnSlideIn {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(-30px) scale(0.8);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }

        @keyframes gcnShake {
          0%, 100% { transform: translateX(-50%) translateY(0) rotate(0deg); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-50%) translateY(0) rotate(-2deg); }
          20%, 40%, 60%, 80% { transform: translateX(-50%) translateY(0) rotate(2deg); }
        }

        .gcn-normal { 
          font-size: 1rem;
        }
        
        .gcn-big { 
          font-size: 1.1rem;
          animation: gcnSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
                     gcnShake 0.6s ease-in-out 0.4s both,
                     gcnPulse 0.8s ease-in-out infinite;
        }
        
        .gcn-huge { 
          font-size: 1.25rem;
          animation: gcnSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
                     gcnShake 0.6s ease-in-out 0.4s both,
                     gcnPulse 0.8s ease-in-out infinite;
          box-shadow: 
            0 10px 40px var(--color-shadow-primary-strong),
            0 0 100px var(--color-shadow-glow-medium),
            inset 0 1px 0 var(--color-shadow-inset);
        }
        
        .gcn-mega { 
          font-size: 1.4rem;
          animation: gcnSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
                     gcnShake 0.6s ease-in-out 0.4s both,
                     gcnPulseMega 0.6s ease-in-out infinite;
          box-shadow: 
            0 12px 48px var(--color-shadow-primary-stronger),
            0 0 120px var(--color-shadow-glow-strong),
            0 0 160px var(--color-gold),
            inset 0 1px 0 var(--color-shadow-inset-strong);
        }

        @keyframes gcnPulse {
          0%, 100% { 
            box-shadow: 
              0 10px 40px var(--color-shadow-primary-strong),
              0 0 100px var(--color-shadow-glow-medium),
              inset 0 1px 0 var(--color-shadow-inset);
          }
          50% { 
            box-shadow: 
              0 10px 40px var(--color-shadow-primary-strongest),
              0 0 120px var(--color-shadow-glow-stronger),
              inset 0 1px 0 var(--color-shadow-inset);
          }
        }

        @keyframes gcnPulseMega {
          0%, 100% { 
            box-shadow: 
              0 12px 48px var(--color-shadow-primary-stronger),
              0 0 120px var(--color-shadow-glow-strong),
              0 0 160px var(--color-gold),
              inset 0 1px 0 var(--color-shadow-inset-strong);
          }
          50% { 
            box-shadow: 
              0 14px 56px var(--color-shadow-primary-full),
              0 0 140px var(--color-shadow-glow-strongest),
              0 0 200px var(--color-gold-medium),
              inset 0 1px 0 var(--color-shadow-inset-strong);
          }
        }

        .gcn-fire {
          font-size: 2.5em;
          line-height: 1;
          animation: gcnFireSpin 0.5s ease-in-out;
          filter: drop-shadow(0 0 10px var(--color-fire-glow));
        }

        @keyframes gcnFireSpin {
          0% { transform: scale(0.5) rotate(-180deg); opacity: 0; }
          60% { transform: scale(1.2) rotate(10deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        .gcn-content {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }

        .gcn-username {
          font-size: 1em;
          font-weight: 700;
          color: var(--color-text-white);
          text-shadow: 0 2px 8px var(--color-text-shadow);
          line-height: 1.2;
        }

        .gcn-combo {
          font-size: 1.3em;
          font-weight: 900;
          color: var(--color-gold-solid);
          text-shadow: 
            0 0 10px var(--color-gold-glow),
            0 2px 8px var(--color-text-shadow),
            2px 2px 0 var(--color-text-shadow-dark);
          letter-spacing: 0.05em;
          line-height: 1;
        }

        @media (max-width: 640px) {
          .gcn {
            padding: 0.75rem 1rem;
            gap: 0.5rem;
          }
          
          .gcn-fire {
            font-size: 2em;
          }
          
          .gcn-normal { font-size: 0.9rem; }
          .gcn-big { font-size: 1rem; }
          .gcn-huge { font-size: 1.1rem; }
          .gcn-mega { font-size: 1.25rem; }
        }
      `}</style>
    </div>
  );
}
