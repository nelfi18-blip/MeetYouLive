"use client";

import { useEffect, useState, useRef } from "react";

/**
 * VsBattleOverlay - Real-time battle UI between two creators
 * 
 * Features:
 * - Split screen layout (left: host, right: opponent)
 * - Timer countdown
 * - Score progress bar with animations
 * - Glowing VS text in center
 * - Leader highlight with glow effect
 * - Animated score changes
 */

export default function VsBattleOverlay({
  battleData = null,
  isActive = false,
  hostScore = 0,
  opponentScore = 0,
  hostUsername = "Host",
  opponentUsername = "Opponent",
  hostLiveId = null,
  opponentLiveId = null,
  onBattleEnd = null,
}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [displayHostScore, setDisplayHostScore] = useState(hostScore);
  const [displayOpponentScore, setDisplayOpponentScore] = useState(opponentScore);
  const [scoreChangeHost, setScoreChangeHost] = useState(0);
  const [scoreChangeOpponent, setScoreChangeOpponent] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [winner, setWinner] = useState(null);
  
  const prevHostScoreRef = useRef(hostScore);
  const prevOpponentScoreRef = useRef(opponentScore);
  const timerIntervalRef = useRef(null);
  const scoreAnimTimeoutRef = useRef(null);

  // Initialize timer
  useEffect(() => {
    if (!isActive || !battleData) return;

    const { vsStartTime, vsDuration } = battleData;
    if (!vsStartTime || !vsDuration) return;

    const updateTimer = () => {
      const now = Date.now();
      const start = new Date(vsStartTime).getTime();
      const end = start + (vsDuration * 1000);
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(timerIntervalRef.current);
      }
    };

    updateTimer();
    timerIntervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isActive, battleData]);

  // Animate score changes
  useEffect(() => {
    if (hostScore !== prevHostScoreRef.current) {
      const change = hostScore - prevHostScoreRef.current;
      if (change > 0) {
        setScoreChangeHost(change);
        if (scoreAnimTimeoutRef.current) clearTimeout(scoreAnimTimeoutRef.current);
        scoreAnimTimeoutRef.current = setTimeout(() => {
          setScoreChangeHost(0);
        }, 1500);
      }
      prevHostScoreRef.current = hostScore;
    }
    setDisplayHostScore(hostScore);
  }, [hostScore]);

  useEffect(() => {
    if (opponentScore !== prevOpponentScoreRef.current) {
      const change = opponentScore - prevOpponentScoreRef.current;
      if (change > 0) {
        setScoreChangeOpponent(change);
        if (scoreAnimTimeoutRef.current) clearTimeout(scoreAnimTimeoutRef.current);
        scoreAnimTimeoutRef.current = setTimeout(() => {
          setScoreChangeOpponent(0);
        }, 1500);
      }
      prevOpponentScoreRef.current = opponentScore;
    }
    setDisplayOpponentScore(opponentScore);
  }, [opponentScore]);

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const totalScore = displayHostScore + displayOpponentScore;
  const hostProgress = totalScore > 0 ? (displayHostScore / totalScore) * 100 : 50;
  const opponentProgress = totalScore > 0 ? (displayOpponentScore / totalScore) * 100 : 50;

  // Determine leader
  const isHostLeading = displayHostScore > displayOpponentScore;
  const isOpponentLeading = displayOpponentScore > displayHostScore;
  const isTied = displayHostScore === displayOpponentScore;

  if (!isActive && !showResult) return null;

  return (
    <div className="vs-battle-overlay">
      {/* Top Bar: Timer and Score */}
      <div className="vs-top-bar">
        <div className="vs-timer">
          <span className="timer-icon">⏱️</span>
          <span className="timer-text">{formatTime(timeLeft)}</span>
        </div>

        {/* Score Progress Bar */}
        <div className="vs-score-bar">
          <div 
            className={`score-progress host-progress ${isHostLeading ? "leading" : ""}`}
            style={{ width: `${hostProgress}%` }}
          >
            <span className="score-value">{displayHostScore.toLocaleString()}</span>
            {scoreChangeHost > 0 && (
              <span className="score-change host-change">+{scoreChangeHost}</span>
            )}
          </div>
          <div 
            className={`score-progress opponent-progress ${isOpponentLeading ? "leading" : ""}`}
            style={{ width: `${opponentProgress}%` }}
          >
            <span className="score-value">{displayOpponentScore.toLocaleString()}</span>
            {scoreChangeOpponent > 0 && (
              <span className="score-change opponent-change">+{scoreChangeOpponent}</span>
            )}
          </div>
        </div>
      </div>

      {/* Center: VS Text */}
      <div className="vs-center">
        <div className={`vs-text ${isTied ? "" : (isHostLeading ? "glow-left" : "glow-right")}`}>
          VS
        </div>
      </div>

      {/* Bottom: Creator Names */}
      <div className="vs-bottom">
        <div className={`vs-creator host-creator ${isHostLeading ? "leading" : ""}`}>
          <span className="creator-name">{hostUsername}</span>
          {isHostLeading && <span className="crown-icon">👑</span>}
        </div>
        <div className={`vs-creator opponent-creator ${isOpponentLeading ? "leading" : ""}`}>
          <span className="creator-name">{opponentUsername}</span>
          {isOpponentLeading && <span className="crown-icon">👑</span>}
        </div>
      </div>

      {/* Result Modal */}
      {showResult && winner && (
        <div className="vs-result-modal">
          <div className="result-content">
            <div className="result-icon">
              {winner === "tie" ? "🤝" : "🏆"}
            </div>
            <h2 className="result-title">
              {winner === "tie" ? "¡Empate!" : `¡${winner === "host" ? hostUsername : opponentUsername} Ganó!`}
            </h2>
            <div className="result-scores">
              <div className="result-score-item">
                <span className="result-name">{hostUsername}</span>
                <span className="result-value">{displayHostScore.toLocaleString()}</span>
              </div>
              <div className="result-divider">vs</div>
              <div className="result-score-item">
                <span className="result-name">{opponentUsername}</span>
                <span className="result-value">{displayOpponentScore.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .vs-battle-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 15;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1rem;
        }

        /* Top Bar */
        .vs-top-bar {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          pointer-events: auto;
        }

        .vs-timer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: rgba(0, 0, 0, 0.85);
          border: 2px solid rgba(255, 15, 138, 0.5);
          border-radius: 999px;
          padding: 0.5rem 1.5rem;
          margin: 0 auto;
          box-shadow: 0 4px 20px rgba(255, 15, 138, 0.3);
        }

        .timer-icon {
          font-size: 1.2rem;
        }

        .timer-text {
          font-size: 1.5rem;
          font-weight: 900;
          color: #ff0f8a;
          font-family: monospace;
          letter-spacing: 0.1em;
        }

        /* Score Bar */
        .vs-score-bar {
          position: relative;
          height: 40px;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 999px;
          overflow: hidden;
          border: 2px solid rgba(255, 255, 255, 0.1);
          display: flex;
        }

        .score-progress {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }

        .host-progress {
          background: linear-gradient(90deg, #3b82f6, #2563eb);
          border-radius: 999px 0 0 999px;
        }

        .opponent-progress {
          background: linear-gradient(90deg, #ef4444, #dc2626);
          border-radius: 0 999px 999px 0;
        }

        .score-progress.leading {
          box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.4);
          animation: pulse-glow 2s ease-in-out infinite;
        }

        .score-value {
          position: relative;
          z-index: 2;
          font-size: 1rem;
          font-weight: 900;
          color: white;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
        }

        .score-change {
          position: absolute;
          font-size: 1.2rem;
          font-weight: 900;
          animation: score-popup 1.5s ease-out forwards;
          pointer-events: none;
        }

        .host-change {
          right: 1rem;
          color: #60a5fa;
          text-shadow: 0 0 10px #3b82f6;
        }

        .opponent-change {
          left: 1rem;
          color: #fca5a5;
          text-shadow: 0 0 10px #ef4444;
        }

        @keyframes score-popup {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          50% {
            transform: translateY(-20px) scale(1.3);
            opacity: 1;
          }
          100% {
            transform: translateY(-40px) scale(1);
            opacity: 0;
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.3);
          }
        }

        /* Center VS Text */
        .vs-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .vs-text {
          font-size: 5rem;
          font-weight: 900;
          color: white;
          text-shadow: 
            0 0 20px rgba(255, 15, 138, 0.8),
            0 0 40px rgba(255, 15, 138, 0.6),
            0 0 60px rgba(255, 15, 138, 0.4);
          animation: vs-glow 2s ease-in-out infinite;
          letter-spacing: 0.2em;
        }

        .vs-text.glow-left {
          color: #3b82f6;
          text-shadow: 
            0 0 20px rgba(59, 130, 246, 0.8),
            0 0 40px rgba(59, 130, 246, 0.6),
            0 0 60px rgba(59, 130, 246, 0.4);
        }

        .vs-text.glow-right {
          color: #ef4444;
          text-shadow: 
            0 0 20px rgba(239, 68, 68, 0.8),
            0 0 40px rgba(239, 68, 68, 0.6),
            0 0 60px rgba(239, 68, 68, 0.4);
        }

        @keyframes vs-glow {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.1);
            filter: brightness(1.3);
          }
        }

        /* Bottom Creator Names */
        .vs-bottom {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          pointer-events: none;
        }

        .vs-creator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: rgba(0, 0, 0, 0.8);
          border-radius: var(--radius-md);
          padding: 0.75rem 1rem;
          border: 2px solid rgba(255, 255, 255, 0.1);
          transition: all 0.3s ease;
        }

        .vs-creator.leading {
          border-color: rgba(255, 215, 0, 0.6);
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
          animation: leader-glow 2s ease-in-out infinite;
        }

        .host-creator.leading {
          border-color: rgba(59, 130, 246, 0.6);
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
        }

        .opponent-creator.leading {
          border-color: rgba(239, 68, 68, 0.6);
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
        }

        @keyframes leader-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
          }
          50% {
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.6);
          }
        }

        .creator-name {
          font-size: 1rem;
          font-weight: 800;
          color: white;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
        }

        .crown-icon {
          font-size: 1.3rem;
          animation: crown-bounce 1s ease-in-out infinite;
        }

        @keyframes crown-bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        /* Result Modal */
        .vs-result-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          pointer-events: auto;
          animation: fade-in 0.5s ease-out;
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .result-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          padding: 3rem 2rem;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(239, 68, 68, 0.1));
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: var(--radius-lg);
          max-width: 500px;
          animation: slide-up 0.5s ease-out;
        }

        @keyframes slide-up {
          from {
            transform: translateY(50px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .result-icon {
          font-size: 5rem;
          animation: icon-pop 0.6s ease-out;
        }

        @keyframes icon-pop {
          0% {
            transform: scale(0);
          }
          60% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
          }
        }

        .result-title {
          font-size: 2rem;
          font-weight: 900;
          color: white;
          text-align: center;
          margin: 0;
        }

        .result-scores {
          display: flex;
          align-items: center;
          gap: 2rem;
          width: 100%;
        }

        .result-score-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .result-name {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-muted);
        }

        .result-value {
          font-size: 2rem;
          font-weight: 900;
          color: var(--accent);
        }

        .result-divider {
          font-size: 1.2rem;
          color: var(--text-muted);
          font-weight: 700;
        }

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
          .vs-battle-overlay {
            padding: 0.75rem;
          }

          .vs-timer {
            padding: 0.4rem 1rem;
          }

          .timer-text {
            font-size: 1.2rem;
          }

          .vs-score-bar {
            height: 32px;
          }

          .score-value {
            font-size: 0.85rem;
          }

          .vs-text {
            font-size: 3.5rem;
          }

          .creator-name {
            font-size: 0.85rem;
          }

          .crown-icon {
            font-size: 1rem;
          }

          .result-content {
            padding: 2rem 1.5rem;
            max-width: 90%;
          }

          .result-icon {
            font-size: 3.5rem;
          }

          .result-title {
            font-size: 1.5rem;
          }

          .result-value {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
