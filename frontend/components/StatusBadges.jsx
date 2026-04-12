"use client";

import { useState } from "react";

/**
 * StatusBadges – renders a row of status/popularity badges for a user profile.
 *
 * Props:
 *  - badges   : StatusBadge[]  – from computeStatusBadges()
 *  - compact  : boolean        – smaller size, no label text (icon only)
 *  - className: string         – extra class names for the wrapper
 *  - style    : object         – extra inline styles for the wrapper
 *
 * Each badge supports a tooltip (title attribute + hover tooltip).
 */
export default function StatusBadges({ badges = [], compact = false, className = "", style = {} }) {
  if (!badges || badges.length === 0) return null;

  return (
    <>
      <div className={`sb-row${className ? ` ${className}` : ""}`} style={style} aria-label="Status badges">
        {badges.map((badge) => (
          <StatusBadge key={badge.id} badge={badge} compact={compact} />
        ))}
      </div>
      <style jsx>{`
        .sb-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
          align-items: center;
        }
      `}</style>
    </>
  );
}

function StatusBadge({ badge, compact }) {
  const [tipVisible, setTipVisible] = useState(false);

  return (
    <>
      <span
        className={`sb sb-${badge.variant}${compact ? " sb-compact" : ""}`}
        title={badge.tooltip}
        onMouseEnter={() => setTipVisible(true)}
        onMouseLeave={() => setTipVisible(false)}
        onFocus={() => setTipVisible(true)}
        onBlur={() => setTipVisible(false)}
        tabIndex={0}
        role="status"
        aria-label={`${badge.label}: ${badge.tooltip}`}
      >
        <span className="sb-emoji" aria-hidden="true">{badge.emoji}</span>
        {!compact && <span className="sb-label">{badge.label}</span>}

        {/* Floating tooltip */}
        {tipVisible && badge.tooltip && (
          <span className="sb-tip" role="tooltip">
            {badge.tooltip}
          </span>
        )}
      </span>
      <style jsx>{`
        .sb {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.6rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          padding: 0.22rem 0.55rem;
          border-radius: 999px;
          white-space: nowrap;
          cursor: default;
          outline: none;
          transition: filter 0.18s, transform 0.18s;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
        .sb:focus-visible {
          outline: 2px solid rgba(255,255,255,0.4);
          outline-offset: 2px;
        }
        .sb:hover, .sb:focus {
          filter: brightness(1.15);
          transform: scale(1.04);
        }
        .sb-compact {
          padding: 0.2rem 0.4rem;
          font-size: 0.65rem;
        }

        /* ── boost 🔥 ──────────────────────────────────────── */
        .sb-boost {
          background: linear-gradient(135deg, rgba(255,90,0,0.18), rgba(255,45,120,0.18));
          border: 1px solid rgba(255,80,0,0.45);
          color: #ff8c42;
          box-shadow:
            0 0 8px rgba(255,80,0,0.2),
            inset 0 1px 0 rgba(255,255,255,0.06);
          animation: sb-boost-glow 2.4s ease-in-out infinite;
        }
        @keyframes sb-boost-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(255,80,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06); }
          50%       { box-shadow: 0 0 14px rgba(255,80,0,0.45), 0 0 28px rgba(255,45,120,0.15), inset 0 1px 0 rgba(255,255,255,0.08); }
        }

        /* ── trending ⭐ ────────────────────────────────────── */
        .sb-trending {
          background: linear-gradient(135deg, rgba(251,191,36,0.16), rgba(224,64,251,0.16));
          border: 1px solid rgba(251,191,36,0.45);
          color: #fbbf24;
          box-shadow:
            0 0 8px rgba(251,191,36,0.18),
            inset 0 1px 0 rgba(255,255,255,0.06);
          animation: sb-trend-glow 2s ease-in-out infinite;
        }
        @keyframes sb-trend-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(251,191,36,0.18), inset 0 1px 0 rgba(255,255,255,0.06); }
          50%       { box-shadow: 0 0 16px rgba(251,191,36,0.45), 0 0 30px rgba(224,64,251,0.12), inset 0 1px 0 rgba(255,255,255,0.08); }
        }

        /* ── popular 👑 ─────────────────────────────────────── */
        .sb-popular {
          background: linear-gradient(135deg, rgba(139,92,246,0.18), rgba(224,64,251,0.18));
          border: 1px solid rgba(139,92,246,0.45);
          color: #c084fc;
          box-shadow:
            0 0 8px rgba(139,92,246,0.18),
            inset 0 1px 0 rgba(255,255,255,0.06);
        }

        /* ── topSupport 💎 ──────────────────────────────────── */
        .sb-topSupport {
          background: linear-gradient(135deg, rgba(99,202,255,0.15), rgba(139,92,246,0.15));
          border: 1px solid rgba(99,202,255,0.4);
          color: #7dd3fc;
          box-shadow:
            0 0 8px rgba(99,202,255,0.15),
            inset 0 1px 0 rgba(255,255,255,0.06);
        }

        /* ── label ──────────────────────────────────────────── */
        .sb-emoji { font-size: 0.72rem; line-height: 1; }
        .sb-label {
          font-size: 0.58rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        /* ── tooltip ────────────────────────────────────────── */
        .sb-tip {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          background: rgba(14, 6, 32, 0.96);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.82);
          font-size: 0.68rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          padding: 0.35rem 0.75rem;
          border-radius: 8px;
          pointer-events: none;
          z-index: 50;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          animation: sb-tip-in 0.15s ease both;
          max-width: 200px;
          white-space: normal;
          text-align: center;
          text-transform: none;
          letter-spacing: 0;
          font-weight: 400;
        }
        .sb-tip::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-top-color: rgba(14, 6, 32, 0.96);
        }
        @keyframes sb-tip-in {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  );
}
