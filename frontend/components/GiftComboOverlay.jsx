"use client";

import { useEffect, useRef, useState } from "react";

const COMBO_WINDOW_MS = 4000; // track gifts within 4 seconds for combos
const COMBO_MIN = 2;          // minimum consecutive gifts to show combo

export default function GiftComboOverlay({ recentGifts }) {
  const [combo, setCombo] = useState(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    if (!Array.isArray(recentGifts) || recentGifts.length < COMBO_MIN) {
      return;
    }

    const now = Date.now();
    const windowGifts = recentGifts.filter((g) => g.timestamp && now - g.timestamp < COMBO_WINDOW_MS);

    if (windowGifts.length < COMBO_MIN) return;

    // Check for streak: same gift icon sent consecutively
    const latestIcon = windowGifts[windowGifts.length - 1]?.gift?.icon;
    const streakCount = windowGifts.filter((g) => g.gift?.icon === latestIcon).length;

    const count = windowGifts.length;

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    setCombo({ count, streakCount, streakIcon: latestIcon, isStreak: streakCount >= COMBO_MIN && streakCount === count });

    hideTimerRef.current = setTimeout(() => setCombo(null), 3000);
  }, [recentGifts]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!combo || combo.count < COMBO_MIN) return null;

  const { count, isStreak, streakIcon } = combo;

  const intensityClass =
    count >= 10 ? "gco-xl" :
    count >= 7  ? "gco-lg" :
    count >= 5  ? "gco-md" :
    "gco-sm";

  return (
    <div className={`gco ${intensityClass}`}>
      {isStreak ? (
        <>
          <span className="gco-streak-icon">{streakIcon || "🎁"}</span>
          <div className="gco-text">
            <span className="gco-combo-num">x{count}</span>
            <span className="gco-streak-label">🔥 Racha de regalos</span>
          </div>
        </>
      ) : (
        <div className="gco-text">
          <span className="gco-combo-num">x{count}</span>
          <span className="gco-combo-label">combo</span>
        </div>
      )}

      <style jsx>{`
        .gco {
          position: absolute;
          bottom: 22%;
          right: 12px;
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 0.75rem;
          border-radius: 999px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(224,64,251,0.4);
          background: rgba(12,6,28,0.78);
          box-shadow: 0 0 18px rgba(224,64,251,0.3);
          animation: gcoIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
          pointer-events: none;
        }

        @keyframes gcoIn {
          0%   { opacity: 0; transform: scale(0.7) translateX(10px); }
          100% { opacity: 1; transform: scale(1) translateX(0); }
        }

        .gco-sm  { --accent: #c084fc; --glow: rgba(192,132,252,0.4); }
        .gco-md  { --accent: #e040fb; --glow: rgba(224,64,251,0.5); }
        .gco-lg  { --accent: #f59e0b; --glow: rgba(245,158,11,0.5); }
        .gco-xl  { --accent: #f43f5e; --glow: rgba(244,63,94,0.55); }

        .gco-sm  { border-color: rgba(192,132,252,0.4); box-shadow: 0 0 14px rgba(192,132,252,0.3); }
        .gco-md  { border-color: rgba(224,64,251,0.45); box-shadow: 0 0 18px rgba(224,64,251,0.35); }
        .gco-lg  { border-color: rgba(245,158,11,0.5);  box-shadow: 0 0 22px rgba(245,158,11,0.4);  }
        .gco-xl  { border-color: rgba(244,63,94,0.55);  box-shadow: 0 0 26px rgba(244,63,94,0.45);  animation: gcoIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both, gcoPulse 0.5s ease-in-out infinite alternate; }

        @keyframes gcoPulse {
          from { box-shadow: 0 0 20px rgba(244,63,94,0.4); }
          to   { box-shadow: 0 0 36px rgba(244,63,94,0.65); }
        }

        .gco-streak-icon { font-size: 1.4rem; animation: gcoIconSpin 0.4s ease both; }
        @keyframes gcoIconSpin {
          0%   { transform: scale(0.5) rotate(-15deg); }
          100% { transform: scale(1) rotate(0deg); }
        }

        .gco-text {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
        }

        .gco-combo-num {
          font-size: 1.3rem;
          font-weight: 900;
          color: var(--accent, #c084fc);
          line-height: 1;
          text-shadow: 0 0 12px var(--glow, rgba(192,132,252,0.5));
          font-variant-numeric: tabular-nums;
        }

        .gco-combo-label {
          font-size: 0.62rem;
          font-weight: 800;
          color: rgba(255,255,255,0.7);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          line-height: 1;
        }

        .gco-streak-label {
          font-size: 0.65rem;
          font-weight: 800;
          color: var(--accent, #e040fb);
          letter-spacing: 0.04em;
          line-height: 1;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
