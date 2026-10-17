"use client";

import { GIFT_ANIMATION_PREVIEWS } from "@/lib/giftAnimationsPreviewCatalog";

/**
 * MylWorldBeyondPlayer — reusable visual player for the "MYL World & Beyond"
 * animated gift concepts (Torre Eiffel mágica, Nave exploradora, Planeta
 * conectado).
 *
 * It only SELECTS and mounts one of the existing, already-reviewed preview
 * components under `components/gifts/previews/` by a stable `animationId`
 * (see `lib/giftAnimationsPreviewCatalog.js`) — it does not draw anything
 * itself, does not touch Coins/catalog/send logic, and makes zero network
 * calls on its own.
 *
 * This component is intentionally free of any commercial wiring: it has no
 * idea what a "price", a "balance" or a "/api/gifts/send" call is. Callers
 * decide when/why to mount it (e.g. a demo trigger), and the component just
 * plays the chosen animation once and calls `onComplete`.
 *
 * Props:
 *  - animationId: one of GIFT_ANIMATION_PREVIEWS[].id
 *    ("eiffel-tower" | "explorer-ship" | "connected-planet")
 *  - onComplete: callback fired once the animation cycle finishes
 */
export default function MylWorldBeyondPlayer({ animationId, onComplete }) {
  const item = GIFT_ANIMATION_PREVIEWS.find((candidate) => candidate.id === animationId);
  if (!item) return null;

  const Animation = item.Component;
  return <Animation onComplete={onComplete} />;
}
