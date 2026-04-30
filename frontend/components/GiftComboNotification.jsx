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
    if (!combo || !combo.username || !combo.comboCount || combo.comboCount < 2) {
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
          background: linear-gradient(135deg, rgba(255,64,129,0.95) 0%, rgba(244,63,94,0.95) 50%, rgba(239,68,68,0.95) 100%);
          border: 2px solid rgba(255,255,255,0.3);
          box-shadow: 
            0 8px 32px rgba(244,63,94,0.6),
            0 0 80px rgba(255,64,129,0.4),
            inset 0 1px 0 rgba(255,255,255,0.2);
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
            0 10px 40px rgba(244,63,94,0.7),
            0 0 100px rgba(255,64,129,0.5),
            inset 0 1px 0 rgba(255,255,255,0.2);
        }
        
        .gcn-mega { 
          font-size: 1.4rem;
          animation: gcnSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
                     gcnShake 0.6s ease-in-out 0.4s both,
                     gcnPulseMega 0.6s ease-in-out infinite;
          box-shadow: 
            0 12px 48px rgba(244,63,94,0.8),
            0 0 120px rgba(255,64,129,0.6),
            0 0 160px rgba(255,215,0,0.3),
            inset 0 1px 0 rgba(255,255,255,0.3);
        }

        @keyframes gcnPulse {
          0%, 100% { 
            box-shadow: 
              0 10px 40px rgba(244,63,94,0.7),
              0 0 100px rgba(255,64,129,0.5),
              inset 0 1px 0 rgba(255,255,255,0.2);
          }
          50% { 
            box-shadow: 
              0 10px 40px rgba(244,63,94,0.9),
              0 0 120px rgba(255,64,129,0.7),
              inset 0 1px 0 rgba(255,255,255,0.2);
          }
        }

        @keyframes gcnPulseMega {
          0%, 100% { 
            box-shadow: 
              0 12px 48px rgba(244,63,94,0.8),
              0 0 120px rgba(255,64,129,0.6),
              0 0 160px rgba(255,215,0,0.3),
              inset 0 1px 0 rgba(255,255,255,0.3);
          }
          50% { 
            box-shadow: 
              0 14px 56px rgba(244,63,94,1),
              0 0 140px rgba(255,64,129,0.8),
              0 0 200px rgba(255,215,0,0.5),
              inset 0 1px 0 rgba(255,255,255,0.3);
          }
        }

        .gcn-fire {
          font-size: 2.5em;
          line-height: 1;
          animation: gcnFireSpin 0.5s ease-in-out;
          filter: drop-shadow(0 0 10px rgba(255,165,0,0.8));
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
          color: #fff;
          text-shadow: 0 2px 8px rgba(0,0,0,0.5);
          line-height: 1.2;
        }

        .gcn-combo {
          font-size: 1.3em;
          font-weight: 900;
          color: #ffd700;
          text-shadow: 
            0 0 10px rgba(255,215,0,0.8),
            0 2px 8px rgba(0,0,0,0.5),
            2px 2px 0 rgba(0,0,0,0.3);
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
