"use client";

import { useEffect, useRef, useState } from "react";
import socket from "@/lib/socket";
import { useLanguage } from "@/contexts/LanguageContext";
import { getUserImage } from "@/lib/imageHelpers";
import { deriveActiveVsState, deriveIncomingChallenge, deriveOutgoingChallenge } from "@/lib/vsBattleStatus";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 60;
const DEFAULT_DURATION_MINUTES = 5;

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

function authHeaders(json = false) {
  const token = getToken();
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  return headers;
}

function formatTime(secs) {
  if (secs == null) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * LiveVsBattlePanel — Creator-vs-Creator "Battle VS" experience.
 *
 * Reuses the existing VS Battle backend infrastructure (isVsActive, opponentId,
 * vsStartTime, vsDuration, vsScore, vs_battle_started, vs_result) via the new
 * challenge/accept/decline endpoints. Replaces the manual "Equipo A / Equipo B"
 * flow previously shown in LiveBattlePanel with real Creator identities.
 */
export default function LiveVsBattlePanel({ liveId, isCreator, hostUser }) {
  const { t } = useLanguage();

  const [vsActive, setVsActive] = useState(false);
  const [vsStartTime, setVsStartTime] = useState(null);
  const [vsDuration, setVsDuration] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [theirScore, setTheirScore] = useState(0);
  const [opponentIdentity, setOpponentIdentity] = useState(null); // { liveId, username, avatar }

  const [incomingChallenge, setIncomingChallenge] = useState(null); // { challengeId, challengerUsername, challengerAvatar, durationMinutes }
  const [outgoingChallenge, setOutgoingChallenge] = useState(null); // { challengeId, opponentUsername }

  const [result, setResult] = useState(null); // { winner, myScore, theirScore }
  const [countdown, setCountdown] = useState(null);

  const [showPicker, setShowPicker] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [busyLiveId, setBusyLiveId] = useState(null);
  const [respondingChallenge, setRespondingChallenge] = useState(false);
  const [error, setError] = useState(null);

  const stateRef = useRef({ vsStartTime, vsDuration });
  useEffect(() => {
    stateRef.current = { vsStartTime, vsDuration };
  }, [vsStartTime, vsDuration]);

  // Recover current VS/challenge state from the backend (fallback if a socket event is missed)
  useEffect(() => {
    if (!liveId) return;
    let cancelled = false;
    fetch(`${API_URL}/api/lives/${liveId}/vs-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        const activePatch = deriveActiveVsState(data);
        if (activePatch) {
          setVsActive(activePatch.vsActive);
          setVsStartTime(activePatch.vsStartTime);
          setVsDuration(activePatch.vsDuration);
          setMyScore(activePatch.myScore);
          setTheirScore(activePatch.theirScore);
          setOpponentIdentity(activePatch.opponentIdentity);
        }
        const incoming = deriveIncomingChallenge(data, isCreator);
        if (incoming) {
          setIncomingChallenge(incoming);
        }
        const outgoing = deriveOutgoingChallenge(data, isCreator);
        if (outgoing) {
          setOutgoingChallenge(outgoing);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [liveId, isCreator]);

  // Countdown timer
  useEffect(() => {
    if (!vsActive || !vsStartTime || !vsDuration) {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const { vsStartTime: st, vsDuration: dur } = stateRef.current;
      if (!st || !dur) return;
      const endsAt = new Date(st).getTime() + dur * 1000;
      const secs = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setCountdown(secs);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [vsActive, vsStartTime, vsDuration]);

  // Socket event listeners
  useEffect(() => {
    const onChallengeReceived = (payload) => {
      if (!isCreator) return;
      setIncomingChallenge({
        challengeId: payload.challengeId,
        challengerUsername: payload.challengerUsername,
        challengerAvatar: payload.challengerAvatar,
        durationMinutes: payload.durationMinutes,
      });
    };

    const onChallengeDeclined = (payload) => {
      setOutgoingChallenge((prev) => {
        if (prev && prev.challengeId === payload.challengeId) return null;
        return prev;
      });
    };

    const onBattleStarted = (payload) => {
      const theirs = payload.role === "host"
        ? { liveId: payload.opponentLiveId, username: payload.opponentUsername, avatar: payload.opponentAvatar }
        : { liveId: payload.hostLiveId, username: payload.hostUsername, avatar: payload.hostAvatar };

      setOpponentIdentity(theirs);
      setVsActive(true);
      setVsStartTime(payload.vsStartTime);
      setVsDuration(payload.vsDuration || 0);
      setMyScore(0);
      setTheirScore(0);
      setResult(null);
      setIncomingChallenge(null);
      setOutgoingChallenge(null);
    };

    const onVsUpdate = ({ hostScore, opponentScore }) => {
      setMyScore(hostScore || 0);
      setTheirScore(opponentScore || 0);
    };

    const onVsResult = (payload) => {
      setVsActive(false);
      setResult({
        winner: payload.winner,
        myScore: payload.hostScore || 0,
        theirScore: payload.opponentScore || 0,
      });
    };

    socket.on("vs_challenge_received", onChallengeReceived);
    socket.on("vs_challenge_declined", onChallengeDeclined);
    socket.on("vs_battle_started", onBattleStarted);
    socket.on("vs_update", onVsUpdate);
    socket.on("vs_result", onVsResult);
    return () => {
      socket.off("vs_challenge_received", onChallengeReceived);
      socket.off("vs_challenge_declined", onChallengeDeclined);
      socket.off("vs_battle_started", onBattleStarted);
      socket.off("vs_update", onVsUpdate);
      socket.off("vs_result", onVsResult);
    };
  }, [isCreator]);

  const openPicker = async () => {
    setShowPicker(true);
    setError(null);
    setLoadingCandidates(true);
    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/vs-candidates`, {
        headers: authHeaders(),
      });
      const data = res.ok ? await res.json() : null;
      setCandidates(data?.candidates || []);
    } catch {
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleChallenge = async (opponentLiveId, opponentUsername) => {
    if (busyLiveId) return;
    setBusyLiveId(opponentLiveId);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/lives/${liveId}/vs-challenge`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ opponentLiveId, durationMinutes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || t("vsBattle.errorGeneric"));
        return;
      }
      setOutgoingChallenge({ challengeId: data.challengeId, opponentUsername });
      setShowPicker(false);
    } catch {
      setError(t("vsBattle.errorGeneric"));
    } finally {
      setBusyLiveId(null);
    }
  };

  const handleAccept = async () => {
    if (!incomingChallenge || respondingChallenge) return;
    setRespondingChallenge(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/lives/${liveId}/vs-challenge/${incomingChallenge.challengeId}/accept`,
        { method: "POST", headers: authHeaders() }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || t("vsBattle.errorGeneric"));
        return;
      }
      setIncomingChallenge(null);
    } catch {
      setError(t("vsBattle.errorGeneric"));
    } finally {
      setRespondingChallenge(false);
    }
  };

  const handleDecline = async () => {
    if (!incomingChallenge || respondingChallenge) return;
    setRespondingChallenge(true);
    try {
      await fetch(`${API_URL}/api/lives/${liveId}/vs-challenge/${incomingChallenge.challengeId}/decline`, {
        method: "POST",
        headers: authHeaders(),
      });
    } catch {
      // ignore; state will still clear locally
    } finally {
      setIncomingChallenge(null);
      setRespondingChallenge(false);
    }
  };

  // Nothing to show for non-creators unless a VS battle is active or just ended
  if (!vsActive && !result && !isCreator) return null;

  const myAvatar = getUserImage(hostUser);
  const myUsername = hostUser?.username || hostUser?.name || t("liveRoomUi.anonymousHandle");

  return (
    <div className={`lvp${vsActive ? " lvp-active" : ""}${result ? " lvp-ended" : ""}`}>
      <div className="lvp-header">
        <span className="lvp-icon">{t("vsBattle.icon")}</span>
        <span className="lvp-title">{t("vsBattle.panelTitle")}</span>
        {vsActive && countdown != null && (
          <span className={`lvp-timer${countdown <= 10 ? " lvp-timer-urgent" : ""}`}>{formatTime(countdown)}</span>
        )}
      </div>

      {error && <div className="lvp-error">{error}</div>}

      {result && !vsActive && (
        <div className="lvp-winner">
          🏆 {t("vsBattle.winner")}:{" "}
          <strong>
            {result.winner === "tie"
              ? t("vsBattle.tie")
              : result.winner === "host"
              ? myUsername
              : opponentIdentity?.username || "—"}
          </strong>
        </div>
      )}

      {(vsActive || result) && (
        <div className="lvp-scores">
          <div className="lvp-side">
            <div className="lvp-avatar">
              {myAvatar ? <img src={myAvatar} alt={myUsername} /> : <span>{myUsername?.[0]?.toUpperCase() || "?"}</span>}
            </div>
            <span className="lvp-username">@{myUsername}</span>
            <span className="lvp-score">{(result ? result.myScore : myScore).toLocaleString()}</span>
          </div>
          <span className="lvp-vs">{t("vsBattle.vs")}</span>
          <div className="lvp-side">
            <div className="lvp-avatar">
              {opponentIdentity?.avatar ? (
                <img src={opponentIdentity.avatar} alt={opponentIdentity.username} />
              ) : (
                <span>{opponentIdentity?.username?.[0]?.toUpperCase() || "?"}</span>
              )}
            </div>
            <span className="lvp-username">@{opponentIdentity?.username || "—"}</span>
            <span className="lvp-score">{(result ? result.theirScore : theirScore).toLocaleString()}</span>
          </div>
        </div>
      )}

      {isCreator && incomingChallenge && (
        <div className="lvp-incoming">
          <div className="lvp-incoming-row">
            {incomingChallenge.challengerAvatar ? (
              <img className="lvp-incoming-avatar" src={incomingChallenge.challengerAvatar} alt={incomingChallenge.challengerUsername} />
            ) : (
              <div className="lvp-incoming-avatar lvp-incoming-avatar-placeholder">
                {incomingChallenge.challengerUsername?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <span>
              <strong>@{incomingChallenge.challengerUsername}</strong> {t("vsBattle.challengedYouSuffix")}
            </span>
          </div>
          <div className="lvp-incoming-actions">
            <button className="lvp-accept-btn" onClick={handleAccept} disabled={respondingChallenge}>
              {respondingChallenge ? t("vsBattle.accepting") : `✅ ${t("vsBattle.accept")}`}
            </button>
            <button className="lvp-decline-btn" onClick={handleDecline} disabled={respondingChallenge}>
              {respondingChallenge ? t("vsBattle.declining") : `❌ ${t("vsBattle.decline")}`}
            </button>
          </div>
        </div>
      )}

      {isCreator && outgoingChallenge && !vsActive && (
        <div className="lvp-waiting">
          {t("vsBattle.waitingResponse").replace("{username}", `@${outgoingChallenge.opponentUsername}`)}
        </div>
      )}

      {isCreator && !vsActive && !result && !incomingChallenge && !outgoingChallenge && (
        <>
          {!showPicker ? (
            <button className="lvp-start-btn" onClick={openPicker}>
              {t("vsBattle.startChallenge")}
            </button>
          ) : (
            <div className="lvp-picker">
              <div className="lvp-picker-header">
                <span className="lvp-picker-title">{t("vsBattle.pickOpponentTitle")}</span>
                <button className="lvp-cancel-btn" onClick={() => setShowPicker(false)}>
                  {t("vsBattle.cancel")}
                </button>
              </div>
              <p className="lvp-picker-desc">{t("vsBattle.pickOpponentDesc")}</p>
              <div className="lvp-duration-row">
                <label>{t("vsBattle.durationLabel")}</label>
                <input
                  type="number"
                  min={MIN_DURATION_MINUTES}
                  max={MAX_DURATION_MINUTES}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || DEFAULT_DURATION_MINUTES)}
                />
              </div>
              {loadingCandidates ? (
                <p className="lvp-picker-status">{t("vsBattle.loadingCandidates")}</p>
              ) : candidates.length === 0 ? (
                <p className="lvp-picker-status">{t("vsBattle.noCandidates")}</p>
              ) : (
                <div className="lvp-candidates">
                  {candidates.map((c) => (
                    <div className="lvp-candidate" key={c.liveId}>
                      <div className="lvp-candidate-avatar">
                        {c.avatar ? <img src={c.avatar} alt={c.username} /> : <span>{c.username?.[0]?.toUpperCase() || "?"}</span>}
                      </div>
                      <div className="lvp-candidate-info">
                        <span className="lvp-candidate-username">@{c.username}</span>
                        <span className="lvp-candidate-live">{t("vsBattle.liveNow")}</span>
                      </div>
                      <button
                        className="lvp-challenge-btn"
                        onClick={() => handleChallenge(c.liveId, c.username)}
                        disabled={busyLiveId === c.liveId}
                      >
                        {busyLiveId === c.liveId ? t("vsBattle.challenging") : t("vsBattle.challengeButton")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .lvp {
          background: linear-gradient(135deg, rgba(12,6,28,0.96) 0%, rgba(28,8,52,0.96) 100%);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 10px;
          padding: 0.75rem 0.9rem;
          margin-bottom: 0.5rem;
          box-shadow: 0 0 16px rgba(139,92,246,0.08);
        }
        .lvp-active {
          border-color: rgba(224,64,251,0.45);
          box-shadow: 0 0 22px rgba(224,64,251,0.12);
          animation: lvpPulse 2.5s ease-in-out infinite;
        }
        @keyframes lvpPulse {
          0%, 100% { box-shadow: 0 0 22px rgba(224,64,251,0.12); }
          50%       { box-shadow: 0 0 34px rgba(224,64,251,0.22); }
        }
        .lvp-ended {
          border-color: rgba(251,191,36,0.45);
          box-shadow: 0 0 20px rgba(251,191,36,0.12);
        }
        .lvp-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.55rem;
          flex-wrap: wrap;
        }
        .lvp-icon { font-size: 0.9rem; flex-shrink: 0; }
        .lvp-title {
          flex: 1;
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--text);
        }
        .lvp-timer {
          font-size: 0.72rem;
          font-weight: 900;
          color: #c4b5fd;
          background: rgba(139,92,246,0.15);
          border: 1px solid rgba(139,92,246,0.35);
          border-radius: 6px;
          padding: 0.1rem 0.45rem;
          font-variant-numeric: tabular-nums;
        }
        .lvp-timer-urgent {
          color: #f87171;
          background: rgba(239,68,68,0.15);
          border-color: rgba(239,68,68,0.4);
        }
        .lvp-error {
          font-size: 0.68rem;
          color: #f87171;
          margin-bottom: 0.4rem;
        }
        .lvp-winner {
          text-align: center;
          font-size: 0.8rem;
          font-weight: 800;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 8px;
          padding: 0.4rem 0.6rem;
          margin-bottom: 0.5rem;
        }
        .lvp-scores {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.4rem;
        }
        .lvp-side {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.15rem;
          flex: 1;
          min-width: 0;
        }
        .lvp-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(139,92,246,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          color: var(--text);
        }
        .lvp-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .lvp-username {
          font-size: 0.65rem;
          color: var(--text-muted);
          font-weight: 700;
          max-width: 90px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lvp-score {
          font-size: 1.1rem;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          color: var(--text);
        }
        .lvp-vs {
          font-size: 0.65rem;
          font-weight: 900;
          color: var(--text-dim);
          letter-spacing: 0.08em;
          flex-shrink: 0;
        }
        .lvp-incoming {
          background: rgba(139,92,246,0.1);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 8px;
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .lvp-incoming-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.72rem;
          color: var(--text);
        }
        .lvp-incoming-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          flex-shrink: 0;
          object-fit: cover;
        }
        .lvp-incoming-avatar-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(139,92,246,0.3);
          font-weight: 800;
        }
        .lvp-incoming-actions { display: flex; gap: 0.4rem; }
        .lvp-accept-btn, .lvp-decline-btn {
          flex: 1;
          padding: 0.4rem;
          border-radius: 8px;
          font-size: 0.72rem;
          font-weight: 800;
          border: none;
          cursor: pointer;
        }
        .lvp-accept-btn { background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; }
        .lvp-decline-btn { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.35); }
        .lvp-accept-btn:disabled, .lvp-decline-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .lvp-waiting {
          font-size: 0.72rem;
          color: var(--text-muted);
          text-align: center;
          padding: 0.4rem;
        }
        .lvp-start-btn {
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
        }
        .lvp-picker { display: flex; flex-direction: column; gap: 0.4rem; }
        .lvp-picker-header { display: flex; align-items: center; justify-content: space-between; }
        .lvp-picker-title { font-size: 0.75rem; font-weight: 800; color: var(--text); }
        .lvp-picker-desc { font-size: 0.65rem; color: var(--text-muted); margin: 0; }
        .lvp-cancel-btn {
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          font-size: 0.68rem;
          border: 1px solid rgba(255,255,255,0.1);
          cursor: pointer;
        }
        .lvp-duration-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.68rem; color: var(--text-muted); }
        .lvp-duration-row input {
          width: 56px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 6px;
          color: var(--text);
          padding: 0.2rem 0.3rem;
        }
        .lvp-picker-status { font-size: 0.68rem; color: var(--text-muted); text-align: center; }
        .lvp-candidates {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          max-height: 200px;
          overflow-y: auto;
        }
        .lvp-candidate {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(255,255,255,0.04);
          border-radius: 8px;
          padding: 0.35rem 0.45rem;
        }
        .lvp-candidate-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(139,92,246,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.7rem;
          flex-shrink: 0;
        }
        .lvp-candidate-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .lvp-candidate-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .lvp-candidate-username {
          font-size: 0.68rem;
          font-weight: 700;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lvp-candidate-live { font-size: 0.58rem; color: #4ade80; font-weight: 700; }
        .lvp-challenge-btn {
          padding: 0.3rem 0.55rem;
          border-radius: 6px;
          background: linear-gradient(135deg, #8b5cf6, #e040fb);
          color: #fff;
          font-size: 0.65rem;
          font-weight: 800;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }
        .lvp-challenge-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        @media (max-width: 480px) {
          .lvp {
            padding: 0.6rem 0.7rem;
            margin-bottom: 0.4rem;
          }

          .lvp-header { margin-bottom: 0.4rem; }

          .lvp-scores { margin-bottom: 0.3rem; }

          .lvp-avatar { width: 30px; height: 30px; }

          .lvp-candidates { max-height: 160px; }

          .lvp-candidate { padding: 0.3rem 0.4rem; }
        }
      `}</style>
    </div>
  );
}
