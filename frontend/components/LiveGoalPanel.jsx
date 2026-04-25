"use client";

import { useEffect, useRef, useState } from "react";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function LiveGoalPanel({ liveId }) {
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const prevProgressRef = useRef(0);
  const [bump, setBump] = useState(false);

  // Fetch initial goal state
  useEffect(() => {
    if (!liveId) return;
    fetch(`${API_URL}/api/lives/${liveId}/goal`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setGoal(data);
          prevProgressRef.current = data.progress || 0;
        }
      })
      .catch((err) => console.error("[LiveGoalPanel] fetch goal failed:", err))
      .finally(() => setLoading(false));
  }, [liveId]);

  // Listen for real-time goal updates
  useEffect(() => {
    const onGoalUpdated = ({ liveId: updatedId, goal: updatedGoal }) => {
      if (updatedId !== liveId) return;
      setGoal(updatedGoal);
      if (updatedGoal.progress > prevProgressRef.current) {
        prevProgressRef.current = updatedGoal.progress;
        setBump(true);
        setTimeout(() => setBump(false), 600);
      }
    };
    socket.on("LIVE_GOAL_UPDATED", onGoalUpdated);
    return () => socket.off("LIVE_GOAL_UPDATED", onGoalUpdated);
  }, [liveId]);

  if (loading || !goal || !goal.active || goal.target <= 0) return null;

  const pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
  const remaining = Math.max(0, goal.target - goal.progress);
  const completed = pct >= 100;

  return (
    <div className={`lgp${bump ? " lgp-bump" : ""}${completed ? " lgp-done" : ""}`}>
      <div className="lgp-header">
        <span className="lgp-icon">{completed ? "🎉" : "🎯"}</span>
        <span className="lgp-title">{goal.title || "Meta del live"}</span>
        <span className="lgp-live-badge">META</span>
      </div>

      <div className="lgp-bar-wrap">
        <div className="lgp-bar-bg">
          <div className="lgp-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="lgp-pct">{pct}%</span>
      </div>

      <div className="lgp-meta">
        <span className="lgp-progress">
          <span className="lgp-num">🪙 {goal.progress.toLocaleString()}</span>
          <span className="lgp-sep"> / </span>
          <span className="lgp-target">{goal.target.toLocaleString()}</span>
        </span>
        {!completed && remaining > 0 && (
          <span className="lgp-remaining">Faltan {remaining.toLocaleString()} monedas</span>
        )}
        {completed && <span className="lgp-reached">¡Meta alcanzada! 🎊</span>}
      </div>

      {goal.reward ? (
        <div className="lgp-reward">🎁 Recompensa: {goal.reward}</div>
      ) : null}

      <style jsx>{`
        .lgp {
          background: linear-gradient(135deg, rgba(12,6,28,0.96) 0%, rgba(22,10,46,0.96) 100%);
          border: 1px solid rgba(139,92,246,0.35);
          border-radius: 10px;
          padding: 0.75rem 0.9rem;
          margin-bottom: 0.5rem;
          box-shadow: 0 0 20px rgba(139,92,246,0.1);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .lgp-bump {
          animation: lgpBump 0.5s ease;
        }
        @keyframes lgpBump {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.03); box-shadow: 0 0 28px rgba(139,92,246,0.35); }
          100% { transform: scale(1); }
        }
        .lgp-done {
          border-color: rgba(74,222,128,0.5);
          box-shadow: 0 0 20px rgba(74,222,128,0.15);
        }
        .lgp-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.55rem;
        }
        .lgp-icon { font-size: 0.9rem; }
        .lgp-title {
          flex: 1;
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lgp-live-badge {
          font-size: 0.55rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: #a78bfa;
          background: rgba(139,92,246,0.15);
          border: 1px solid rgba(139,92,246,0.4);
          border-radius: 100px;
          padding: 0.12rem 0.42rem;
          flex-shrink: 0;
        }
        .lgp-bar-wrap {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }
        .lgp-bar-bg {
          flex: 1;
          height: 8px;
          border-radius: 100px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .lgp-bar-fill {
          height: 100%;
          border-radius: 100px;
          background: linear-gradient(90deg, #8b5cf6, #e040fb);
          box-shadow: 0 0 8px rgba(224,64,251,0.5);
          transition: width 0.5s ease;
        }
        .lgp-done .lgp-bar-fill {
          background: linear-gradient(90deg, #4ade80, #22d3ee);
          box-shadow: 0 0 8px rgba(74,222,128,0.5);
        }
        .lgp-pct {
          font-size: 0.65rem;
          font-weight: 800;
          color: #c4b5fd;
          flex-shrink: 0;
          min-width: 28px;
          text-align: right;
        }
        .lgp-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.3rem;
        }
        .lgp-progress {
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        .lgp-num { color: #c4b5fd; font-weight: 700; }
        .lgp-target { color: var(--text-dim); }
        .lgp-remaining {
          font-size: 0.65rem;
          color: var(--text-dim);
          font-style: italic;
        }
        .lgp-reached {
          font-size: 0.7rem;
          color: #4ade80;
          font-weight: 700;
          animation: lgpReachedPulse 1.5s ease-in-out infinite;
        }
        @keyframes lgpReachedPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
        .lgp-reward {
          margin-top: 0.4rem;
          font-size: 0.68rem;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: 6px;
          padding: 0.25rem 0.5rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
