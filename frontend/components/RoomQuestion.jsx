"use client";

import { useState, useEffect, useCallback } from "react";

const NEXT_CLIENT_COOLDOWN_MS = 8000; // mirrors backend/src/lib/socialRoomIcebreaker.js

/**
 * RoomQuestion — ambient "pregunta de la sala" / icebreaker activity for
 * Social Rooms.
 *
 * This is NOT a second chat, NOT SimulationPanel, and tracks no
 * answers/votes/comments of its own: it only displays the single question
 * currently active for the room (identical for every participant, driven by
 * the backend's `social_room:icebreaker` event) and an optional button to
 * request a new one. Participants keep discussing the question via the
 * existing room chat.
 *
 * All real-time state (which question is active) lives in the parent page,
 * which owns the socket connection — this component is purely presentational
 * so it stays easy to test and never duplicates socket wiring.
 */
export default function RoomQuestion({
  questionText,
  canRequestNext = false,
  onNext,
  reducedMotion = false,
  labels = {},
}) {
  const [onCooldown, setOnCooldown] = useState(false);

  // Reset the local (optimistic) cooldown whenever the question actually
  // changes — e.g. another participant requested a new one.
  useEffect(() => {
    setOnCooldown(false);
  }, [questionText]);

  const handleNext = useCallback(() => {
    if (onCooldown) return;
    setOnCooldown(true);
    // The backend is authoritative on the real cooldown/rotation — this is
    // only a lightweight client-side guard against accidental double-taps.
    setTimeout(() => setOnCooldown(false), NEXT_CLIENT_COOLDOWN_MS);
    onNext?.();
  }, [onCooldown, onNext]);

  if (!questionText) return null;

  return (
    <div className="room-question" aria-label={labels.ariaLabel} role="group">
      <div className="room-question-top">
        <span className="room-question-badge">🧊 {labels.label}</span>
      </div>
      <p className={`room-question-text${reducedMotion ? "" : " room-question-animated"}`}>
        {questionText}
      </p>
      {canRequestNext && (
        <button
          type="button"
          className="room-question-next"
          onClick={handleNext}
          disabled={onCooldown}
          title={labels.next}
        >
          🔄 {labels.next}
        </button>
      )}

      <style jsx>{`
        .room-question {
          display: flex; flex-direction: column; gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-xs, 8px);
          background: linear-gradient(135deg, rgba(244,114,182,0.08) 0%, rgba(168,85,247,0.08) 100%);
          border: 1px solid rgba(244,114,182,0.18);
        }
        .room-question-top {
          display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
        }
        .room-question-badge {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em;
          text-transform: uppercase; color: #f472b6;
        }
        .room-question-text {
          font-size: 0.9rem; font-weight: 600; color: var(--text); margin: 0;
          line-height: 1.35;
        }
        .room-question-animated {
          animation: roomQuestionFadeIn 0.3s ease;
        }
        @keyframes roomQuestionFadeIn {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .room-question-next {
          align-self: flex-start;
          display: inline-flex; align-items: center; gap: 0.3rem;
          font-size: 0.72rem; font-weight: 700; color: var(--text);
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px; padding: 0.35rem 0.75rem;
          cursor: pointer; transition: all 0.18s;
        }
        .room-question-next:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
        .room-question-next:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
