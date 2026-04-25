"use client";

import { useEffect, useRef, useState } from "react";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const MIN_BATTLE_DURATION_MINUTES = 1;
const MAX_BATTLE_DURATION_MINUTES = 60;

function getBattleWinner(battle) {
  if (!battle) return null;
  const { leftScore = 0, rightScore = 0, leftLabel = "Equipo A", rightLabel = "Equipo B" } = battle;
  if (leftScore > rightScore) return leftLabel;
  if (rightScore > leftScore) return rightLabel;
  return "¡Empate!";
}

export default function LiveBattlePanel({ liveId, isCreator }) {
  const [battle, setBattle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [winner, setWinner] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startForm, setStartForm] = useState({
    title: "⚔️ Batalla Live",
    leftLabel: "Equipo A",
    rightLabel: "Equipo B",
    durationMinutes: 5,
  });

  const battleRef = useRef(battle);
  useEffect(() => { battleRef.current = battle; }, [battle]);

  // Fetch current battle state
  useEffect(() => {
    if (!liveId) return;
    fetch(`${API_URL}/api/lives/${liveId}/battle`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setBattle(data); })
      .catch((err) => console.error("[LiveBattlePanel] fetch battle failed:", err))
      .finally(() => setLoading(false));
  }, [liveId]);

  // Countdown timer effect
  useEffect(() => {
    if (!battle?.active || !battle?.endsAt) {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const current = battleRef.current;
      if (!current?.active || !current?.endsAt) { setCountdown(null); return; }
      const secs = Math.max(0, Math.round((new Date(current.endsAt) - Date.now()) / 1000));
      setCountdown(secs);
      if (secs <= 0) {
        setWinner(getBattleWinner(current));
        setBattle((prev) => prev ? { ...prev, active: false } : prev);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.active, battle?.endsAt]);

  // Socket event listeners
  useEffect(() => {
    const onBattleStarted = ({ liveId: lid, battle: b }) => {
      if (lid !== liveId) return;
      setBattle(b);
      setWinner(null);
    };
    const onBattleScoreUpdated = ({ liveId: lid, battle: b }) => {
      if (lid !== liveId) return;
      setBattle(b);
    };
    const onBattleEnded = ({ liveId: lid, battle: b }) => {
      if (lid !== liveId) return;
      setWinner(getBattleWinner(b));
      setBattle((prev) => prev ? { ...prev, active: false, ...b } : b);
    };
    socket.on("BATTLE_STARTED", onBattleStarted);
    socket.on("BATTLE_SCORE_UPDATED", onBattleScoreUpdated);
    socket.on("BATTLE_ENDED", onBattleEnded);
    return () => {
      socket.off("BATTLE_STARTED", onBattleStarted);
      socket.off("BATTLE_SCORE_UPDATED", onBattleScoreUpdated);
      socket.off("BATTLE_ENDED", onBattleEnded);
    };
  }, [liveId]);

  const handleStartBattle = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    setStarting(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/battle/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(startForm),
      });
      if (res.ok) { setShowForm(false); }
    } catch (err) {
      console.error("[LiveBattlePanel] start battle failed:", err);
    } finally {
      setStarting(false);
    }
  };

  const handleEndBattle = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/lives/${liveId}/battle/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("[LiveBattlePanel] end battle failed:", err);
    }
  };

  if (loading) return null;

  const isActive = battle?.active;
  const total = (battle?.leftScore || 0) + (battle?.rightScore || 0);
  const leftPct = total > 0 ? Math.round(((battle?.leftScore || 0) / total) * 100) : 50;
  const rightPct = 100 - leftPct;

  // Only show panel when: battle is active, there's a winner announcement, or creator wants to start
  if (!isActive && !winner && !isCreator) return null;

  const formatTime = (secs) => {
    if (secs == null) return "";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className={`lbp${isActive ? " lbp-active" : ""}${winner ? " lbp-ended" : ""}`}>
      {/* Header */}
      <div className="lbp-header">
        <span className="lbp-icon">⚔️</span>
        <span className="lbp-title">{battle?.title || (isCreator && !isActive ? "Batalla" : "⚔️ Batalla")}</span>
        {isActive && countdown != null && (
          <span className={`lbp-timer${countdown <= 10 ? " lbp-timer-urgent" : ""}`}>{formatTime(countdown)}</span>
        )}
        {isActive && isCreator && (
          <button className="lbp-end-btn" onClick={handleEndBattle}>Terminar</button>
        )}
      </div>

      {/* Winner announcement */}
      {winner && !isActive && (
        <div className="lbp-winner">
          🏆 Ganador: <strong>{winner}</strong>
        </div>
      )}

      {/* Battle scores (active or just ended) */}
      {(isActive || (winner && battle)) && (
        <>
          <div className="lbp-scores">
            <div className="lbp-side lbp-left">
              <span className="lbp-side-label">{battle?.leftLabel || "Equipo A"}</span>
              <span className="lbp-side-score">{(battle?.leftScore || 0).toLocaleString()}</span>
            </div>
            <span className="lbp-vs">VS</span>
            <div className="lbp-side lbp-right">
              <span className="lbp-side-label">{battle?.rightLabel || "Equipo B"}</span>
              <span className="lbp-side-score">{(battle?.rightScore || 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="lbp-bar-row">
            <div className="lbp-bar-left" style={{ width: `${leftPct}%` }} />
            <div className="lbp-bar-right" style={{ width: `${rightPct}%` }} />
          </div>
          <div className="lbp-pcts">
            <span>{leftPct}%</span>
            <span>{rightPct}%</span>
          </div>
        </>
      )}

      {/* Creator: start battle form */}
      {isCreator && !isActive && !winner && (
        <>
          {!showForm ? (
            <button className="lbp-start-btn" onClick={() => setShowForm(true)}>⚔️ Iniciar Batalla</button>
          ) : (
            <div className="lbp-form">
              <input
                className="lbp-input"
                value={startForm.title}
                onChange={(e) => setStartForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Título de la batalla"
                maxLength={80}
              />
              <div className="lbp-form-row">
                <input
                  className="lbp-input"
                  value={startForm.leftLabel}
                  onChange={(e) => setStartForm((p) => ({ ...p, leftLabel: e.target.value }))}
                  placeholder="Equipo A"
                  maxLength={40}
                />
                <input
                  className="lbp-input"
                  value={startForm.rightLabel}
                  onChange={(e) => setStartForm((p) => ({ ...p, rightLabel: e.target.value }))}
                  placeholder="Equipo B"
                  maxLength={40}
                />
              </div>
              <div className="lbp-form-row">
                <label className="lbp-label">Duración (min)</label>
                <input
                  className="lbp-input lbp-input-sm"
                  type="number"
                  min={MIN_BATTLE_DURATION_MINUTES}
                  max={MAX_BATTLE_DURATION_MINUTES}
                  value={startForm.durationMinutes}
                  onChange={(e) => setStartForm((p) => ({ ...p, durationMinutes: Number(e.target.value) || 5 }))}
                />
              </div>
              <div className="lbp-form-actions">
                <button className="lbp-start-btn" onClick={handleStartBattle} disabled={starting}>
                  {starting ? "Iniciando…" : "⚔️ Comenzar"}
                </button>
                <button className="lbp-cancel-btn" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .lbp {
          background: linear-gradient(135deg, rgba(12,6,28,0.96) 0%, rgba(28,8,52,0.96) 100%);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 10px;
          padding: 0.75rem 0.9rem;
          margin-bottom: 0.5rem;
          box-shadow: 0 0 16px rgba(139,92,246,0.08);
        }
        .lbp-active {
          border-color: rgba(224,64,251,0.45);
          box-shadow: 0 0 22px rgba(224,64,251,0.12);
          animation: lbpPulse 2.5s ease-in-out infinite;
        }
        @keyframes lbpPulse {
          0%, 100% { box-shadow: 0 0 22px rgba(224,64,251,0.12); }
          50%       { box-shadow: 0 0 34px rgba(224,64,251,0.22); }
        }
        .lbp-ended {
          border-color: rgba(251,191,36,0.45);
          box-shadow: 0 0 20px rgba(251,191,36,0.12);
        }
        .lbp-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.55rem;
          flex-wrap: wrap;
        }
        .lbp-icon { font-size: 0.9rem; flex-shrink: 0; }
        .lbp-title {
          flex: 1;
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lbp-timer {
          font-size: 0.72rem;
          font-weight: 900;
          color: #c4b5fd;
          background: rgba(139,92,246,0.15);
          border: 1px solid rgba(139,92,246,0.35);
          border-radius: 6px;
          padding: 0.1rem 0.45rem;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .lbp-timer-urgent {
          color: #f87171;
          background: rgba(239,68,68,0.15);
          border-color: rgba(239,68,68,0.4);
          animation: urgentFlash 0.6s ease-in-out infinite;
        }
        @keyframes urgentFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .lbp-end-btn {
          font-size: 0.62rem;
          font-weight: 700;
          color: #f87171;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.35);
          border-radius: 6px;
          padding: 0.15rem 0.5rem;
          cursor: pointer;
          flex-shrink: 0;
        }
        .lbp-winner {
          text-align: center;
          font-size: 0.8rem;
          font-weight: 800;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 8px;
          padding: 0.4rem 0.6rem;
          margin-bottom: 0.5rem;
          animation: winnerGlow 1.5s ease-in-out infinite;
        }
        @keyframes winnerGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(251,191,36,0.2); }
          50%       { box-shadow: 0 0 18px rgba(251,191,36,0.4); }
        }
        .lbp-scores {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }
        .lbp-side {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.1rem;
          flex: 1;
        }
        .lbp-side-label {
          font-size: 0.62rem;
          color: var(--text-muted);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 80px;
        }
        .lbp-left .lbp-side-score { color: #60a5fa; }
        .lbp-right .lbp-side-score { color: #f472b6; }
        .lbp-side-score {
          font-size: 1.15rem;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .lbp-vs {
          font-size: 0.65rem;
          font-weight: 900;
          color: var(--text-dim);
          letter-spacing: 0.08em;
          flex-shrink: 0;
        }
        .lbp-bar-row {
          display: flex;
          height: 8px;
          border-radius: 100px;
          overflow: hidden;
          background: rgba(255,255,255,0.05);
          margin-bottom: 0.25rem;
        }
        .lbp-bar-left {
          background: linear-gradient(90deg, #3b82f6, #60a5fa);
          box-shadow: 0 0 6px rgba(96,165,250,0.5);
          transition: width 0.5s ease;
          height: 100%;
        }
        .lbp-bar-right {
          background: linear-gradient(90deg, #ec4899, #f472b6);
          box-shadow: 0 0 6px rgba(244,114,182,0.5);
          transition: width 0.5s ease;
          height: 100%;
          margin-left: auto;
        }
        .lbp-pcts {
          display: flex;
          justify-content: space-between;
          font-size: 0.6rem;
          color: var(--text-dim);
          font-weight: 600;
        }
        .lbp-start-btn {
          width: 100%;
          padding: 0.5rem;
          border-radius: 8px;
          background: linear-gradient(135deg, #8b5cf6, #e040fb);
          color: #fff;
          font-size: 0.78rem;
          font-weight: 800;
          border: none;
          cursor: pointer;
          box-shadow: 0 0 14px rgba(224,64,251,0.3);
          transition: box-shadow 0.2s, transform 0.15s;
        }
        .lbp-start-btn:hover { box-shadow: 0 0 22px rgba(224,64,251,0.5); transform: translateY(-1px); }
        .lbp-start-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .lbp-cancel-btn {
          flex: 1;
          padding: 0.45rem;
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 700;
          border: 1px solid rgba(255,255,255,0.1);
          cursor: pointer;
          transition: background 0.15s;
        }
        .lbp-cancel-btn:hover { background: rgba(255,255,255,0.1); }
        .lbp-form { display: flex; flex-direction: column; gap: 0.4rem; }
        .lbp-form-row { display: flex; gap: 0.4rem; }
        .lbp-form-actions { display: flex; gap: 0.4rem; }
        .lbp-input {
          flex: 1;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 6px;
          color: var(--text);
          font-size: 0.72rem;
          padding: 0.35rem 0.5rem;
          outline: none;
          min-width: 0;
        }
        .lbp-input:focus { border-color: rgba(224,64,251,0.55); }
        .lbp-input-sm { max-width: 60px; flex: 0 0 60px; }
        .lbp-label {
          font-size: 0.68rem;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
