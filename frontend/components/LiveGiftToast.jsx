"use client";

import { useState } from "react";
import { forwardRef, useImperativeHandle, useRef } from "react";

/**
 * LiveGiftToast
 *
 * Shows animated toast notifications for gift events in a live room.
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
  common:   { bg: "rgba(30,20,60,0.96)",  accent: "#94a3b8", border: "rgba(148,163,184,0.35)" },
  uncommon: { bg: "rgba(10,30,20,0.96)",  accent: "#4ade80", border: "rgba(74,222,128,0.35)" },
  rare:     { bg: "rgba(10,20,45,0.96)",  accent: "#60a5fa", border: "rgba(96,165,250,0.4)"  },
  epic:     { bg: "rgba(30,10,55,0.96)",  accent: "#c084fc", border: "rgba(192,132,252,0.45)" },
  legendary:{ bg: "rgba(40,25,5,0.97)",   accent: "#fbbf24", border: "rgba(251,191,36,0.55)" },
  mythic:   { bg: "rgba(40,5,15,0.97)",   accent: "#f43f5e", border: "rgba(244,63,94,0.55)"  },
};

const TOAST_DURATION_MS = 4000;
const MAX_VISIBLE = 3;

const LiveGiftToast = forwardRef(function LiveGiftToast({ minCoins = 50 }, ref) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  useImperativeHandle(ref, () => ({
    push({ senderName, giftIcon, giftName, coinCost, rarity }) {
      if (coinCost < minCoins) return;
      const id = `lgt_${++counterRef.current}_${Date.now()}`;
      setToasts((prev) => {
        const next = [...prev, { id, senderName, giftIcon, giftName, coinCost, rarity }];
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
              boxShadow: `0 0 18px ${rs.border}, 0 4px 12px rgba(0,0,0,0.5)`,
            }}
          >
            <span className="lgt-icon">{t.giftIcon || "🎁"}</span>
            <div className="lgt-body">
              <span className="lgt-sender" style={{ color: rs.accent }}>{t.senderName || "Alguien"}</span>
              <span className="lgt-text">
                {" envió "}
                <strong>{t.giftName || "un regalo"}</strong>
              </span>
            </div>
            <span className="lgt-coins" style={{ color: rs.accent }}>
              🪙 {t.coinCost}
              {t.coinCost >= 500 ? " 🔥" : ""}
            </span>
          </div>
        );
      })}

      <style jsx>{`
        .lgt-stack {
          position: absolute;
          bottom: 70px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20;
          display: flex;
          flex-direction: column-reverse;
          gap: 0.4rem;
          width: calc(100% - 2rem);
          max-width: 380px;
          pointer-events: none;
        }

        .lgt-toast {
          display: flex;
          align-items: center;
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
