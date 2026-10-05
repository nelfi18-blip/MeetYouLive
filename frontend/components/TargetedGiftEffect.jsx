"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  GIFT_FLIGHT_TIERS,
  resolveGiftFlightTier,
  computeGiftComboBoost,
  computeGiftFlightGeometry,
} from "@/lib/multiGuestPresentation";

/**
 * TargetedGiftEffect — the missing "Gift -> trajectory -> Creator" visual
 * piece: a short, presentational flight from the Gift UI toward the
 * recipient's real video tile (resolved via `targetParticipantId`, the same
 * #986 `receiverId` already driving MultiVideoGrid's `highlightedRecipientId`
 * halo), followed by a brief impact burst on arrival.
 *
 * Does NOT duplicate GiftAnimation/SuperGiftAnimation/GiftEffect — those
 * keep rendering exactly as before. This is a small, additive layer that
 * only answers "which camera received this Gift" with motion instead of a
 * static border.
 *
 * Position is read ONCE per Gift (via `Element.getBoundingClientRect()` on
 * mount — this component is remounted per Gift via a changing `key`, never
 * polled). If the recipient's tile isn't currently rendered, it falls back
 * to the stage center — the effect never fails to render.
 *
 * Mobile-first, transform/opacity only, no Canvas/WebGL/physics/rAF loop.
 */
export default function TargetedGiftEffect({
  gift,
  senderName,
  recipientName,
  quantity = 1,
  stageRef,
  targetParticipantId = null,
}) {
  const { t } = useLanguage();
  const [geometry, setGeometry] = useState(null);

  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // Read the stage + recipient tile geometry exactly once (on mount — this
  // component is remounted per Gift event via a changing `key` upstream).
  useLayoutEffect(() => {
    const container = stageRef?.current;
    if (!container) {
      setGeometry({ originX: 0, originY: 0, destX: 0, destY: 0, usedFallback: true });
      return;
    }
    const containerRect = container.getBoundingClientRect();
    let targetRect = null;
    if (targetParticipantId) {
      const escaped =
        typeof CSS !== "undefined" && CSS.escape
          ? CSS.escape(String(targetParticipantId))
          : String(targetParticipantId).replace(/[^a-zA-Z0-9_-]/g, "");
      const tile = container.querySelector(`[data-participant-id="${escaped}"]`);
      if (tile) targetRect = tile.getBoundingClientRect();
    }
    setGeometry(
      computeGiftFlightGeometry(
        { width: containerRect.width, height: containerRect.height },
        targetRect,
        { left: containerRect.left, top: containerRect.top }
      )
    );
    // Intentionally run only on mount — a new Gift remounts this component
    // (changing `key`), which is the "recalculate per event" contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!gift || !geometry) return null;

  const rarity = resolveGiftFlightTier(gift.rarity, gift.isSuper);
  const tier = GIFT_FLIGHT_TIERS[rarity];
  const comboBoost = computeGiftComboBoost(quantity);
  const scale = Math.min(tier.scale * comboBoost, 2.2);
  const { originX, originY, destX, destY } = geometry;
  const dx = destX - originX;
  const dy = destY - originY;
  const showCaption = tier.caption && (senderName || recipientName);
  const captionText = showCaption
    ? t("giftFlight.sentTo")
        .replace("{sender}", senderName || t("gifts.someone"))
        .replace("{recipient}", recipientName || t("gifts.someone"))
    : null;

  const pathVars = {
    "--tge-ox": `${originX}px`,
    "--tge-oy": `${originY}px`,
    "--tge-dx": `${dx}px`,
    "--tge-dy": `${dy}px`,
    "--tge-curve": `${-tier.curve}px`,
    "--tge-scale": scale,
    "--tge-duration": `${tier.duration}ms`,
  };

  const trailCount = prefersReducedMotion ? 0 : tier.trail;
  const impactCount = prefersReducedMotion ? Math.min(tier.impact, 3) : tier.impact;

  return (
    <div className={`tge-root${prefersReducedMotion ? " tge-reduced" : ""}`} style={pathVars} aria-hidden="true">
      {Array.from({ length: trailCount }, (_, i) => (
        <span key={`trail-${i}`} className="tge-trail" style={{ animationDelay: `${i * 55}ms` }} />
      ))}

      <span className="tge-main">{gift.icon || "🎁"}</span>

      {Array.from({ length: impactCount }, (_, i) => (
        <span
          key={`impact-${i}`}
          className="tge-impact-particle"
          style={{
            "--p-angle": `${(360 / Math.max(impactCount, 1)) * i}deg`,
            animationDelay: `${tier.duration * 0.82}ms`,
          }}
        />
      ))}

      {captionText && <span className="tge-caption" style={{ animationDelay: `${tier.duration * 0.7}ms` }}>{captionText}</span>}

      <style jsx>{`
        .tge-root {
          position: absolute;
          inset: 0;
          z-index: 7;
          pointer-events: none;
          overflow: visible;
        }

        .tge-main {
          position: absolute;
          left: var(--tge-ox);
          top: var(--tge-oy);
          font-size: 1.6rem;
          transform: translate(-50%, -50%) scale(0.5);
          opacity: 0;
          filter: drop-shadow(0 0 10px rgba(217, 70, 239, 0.65));
          animation: tge-fly var(--tge-duration) cubic-bezier(0.32, 0.64, 0.3, 1) forwards;
          will-change: transform, opacity;
        }

        @keyframes tge-fly {
          0% {
            transform: translate(-50%, -50%) translate(0, 0) scale(0.5);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          55% {
            transform: translate(-50%, -50%)
              translate(calc(var(--tge-dx) * 0.55), calc(var(--tge-dy) * 0.55 + var(--tge-curve)))
              scale(var(--tge-scale));
            opacity: 1;
          }
          88% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) translate(var(--tge-dx), var(--tge-dy)) scale(calc(var(--tge-scale) * 0.7));
            opacity: 0;
          }
        }

        .tge-trail {
          position: absolute;
          left: var(--tge-ox);
          top: var(--tge-oy);
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(217, 70, 239, 0.9) 0%, rgba(139, 92, 246, 0.2) 70%, transparent 100%);
          transform: translate(-50%, -50%) scale(0.4);
          opacity: 0;
          animation: tge-fly calc(var(--tge-duration) * 0.85) cubic-bezier(0.32, 0.64, 0.3, 1) forwards;
          will-change: transform, opacity;
        }

        .tge-impact-particle {
          position: absolute;
          left: var(--tge-ox);
          top: var(--tge-oy);
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #d946ef;
          box-shadow: 0 0 8px rgba(217, 70, 239, 0.8);
          opacity: 0;
          transform: translate(calc(var(--tge-dx) - 50%), calc(var(--tge-dy) - 50%));
          animation: tge-impact-burst 480ms ease-out forwards;
          will-change: transform, opacity;
        }

        @keyframes tge-impact-burst {
          0% {
            opacity: 0.95;
            transform: translate(calc(var(--tge-dx) - 50%), calc(var(--tge-dy) - 50%)) rotate(var(--p-angle)) translateX(0)
              scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(calc(var(--tge-dx) - 50%), calc(var(--tge-dy) - 50%)) rotate(var(--p-angle)) translateX(26px)
              scale(0.3);
          }
        }

        .tge-caption {
          position: absolute;
          /* Positioned at the destination point (origin + delta), nudged up
             a bit so it never sits directly over the recipient's face. */
          left: calc(var(--tge-ox) + var(--tge-dx));
          top: calc(var(--tge-oy) + var(--tge-dy) - 34px);
          transform: translate(-50%, -50%);
          max-width: 220px;
          padding: 0.3rem 0.65rem;
          border-radius: 999px;
          background: rgba(10, 6, 24, 0.75);
          border: 1px solid rgba(217, 70, 239, 0.45);
          backdrop-filter: blur(6px);
          color: #fff;
          font-size: 0.72rem;
          font-weight: 600;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          opacity: 0;
          animation: tge-caption-fade 900ms ease-out forwards;
        }

        @keyframes tge-caption-fade {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(6px);
          }
          20% {
            opacity: 1;
            transform: translate(-50%, -50%) translateY(0);
          }
          80% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(-6px);
          }
        }

        /* Reduced motion: no trajectory, no trail, minimal impact — just a
           brief, simple fade/scale feedback at the destination point. */
        @media (prefers-reduced-motion: reduce) {
          .tge-main {
            animation: tge-fade-only 420ms ease-out forwards;
            left: calc(var(--tge-ox) + var(--tge-dx));
            top: calc(var(--tge-oy) + var(--tge-dy));
          }

          .tge-impact-particle {
            animation-duration: 280ms;
          }
        }

        @keyframes tge-fade-only {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.7);
          }
          40% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9);
          }
        }
      `}</style>
    </div>
  );
}
