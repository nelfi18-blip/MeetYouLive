"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const CONFIGS = {
  low_coins: {
    icon: "🪙",
    title: "Monedas bajas",
    subtext: "Recarga para seguir apoyando al creador",
    cta: "Comprar monedas",
    accentColor: "#fbbf24",
    borderColor: "rgba(251,191,36,0.45)",
    glowColor: "rgba(251,191,36,0.25)",
    bgGradient: "linear-gradient(135deg, rgba(40,25,5,0.97) 0%, rgba(30,20,5,0.97) 100%)",
  },
  lost_top_fan: {
    icon: "⚠️",
    title: "¡Perdiste el Top Fan!",
    subtext: "Envía más regalos para recuperar tu posición",
    cta: "Comprar monedas",
    accentColor: "#f59e0b",
    borderColor: "rgba(245,158,11,0.5)",
    glowColor: "rgba(245,158,11,0.3)",
    bgGradient: "linear-gradient(135deg, rgba(40,20,0,0.97) 0%, rgba(30,15,0,0.97) 100%)",
  },
  goal_urgent: {
    icon: "⏳",
    title: "¡Últimos 30 segundos!",
    subtext: "El boost termina pronto — apoya ahora",
    cta: "Comprar monedas",
    accentColor: "#ef4444",
    borderColor: "rgba(239,68,68,0.5)",
    glowColor: "rgba(239,68,68,0.3)",
    bgGradient: "linear-gradient(135deg, rgba(40,5,5,0.97) 0%, rgba(30,5,5,0.97) 100%)",
  },
};

const AUTO_DISMISS_MS = 8000;

/**
 * PaywallModal
 *
 * Non-blocking, slide-up purchase prompt shown in the live room when:
 *   - coins drop below 50
 *   - the current viewer loses their Top Fan position
 *   - the last_boost event has ≤ 30 s remaining
 *
 * Props:
 *   reason   — 'low_coins' | 'lost_top_fan' | 'goal_urgent'
 *   onClose  — () => void
 */
export default function PaywallModal({ reason, onClose }) {
  const [visible, setVisible] = useState(false);
  // Keep onClose in a ref so callbacks always call the latest version
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => onCloseRef.current?.(), 350); // wait for slide-out animation
  }, []);

  // Animate in on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-dismiss after AUTO_DISMISS_MS
  useEffect(() => {
    const timer = setTimeout(handleClose, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [handleClose]);

  const cfg = CONFIGS[reason] || CONFIGS.low_coins;

  return (
    <>
      <div
        className={`pwm-wrap${visible ? " pwm-in" : " pwm-out"}`}
        role="dialog"
        aria-modal="false"
        aria-label={cfg.title}
        style={{
          background: cfg.bgGradient,
          borderColor: cfg.borderColor,
          boxShadow: `0 -4px 32px ${cfg.glowColor}, 0 0 0 1px ${cfg.borderColor}`,
        }}
      >
        <button
          className="pwm-close"
          onClick={handleClose}
          aria-label="Cerrar"
          style={{ color: cfg.accentColor }}
        >
          ✕
        </button>

        <div className="pwm-body">
          <span className="pwm-icon">{cfg.icon}</span>
          <div className="pwm-text-wrap">
            <span className="pwm-title" style={{ color: cfg.accentColor }}>
              {cfg.title}
            </span>
            <span className="pwm-subtext">{cfg.subtext}</span>
          </div>
        </div>

        <Link
          href="/coins"
          className="pwm-cta"
          onClick={handleClose}
          style={{
            background: `linear-gradient(135deg, ${cfg.accentColor}cc, ${cfg.accentColor}99)`,
            borderColor: cfg.accentColor,
            color: "#000",
          }}
        >
          🪙 {cfg.cta}
        </Link>
      </div>

      <style jsx>{`
        .pwm-wrap {
          position: fixed;
          bottom: 70px;
          left: 50%;
          transform: translateX(-50%) translateY(120%);
          z-index: 65;
          width: calc(100% - 2rem);
          max-width: 420px;
          border: 1px solid transparent;
          border-radius: 16px;
          padding: 0.85rem 0.9rem 0.9rem;
          backdrop-filter: blur(18px);
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
                      opacity 0.35s ease;
          opacity: 0;
          will-change: transform, opacity;
          pointer-events: all;
        }

        .pwm-in {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }

        .pwm-out {
          transform: translateX(-50%) translateY(110%);
          opacity: 0;
          transition: transform 0.3s ease-in, opacity 0.3s ease-in;
        }

        .pwm-close {
          position: absolute;
          top: 0.55rem;
          right: 0.65rem;
          background: none;
          border: none;
          font-size: 0.85rem;
          font-weight: 900;
          cursor: pointer;
          opacity: 0.7;
          padding: 0.2rem 0.4rem;
          border-radius: 6px;
          transition: opacity 0.15s;
        }
        .pwm-close:hover { opacity: 1; }

        .pwm-body {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding-right: 1.5rem;
        }

        .pwm-icon {
          font-size: 1.6rem;
          flex-shrink: 0;
          animation: pwmIconBounce 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }

        @keyframes pwmIconBounce {
          from { transform: scale(0.4) rotate(-15deg); }
          to   { transform: scale(1) rotate(0deg); }
        }

        .pwm-text-wrap {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }

        .pwm-title {
          font-size: 0.9rem;
          font-weight: 900;
          line-height: 1.2;
          letter-spacing: 0.01em;
        }

        .pwm-subtext {
          font-size: 0.76rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.3;
        }

        .pwm-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.65rem 1.25rem;
          border-radius: 999px;
          border: 1px solid transparent;
          font-size: 0.9rem;
          font-weight: 900;
          text-decoration: none;
          letter-spacing: 0.02em;
          transition: filter 0.2s, transform 0.15s;
          cursor: pointer;
        }
        .pwm-cta:hover {
          filter: brightness(1.12);
          transform: scale(1.02);
        }
        .pwm-cta:active {
          transform: scale(0.97);
        }

        @media (max-width: 480px) {
          .pwm-wrap {
            bottom: 60px;
            border-radius: 14px;
          }
          .pwm-title { font-size: 0.84rem; }
          .pwm-subtext { font-size: 0.72rem; }
          .pwm-cta { font-size: 0.86rem; padding: 0.58rem 1rem; }
        }
      `}</style>
    </>
  );
}

