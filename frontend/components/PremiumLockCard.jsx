"use client";

import Link from "next/link";

/**
 * PremiumLockCard
 * Renders a blurred/locked overlay over children indicating premium content.
 *
 * Props:
 *   label   – short label shown in lock badge (default "Solo para ti")
 *   cta     – call-to-action text   (default "💎 Desbloquea con monedas")
 *   href    – link destination      (default "/coins")
 *   compact – smaller layout for tight spaces
 *   children – content to blur behind the overlay (optional)
 */
export default function PremiumLockCard({
  label = "Solo para ti",
  cta = "💎 Desbloquea con monedas",
  href = "/coins",
  compact = false,
  children,
}) {
  return (
    <div className={`plc-wrap${compact ? " plc-compact" : ""}`}>
      {/* Blurred content layer */}
      {children && <div className="plc-blur-layer" aria-hidden="true">{children}</div>}

      {/* Lock overlay */}
      <div className="plc-overlay">
        <div className="plc-glow" aria-hidden="true" />
        <div className="plc-lock-icon">🔒</div>
        {label && <p className="plc-label">{label}</p>}
        <Link href={href} className="plc-unlock-btn">
          {cta}
        </Link>
      </div>

      <style jsx>{`
        .plc-wrap {
          position: relative;
          border-radius: var(--radius);
          overflow: hidden;
          min-height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .plc-compact { min-height: 100px; border-radius: var(--radius-sm); }

        .plc-blur-layer {
          position: absolute;
          inset: 0;
          filter: blur(10px) brightness(0.5);
          transform: scale(1.04);
          pointer-events: none;
          user-select: none;
        }

        .plc-overlay {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.55rem;
          padding: ${compact ? "0.9rem 1rem" : "1.5rem 1.25rem"};
          text-align: center;
          background: rgba(6,2,15,0.55);
          border-radius: var(--radius-sm);
          border: 1px solid rgba(224,64,251,0.3);
          backdrop-filter: blur(4px);
          box-shadow: 0 0 40px rgba(224,64,251,0.12);
          animation: plc-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
        }

        @keyframes plc-pop {
          from { transform: scale(0.9); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }

        .plc-glow {
          position: absolute;
          top: -50%;
          left: 50%;
          transform: translateX(-50%);
          width: 160px;
          height: 160px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(224,64,251,0.2) 0%, transparent 70%);
          pointer-events: none;
        }

        .plc-lock-icon {
          font-size: ${compact ? "1.4rem" : "2rem"};
          animation: plc-pulse 2s ease-in-out infinite;
        }

        @keyframes plc-pulse {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(224,64,251,0.4)); transform: scale(1); }
          50%       { filter: drop-shadow(0 0 14px rgba(224,64,251,0.7)); transform: scale(1.12); }
        }

        .plc-label {
          font-size: ${compact ? "0.72rem" : "0.8rem"};
          font-weight: 700;
          color: rgba(255,255,255,0.65);
          margin: 0;
        }

        .plc-unlock-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: ${compact ? "0.38rem 0.9rem" : "0.52rem 1.25rem"};
          border-radius: var(--radius-pill);
          background: var(--grad-primary);
          color: #fff;
          font-size: ${compact ? "0.75rem" : "0.82rem"};
          font-weight: 800;
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          animation: unlock-glow 2.5s ease-in-out infinite;
          white-space: nowrap;
        }

        @keyframes unlock-glow {
          0%, 100% { box-shadow: 0 4px 20px rgba(224,64,251,0.3); }
          50%       { box-shadow: 0 4px 35px rgba(224,64,251,0.6), 0 0 20px rgba(255,45,120,0.35); }
        }

        .plc-unlock-btn:hover {
          filter: brightness(1.12);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
