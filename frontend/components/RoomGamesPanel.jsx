"use client";

import { useEffect, useState } from "react";
import { getSocialGameContent, SOCIAL_GAME_TEXT } from "@/lib/socialRoomGamesContent";

const GAME_ICONS = { would_you_rather: "💞", emoji_guess: "🧩", connection_mission: "🤝", story_circle: "📖" };

/**
 * One server-owned game for all real members of the same Social Room.
 * Vote totals are actual distinct authenticated accounts, never fabricated.
 * The panel does not touch Live, payments, existing room chat or moderation.
 */
export default function RoomGamesPanel({ game, lang = "es", canPlay = false, onAction, onOpenChat }) {
  const copy = SOCIAL_GAME_TEXT[lang] || SOCIAL_GAME_TEXT.es;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [votedForRound, setVotedForRound] = useState(null);
  const roundKey = game ? `${game.type}:${game.roundIndex}:${game.startedAt}` : "";
  useEffect(() => {
    setVotedForRound(null);
    setError("");
  }, [roundKey]);

  const act = async (action, extras = {}) => {
    if (busy || !canPlay || typeof onAction !== "function") return;
    setBusy(true);
    setError("");
    try {
      const result = await onAction(action, extras);
      if (!result?.ok) {
        setError(result?.reason === "cooldown" ? copy.wait : result?.message || copy.error);
      } else if (action === "vote") {
        setVotedForRound(roundKey);
      }
    } catch (_) {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  };

  const question = game ? getSocialGameContent(lang, game.type, game.roundIndex) : null;
  const counts = Array.isArray(game?.votes) && game.votes.length === question?.options.length
    ? game.votes : question?.options.map(() => 0) || [];
  const totalVotes = Number.isSafeInteger(game?.totalVotes) ? game.totalVotes : 0;

  return (
    <section className="social-games" aria-label={copy.title}>
      <div className="game-heading">
        <span aria-hidden="true">🎮</span>
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      <div className="game-switch">
        {["would_you_rather", "emoji_guess", "connection_mission", "story_circle"].map((type) => (
          <button
            key={type}
            type="button"
            className={`game-type ${game?.type === type ? "selected" : ""}`}
            aria-pressed={game?.type === type}
            disabled={!canPlay || busy || game?.type === type}
            onClick={() => act("start", { type })}
          >
            {GAME_ICONS[type]} {copy[type]}
          </button>
        ))}
      </div>

      {!game && <p className="game-hint">{canPlay ? copy.noGame : copy.join}</p>}
      {game && question && (
        <div className="game-round">
          <div className="game-details">
            <span>{copy.round} {game.roundIndex + 1}</span>
            <span>{copy.votes}: {totalVotes}</span>
          </div>
          <h3 className={game.type === "emoji_guess" ? "emoji-clue" : ""}>{question.question}</h3>
          <div className="game-options">
            {question.options.map((option, index) => {
              const isCorrect = game.phase === "results" && game.correctOption === index;
              const isSelected = votedForRound === roundKey;
              return (
                <button
                  key={index}
                  className={`game-option ${isCorrect ? "correct" : ""}`}
                  type="button"
                  disabled={!canPlay || busy || game.phase !== "voting" || isSelected}
                  onClick={() => act("vote", { option: index })}
                >
                  <span>{option}</span>
                  {game.phase === "results" && (
                    <span className="game-count">
                      {counts[index] || 0} {isCorrect ? "✓" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {game.phase === "voting" && votedForRound === roundKey && (
            <p className="game-confirmation" role="status">✓ {copy.voted}</p>
          )}
          {game.phase === "results" && totalVotes === 0 && <p className="game-hint">{copy.noPlayers}</p>}
          {game.phase === "results" && game.type === "emoji_guess" && game.correctOption != null && (
            <p className="game-confirmation">{copy.correct}: {question.options[game.correctOption]}</p>
          )}
          {game.phase === "results" && ["connection_mission", "story_circle"].includes(game.type) && (
            <div className="conversation-invite">
              <p className="game-confirmation">{game.selectedOption == null
                ? copy.noConsensus
                : `${copy.groupChoice}: ${question.options[game.selectedOption]}`}</p>
              <p className="game-hint">{game.type === "connection_mission" ? copy.talkHint : copy.storyHint}</p>
              <button type="button" className="open-chat" onClick={onOpenChat}>
                💬 {copy.talkTogether}
              </button>
            </div>
          )}
          <button type="button" className="next-game" disabled={!canPlay || busy} onClick={() => act("advance")}>
            {game.phase === "voting" ? copy.results : copy.nextRound}
          </button>
        </div>
      )}
      {error && <p className="game-error" role="alert">{error}</p>}
      <style jsx>{`
        .social-games { padding: 1rem; border-radius: 1rem; color: var(--text, #f9f4ff); background: rgba(123,59,181,0.07); border: 1px solid rgba(190,148,233,0.28); }
        .game-heading { display: flex; align-items: flex-start; gap: .75rem; }
        .game-heading > span { font-size: 1.6rem; }
        h2 { font-size: 1.1rem; margin: 0 0 .3rem; }
        p { margin: 0; }
        .game-heading p, .game-hint { color: var(--text-muted, #ccc); font-size: .82rem; line-height: 1.5; }
        .game-switch { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; }
        button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        button:disabled { opacity: .58; cursor: not-allowed; }
        .game-type { color: inherit; padding: .6rem .85rem; border: 1px solid rgba(255,255,255,.19); border-radius: .75rem; background: rgba(255,255,255,.05); }
        .game-type.selected { border-color: #f472b6; background: rgba(244,114,182,.15); }
        .game-round { background: rgba(16,14,35,.4); padding: 1rem; border-radius: .85rem; }
        .game-details { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; font-size: .72rem; color: var(--text-muted, #ccc); }
        h3 { font-size: 1.05rem; line-height: 1.4; margin: .9rem 0; }
        h3.emoji-clue { font-size: 2rem; text-align: center; letter-spacing: .1rem; }
        .game-options { display: grid; gap: .55rem; }
        .game-option { display: flex; align-items: center; justify-content: space-between; gap: .5rem; text-align: left; color: inherit; padding: .8rem; border-radius: .75rem; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); }
        .game-option.correct { border-color: #34d399; background: rgba(52,211,153,.13); }
        .game-count { flex-shrink: 0; font-size: .8rem; font-weight: 700; }
        .game-confirmation { font-size: .8rem; margin: .7rem 0; color: #6ee7b7; }
        .next-game { width: 100%; margin-top: .9rem; padding: .75rem; border: none; border-radius: .75rem; background: #7c3aed; color: #fff; font-weight: 700; }
        .conversation-invite { margin-top: .85rem; padding: .75rem; background: rgba(52,211,153,.07); border: 1px solid rgba(52,211,153,.21); border-radius: .7rem; }
        .conversation-invite .game-hint { margin-top: .5rem; }
        .open-chat { width: 100%; margin-top: .8rem; padding: .65rem; color: #fff; border: 1px solid rgba(190,148,233,.45); border-radius: .65rem; background: rgba(128,85,180,.25); font-weight: 700; }
        .game-error { color: #fda4af; margin-top: .6rem; font-size: .82rem; }
      `}</style>
    </section>
  );
}
