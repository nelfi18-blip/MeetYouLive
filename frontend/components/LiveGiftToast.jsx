"use client";

import { useState } from "react";
import { forwardRef, useImperativeHandle, useRef } from "react";

/**
 * LiveGiftToast
 *
 * Shows beautifully animated toast notifications for gift events in a live room.
 * Only displays gifts >= the given minCoins threshold (default 50).
 *
 * Usage:
 *   const toastRef = useRef();
 *   <LiveGiftToast ref={toastRef} minCoins={50} />
 *
 *   // trigger:
 *   toastRef.current?.push({ senderName, giftIcon, giftName, coinCost, rarity });
 */

const RARITY_STYLES = {
  common:   { 
    bg: "linear-gradient(135deg, rgba(30,20,60,0.96) 0%, rgba(20,15,45,0.96) 100%)",  
    accent: "#94a3b8", 
    border: "rgba(148,163,184,0.35)",
    shadow: "0 0 20px rgba(148,163,184,0.3), 0 4px 12px rgba(0,0,0,0.5)"
  },
  uncommon: { 
    bg: "linear-gradient(135deg, rgba(10,30,20,0.96) 0%, rgba(5,25,15,0.96) 100%)",  
    accent: "#4ade80", 
    border: "rgba(74,222,128,0.35)",
    shadow: "0 0 20px rgba(74,222,128,0.4), 0 4px 12px rgba(0,0,0,0.5)"
  },
  rare:     { 
    bg: "linear-gradient(135deg, rgba(10,20,45,0.96) 0%, rgba(5,15,35,0.96) 100%)",  
    accent: "#60a5fa", 
    border: "rgba(96,165,250,0.4)",
    shadow: "0 0 20px rgba(96,165,250,0.4), 0 4px 12px rgba(0,0,0,0.5)"
  },
  epic:     { 
    bg: "linear-gradient(135deg, rgba(30,10,55,0.96) 0%, rgba(20,5,40,0.96) 100%)",  
    accent: "#c084fc", 
    border: "rgba(192,132,252,0.45)",
    shadow: "0 0 20px rgba(192,132,252,0.5), 0 4px 12px rgba(0,0,0,0.5)"
  },
  legendary:{ 
    bg: "linear-gradient(135deg, rgba(40,25,5,0.97) 0%, rgba(30,20,0,0.97) 100%)",   
    accent: "#fbbf24", 
    border: "rgba(251,191,36,0.55)",
    shadow: "0 0 25px rgba(251,191,36,0.6), 0 0 40px rgba(251,191,36,0.4), 0 4px 12px rgba(0,0,0,0.5)"
  },
  mythic:   { 
    bg: "linear-gradient(135deg, rgba(40,5,15,0.97) 0%, rgba(30,0,10,0.97) 100%)",   
    accent: "#f43f5e", 
    border: "rgba(244,63,94,0.55)",
    shadow: "0 0 25px rgba(244,63,94,0.6), 0 0 40px rgba(244,63,94,0.4), 0 4px 12px rgba(0,0,0,0.5)"
  },
};

const TOAST_DURATION_MS = 5000; // Extended for better visibility
const MAX_VISIBLE = 3;

const LiveGiftToast = forwardRef(function LiveGiftToast({ minCoins = 50 }, ref) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  useImperativeHandle(ref, () => ({
    push({ senderName, giftIcon, giftName, coinCost, rarity, quantity }) {
      if (coinCost < minCoins) return;
      const id = `lgt_${++counterRef.current}_${Date.now()}`;
      setToasts((prev) => {
        const next = [...prev, { id, senderName, giftIcon, giftName, coinCost, rarity, quantity: quantity || 1 }];
        return next.slice(-MAX_VISIBLE);
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_DURATION_MS);
    },
  }));

  if (toasts.length === 0) return null;

  return (
    <div className="lgt-stack" aria-live="polite">
      {toasts.map((t) => {
        const rs = RARITY_STYLES[t.rarity] || RARITY_STYLES.common;
        return (
          <div
            key={t.id}
            className="lgt-toast"
            style={{
              background: rs.bg,
              borderColor: rs.border,
              boxShadow: rs.shadow,
            }}
          >
            {/* Shine effect overlay */}
            <div className="lgt-shine" />
            
            {/* Particles */}
            <div className="lgt-particles">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="lgt-particle"
                  style={{
                    animationDelay: `${i * 0.3}s`,
                    color: rs.accent
                  }}
                >
                  ✨
                </div>
              ))}
            </div>
            
            <span className="lgt-icon" style={{
              filter: `drop-shadow(0 0 8px ${rs.accent})`
            }}>{t.giftIcon || "🎁"}</span>
            
            <div className="lgt-body">
              <span className="lgt-sender" style={{ 
                color: rs.accent,
                textShadow: `0 0 10px ${rs.accent}`
              }}>{t.senderName || "Alguien"}</span>
              <span className="lgt-text">
                {" envió "}
                <strong>{t.giftName || "un regalo"}</strong>
                {t.quantity > 1 && <span className="lgt-qty"> x{t.quantity}</span>}
              </span>
            </div>
            
            <span className="lgt-coins" style={{ 
              color: rs.accent,
              textShadow: `0 0 10px ${rs.accent}`
            }}>
              🪙 {t.coinCost}
              {t.coinCost >= 500 ? " 🔥" : ""}
            </span>
            
            {/* Glow pulse effect */}
            <div className="lgt-glow" style={{
              background: `radial-gradient(circle, ${rs.accent}30 0%, transparent 70%)`
            }} />
          </div>
        );
      })}

      <style jsx>{`
        .lgt-stack {
          position: absolute;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20;
          display: flex;
          flex-direction: column-reverse;
          gap: 0.6rem;
          width: calc(100% - 2rem);
          max-width: 400px;
          pointer-events: none;
        }

        .lgt-toast {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.9rem 1.2rem;
          border-radius: 999px;
          border: 2px solid;
          backdrop-filter: blur(12px) saturate(150%);
          animation: toast-slide-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          overflow: hidden;
        }
        
        .lgt-shine {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            45deg,
            transparent 30%,
            rgba(255, 255, 255, 0.15) 50%,
            transparent 70%
          );
          animation: shine-pass 3s ease-in-out infinite;
          pointer-events: none;
        }
        
        .lgt-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          border-radius: 999px;
        }
        
        .lgt-particle {
          position: absolute;
          font-size: 1rem;
          animation: particle-float 2s ease-out infinite;
          opacity: 0;
        }
        
        .lgt-particle:nth-child(1) {
          left: 20%;
          top: 50%;
        }
        
        .lgt-particle:nth-child(2) {
          left: 50%;
          top: 50%;
        }
        
        .lgt-particle:nth-child(3) {
          left: 80%;
          top: 50%;
        }
        
        .lgt-glow {
          position: absolute;
          inset: -20px;
          border-radius: 999px;
          animation: pulse-glow 2s ease-in-out infinite;
          pointer-events: none;
          z-index: -1;
        }

        .lgt-icon {
          font-size: 2.2rem;
          line-height: 1;
          flex-shrink: 0;
          animation: icon-bounce 1.5s ease-in-out infinite;
          position: relative;
          z-index: 1;
        }

        .lgt-body {
          flex: 1;
          min-width: 0;
          font-size: 0.95rem;
          line-height: 1.4;
          position: relative;
          z-index: 1;
        }

        .lgt-sender {
          font-weight: 800;
          display: inline;
          animation: text-glow 2s ease-in-out infinite;
        }

        .lgt-text {
          color: rgba(255, 255, 255, 0.9);
          display: inline;
        }

        .lgt-text strong {
          color: #ffffff;
          font-weight: 700;
        }

        .lgt-qty {
          font-weight: 800;
          color: #fbbf24;
          filter: drop-shadow(0 0 6px #fbbf24);
        }

        .lgt-coins {
          font-size: 1.1rem;
          font-weight: 800;
          white-space: nowrap;
          flex-shrink: 0;
          animation: coin-pulse 1.5s ease-in-out infinite;
          position: relative;
          z-index: 1;
        }

        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @keyframes shine-pass {
          0% {
            transform: translateX(-100%) translateY(-100%) rotate(45deg);
          }
          100% {
            transform: translateX(100%) translateY(100%) rotate(45deg);
          }
        }
        
        @keyframes particle-float {
          0% {
            opacity: 0;
            transform: translateY(0) scale(0);
          }
          20% {
            opacity: 1;
            transform: translateY(-10px) scale(1);
          }
          80% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(-30px) scale(0.5) rotate(180deg);
          }
        }
        
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.1);
          }
        }
        
        @keyframes icon-bounce {
          0%, 100% {
            transform: scale(1) rotate(0deg);
          }
          50% {
            transform: scale(1.15) rotate(10deg);
          }
        }
        
        @keyframes text-glow {
          0%, 100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.3);
          }
        }
        
        @keyframes coin-pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  );
});

export default LiveGiftToast;
          gap: 0.6rem;
          padding: 0.6rem 0.85rem;
          border-radius: 999px;
          border: 1px solid transparent;
          backdrop-filter: blur(12px);
          animation: lgt-pop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) both,
                     lgt-fade ${TOAST_DURATION_MS}ms ease forwards;
          white-space: nowrap;
          overflow: hidden;
        }

        @keyframes lgt-pop {
          from { opacity: 0; transform: translateY(10px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes lgt-fade {
          0%  { opacity: 1; }
          75% { opacity: 1; }
          100%{ opacity: 0; }
        }

        .lgt-icon {
          font-size: 1.45rem;
          flex-shrink: 0;
          animation: lgt-icon-pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275) both;
        }

        @keyframes lgt-icon-pop {
          from { transform: scale(0.4) rotate(-15deg); }
          to   { transform: scale(1) rotate(0deg); }
        }

        .lgt-body {
          flex: 1;
          font-size: 0.82rem;
          font-weight: 600;
          color: rgba(255,255,255,0.9);
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }

        .lgt-sender {
          font-weight: 800;
        }

        .lgt-qty {
          font-size: 0.78rem;
          font-weight: 900;
          color: #e040fb;
          margin-left: 0.15rem;
        }

        .lgt-coins {
          font-size: 0.8rem;
          font-weight: 900;
          flex-shrink: 0;
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
});

export default LiveGiftToast;
