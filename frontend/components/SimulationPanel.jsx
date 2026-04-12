"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

/* ── Scenario Card ─────────────────────────────────────────────────────── */
function ScenarioCard({ scenario, isSelected, onSelect }) {
  return (
    <button
      className={`scenario-card ${isSelected ? "scenario-card--active" : ""} ${scenario.isPremium && !scenario.isUnlocked ? "scenario-card--locked" : ""}`}
      onClick={() => onSelect(scenario)}
    >
      <div className="scenario-card-top">
        <span className="scenario-emoji">{scenario.emoji}</span>
        {scenario.isPremium && !scenario.isUnlocked && (
          <span className="lock-badge">🔒 {scenario.coinCost} coins</span>
        )}
        {scenario.isPremium && scenario.isUnlocked && (
          <span className="unlocked-badge">✅ Desbloqueado</span>
        )}
      </div>
      <div className="scenario-title">{scenario.title}</div>
      <div className="scenario-desc">{scenario.description}</div>
      <style jsx>{`
        .scenario-card {
          text-align: left;
          padding: 0.9rem 1rem;
          border-radius: var(--radius-xs, 8px);
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          cursor: pointer;
          transition: all 0.18s;
          width: 100%;
        }
        .scenario-card:hover:not(.scenario-card--locked) {
          border-color: rgba(244,114,182,0.4);
          background: rgba(244,114,182,0.06);
        }
        .scenario-card--active {
          border-color: #f472b6;
          background: rgba(244,114,182,0.1);
          box-shadow: 0 0 12px rgba(244,114,182,0.15);
        }
        .scenario-card--locked {
          opacity: 0.7;
        }
        .scenario-card-top {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.3rem;
        }
        .scenario-emoji { font-size: 1.3rem; }
        .lock-badge {
          font-size: 0.62rem; font-weight: 800; letter-spacing: 0.04em;
          color: #fbbf24; background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3);
          border-radius: 999px; padding: 0.1rem 0.5rem;
        }
        .unlocked-badge {
          font-size: 0.62rem; font-weight: 800;
          color: #34d399; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.25);
          border-radius: 999px; padding: 0.1rem 0.5rem;
        }
        .scenario-title {
          font-size: 0.88rem; font-weight: 800; color: var(--text, #fff); margin-bottom: 0.2rem;
        }
        .scenario-desc { font-size: 0.75rem; color: var(--text-muted, #aaa); }
      `}</style>
    </button>
  );
}

/* ── Response Card ─────────────────────────────────────────────────────── */
function ResponseCard({ response, currentUserId, onLike }) {
  const authorName = response.user?.username || response.user?.name || "Usuario";
  return (
    <div className="resp-card">
      <div className="resp-header">
        <div className="resp-avatar">
          {response.user?.avatar
            ? <img src={response.user.avatar} alt={authorName} width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover" }} />
            : <span>{authorName[0]?.toUpperCase()}</span>}
        </div>
        <span className="resp-name">{authorName}</span>
        <span className="resp-time">{new Date(response.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="resp-text">{response.text}</p>
      <button
        className={`resp-like-btn ${response.likedByMe ? "resp-like-btn--active" : ""}`}
        onClick={() => onLike(response._id)}
      >
        ❤️ {response.likesCount}
      </button>
      <style jsx>{`
        .resp-card {
          padding: 0.85rem 1rem; border-radius: var(--radius-xs, 8px);
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .resp-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
        .resp-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: rgba(244,114,182,0.2); border: 1px solid rgba(244,114,182,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.7rem; font-weight: 800; color: #f472b6; flex-shrink: 0;
          overflow: hidden;
        }
        .resp-name { font-size: 0.8rem; font-weight: 700; color: var(--text, #fff); flex: 1; }
        .resp-time { font-size: 0.68rem; color: var(--text-dim, #666); }
        .resp-text { font-size: 0.82rem; color: var(--text-muted, #ccc); margin: 0 0 0.5rem; line-height: 1.45; }
        .resp-like-btn {
          background: none; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px; padding: 0.15rem 0.6rem;
          font-size: 0.72rem; cursor: pointer; color: var(--text-muted, #aaa);
          transition: all 0.18s;
        }
        .resp-like-btn:hover, .resp-like-btn--active {
          border-color: rgba(244,114,182,0.4); color: #f472b6;
          background: rgba(244,114,182,0.08);
        }
      `}</style>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────── */
export default function SimulationPanel({ currentUser }) {
  const [scenarios, setScenarios] = useState([]);
  const [selected, setSelected] = useState(null);
  const [responses, setResponses] = useState([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [postedResponse, setPostedResponse] = useState(null);
  const [error, setError] = useState("");

  // Coin unlock modal state
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  /* ── Load scenarios ─────────────────────────────────────────────────── */
  useEffect(() => {
    const token = getToken();
    fetch(`${API_URL}/api/simulation/scenarios`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setScenarios(Array.isArray(data) ? data : []);
        if (data.length > 0) setSelected(data[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingScenarios(false));
  }, []);

  /* ── Load responses when scenario changes ───────────────────────────── */
  useEffect(() => {
    if (!selected) return;
    setLoadingResponses(true);
    setResponses([]);
    const token = getToken();
    fetch(`${API_URL}/api/simulation/scenarios/${selected.id}/responses?limit=20`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setResponses(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingResponses(false));
  }, [selected?.id]);

  /* ── Select scenario ─────────────────────────────────────────────────── */
  const handleSelect = (scenario) => {
    if (scenario.isPremium && !scenario.isUnlocked) {
      setUnlockTarget(scenario);
      setUnlockError("");
      return;
    }
    setSelected(scenario);
    setPostedResponse(null);
    setInput("");
    setError("");
  };

  /* ── Submit practice response ───────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || submitting) return;
    if (!currentUser) { setError("Inicia sesión para practicar"); return; }
    if (!selected) return;

    setSubmitting(true);
    setError("");
    const token = getToken();
    try {
      const res = await fetch(`${API_URL}/api/simulation/scenarios/${selected.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: input.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setUnlockTarget(selected);
          setUnlockError("");
        } else {
          setError(body.message || "Error al enviar");
        }
        return;
      }
      setPostedResponse(body);
      setResponses((prev) => [body, ...prev]);
      setInput("");
    } catch {
      setError("Error de red");
    } finally {
      setSubmitting(false);
    }
  }, [input, submitting, selected, currentUser]);

  /* ── Like a response ─────────────────────────────────────────────────── */
  const handleLike = useCallback(async (responseId) => {
    if (!currentUser) return;
    const token = getToken();
    try {
      const res = await fetch(`${API_URL}/api/simulation/responses/${responseId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { likesCount, likedByMe } = await res.json();
      setResponses((prev) =>
        prev.map((r) => (String(r._id) === String(responseId) ? { ...r, likesCount, likedByMe } : r))
      );
      if (postedResponse && String(postedResponse._id) === String(responseId)) {
        setPostedResponse((p) => ({ ...p, likesCount, likedByMe }));
      }
    } catch {}
  }, [currentUser, postedResponse]);

  /* ── Unlock premium scenario ─────────────────────────────────────────── */
  const handleUnlock = useCallback(async () => {
    if (!unlockTarget || unlocking) return;
    const token = getToken();
    if (!token) { setUnlockError("Inicia sesión para desbloquear"); return; }

    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch(`${API_URL}/api/simulation/scenarios/${unlockTarget.id}/unlock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setUnlockError(body.message || "No se pudo desbloquear");
        return;
      }
      // Update scenarios list to mark as unlocked
      setScenarios((prev) =>
        prev.map((s) => (s.id === unlockTarget.id ? { ...s, isUnlocked: true } : s))
      );
      setSelected({ ...unlockTarget, isUnlocked: true });
      setPostedResponse(null);
      setInput("");
      setUnlockTarget(null);
    } catch {
      setUnlockError("Error de red");
    } finally {
      setUnlocking(false);
    }
  }, [unlockTarget, unlocking]);

  return (
    <div className="simulation-panel">
      {/* Header */}
      <div className="sim-header">
        <div className="sim-header-icon">🎯</div>
        <div>
          <h2 className="sim-title">Practicar conversación</h2>
          <p className="sim-subtitle">Elige un escenario, escribe tu respuesta y aprende de la comunidad.</p>
        </div>
      </div>

      {/* Scenario picker */}
      <div className="scenarios-section">
        <div className="section-label">Elige un escenario</div>
        {loadingScenarios ? (
          <div className="scenarios-grid">
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 8 }} />)}
          </div>
        ) : (
          <div className="scenarios-grid">
            {scenarios.map((s) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                isSelected={selected?.id === s.id}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Practice area */}
      {selected && (
        <div className="practice-area">
          <div className="scenario-active-header">
            <span className="scenario-active-emoji">{selected.emoji}</span>
            <div>
              <div className="scenario-active-title">{selected.title}</div>
              <div className="scenario-active-prompt">{selected.prompt}</div>
            </div>
          </div>

          {/* Tips */}
          {selected.tips && (
            <div className="tips-row">
              {selected.tips.map((tip, i) => (
                <span key={i} className="tip-chip">💡 {tip}</span>
              ))}
            </div>
          )}

          {/* Already posted */}
          {postedResponse && (
            <div className="posted-banner">
              <span className="posted-icon">✅</span>
              <div>
                <div className="posted-label">¡Tu respuesta fue compartida!</div>
                <p className="posted-text">{postedResponse.text}</p>
              </div>
            </div>
          )}

          {/* Input */}
          {!postedResponse && (
            <div className="input-area">
              <textarea
                className="sim-textarea"
                placeholder={selected.prompt}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                maxLength={600}
                disabled={submitting || !currentUser}
              />
              <div className="input-footer">
                <span className="char-count">{input.length}/600</span>
                {!currentUser ? (
                  <Link href="/login" className="sim-btn sim-btn--primary">
                    Inicia sesión para practicar
                  </Link>
                ) : (
                  <button
                    className="sim-btn sim-btn--primary"
                    onClick={handleSubmit}
                    disabled={!input.trim() || submitting}
                  >
                    {submitting ? "Enviando…" : "Compartir respuesta 🚀"}
                  </button>
                )}
              </div>
              {error && <p className="sim-error">{error}</p>}
            </div>
          )}

          {/* After submission CTAs */}
          {postedResponse && (
            <div className="after-sim-cta">
              <div className="after-sim-label">¿Listo/a para poner en práctica?</div>
              <div className="after-sim-btns">
                <Link href="/crush" className="after-btn after-btn--pink">💘 Ir a Crush</Link>
                <Link href="/chats" className="after-btn after-btn--purple">💬 Iniciar chat</Link>
                <Link href="/explore" className="after-btn after-btn--orange">🔴 Ver lives</Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Community responses */}
      {selected && (
        <div className="community-section">
          <div className="section-label">💬 Respuestas de la comunidad</div>
          {loadingResponses ? (
            <div className="responses-list">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 8 }} />)}
            </div>
          ) : responses.length === 0 ? (
            <div className="no-responses">
              Sé el primero en compartir tu respuesta para este escenario. 🌟
            </div>
          ) : (
            <div className="responses-list">
              {responses.map((r) => (
                <ResponseCard
                  key={r._id}
                  response={r}
                  currentUserId={currentUser?._id}
                  onLike={handleLike}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Safety note */}
      <div className="sim-safety">
        🛡️ Espacio seguro y respetuoso. Comparte con confianza.
      </div>

      {/* Unlock modal */}
      {unlockTarget && (
        <div className="modal-overlay" onClick={() => setUnlockTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-emoji">{unlockTarget.emoji}</div>
            <h3 className="modal-title">Escenario Premium</h3>
            <p className="modal-desc">
              <strong>{unlockTarget.title}</strong> requiere <strong>{unlockTarget.coinCost} coins</strong> para desbloquearse permanentemente.
            </p>
            {unlockError && <p className="sim-error">{unlockError}</p>}
            <div className="modal-actions">
              <button className="sim-btn sim-btn--ghost" onClick={() => setUnlockTarget(null)}>Cancelar</button>
              <button className="sim-btn sim-btn--gold" onClick={handleUnlock} disabled={unlocking}>
                {unlocking ? "Desbloqueando…" : `🔓 Desbloquear (${unlockTarget.coinCost} coins)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .simulation-panel { display: flex; flex-direction: column; gap: 1.25rem; }

        /* Header */
        .sim-header {
          display: flex; align-items: flex-start; gap: 0.85rem;
          padding: 1.1rem 1.25rem;
          border-radius: var(--radius-sm, 10px);
          border: 1px solid rgba(244,114,182,0.2);
          background: linear-gradient(135deg, rgba(30,8,55,0.9) 0%, rgba(14,4,32,0.95) 100%);
        }
        .sim-header-icon { font-size: 2rem; flex-shrink: 0; }
        .sim-title { font-size: 1.05rem; font-weight: 900; color: var(--text, #fff); margin: 0 0 0.15rem; }
        .sim-subtitle { font-size: 0.8rem; color: var(--text-muted, #aaa); margin: 0; }

        /* Scenarios */
        .scenarios-section { display: flex; flex-direction: column; gap: 0.75rem; }
        .section-label { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; color: var(--text-muted, #aaa); text-transform: uppercase; }
        .scenarios-grid {
          display: grid; grid-template-columns: 1fr; gap: 0.6rem;
        }
        @media (min-width: 560px) { .scenarios-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 900px) { .scenarios-grid { grid-template-columns: repeat(3, 1fr); } }

        /* Practice area */
        .practice-area {
          display: flex; flex-direction: column; gap: 0.9rem;
          padding: 1.1rem 1.25rem;
          border-radius: var(--radius-sm, 10px);
          border: 1px solid rgba(244,114,182,0.15);
          background: rgba(244,114,182,0.04);
        }
        .scenario-active-header { display: flex; align-items: flex-start; gap: 0.7rem; }
        .scenario-active-emoji { font-size: 1.6rem; flex-shrink: 0; }
        .scenario-active-title { font-size: 0.95rem; font-weight: 800; color: var(--text, #fff); margin-bottom: 0.15rem; }
        .scenario-active-prompt { font-size: 0.8rem; color: var(--text-muted, #aaa); line-height: 1.4; }

        /* Tips */
        .tips-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .tip-chip {
          font-size: 0.7rem; font-weight: 600; color: var(--text-muted, #aaa);
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px; padding: 0.15rem 0.55rem;
        }

        /* Input */
        .input-area { display: flex; flex-direction: column; gap: 0.5rem; }
        .sim-textarea {
          width: 100%; padding: 0.75rem; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.3); color: var(--text, #fff);
          font-size: 0.875rem; line-height: 1.5; resize: vertical;
          font-family: inherit;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .sim-textarea:focus { outline: none; border-color: rgba(244,114,182,0.5); }
        .sim-textarea::placeholder { color: var(--text-dim, #555); }
        .sim-textarea:disabled { opacity: 0.5; cursor: not-allowed; }
        .input-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .char-count { font-size: 0.68rem; color: var(--text-dim, #555); }

        /* Posted */
        .posted-banner {
          display: flex; align-items: flex-start; gap: 0.75rem;
          padding: 0.85rem 1rem; border-radius: 8px;
          border: 1px solid rgba(52,211,153,0.25);
          background: rgba(52,211,153,0.06);
        }
        .posted-icon { font-size: 1.2rem; flex-shrink: 0; }
        .posted-label { font-size: 0.78rem; font-weight: 800; color: #34d399; margin-bottom: 0.2rem; }
        .posted-text { font-size: 0.82rem; color: var(--text-muted, #ccc); margin: 0; }

        /* After sim CTAs */
        .after-sim-cta { display: flex; flex-direction: column; gap: 0.6rem; }
        .after-sim-label { font-size: 0.78rem; font-weight: 800; color: var(--text-muted, #aaa); }
        .after-sim-btns { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .after-btn {
          font-size: 0.78rem; font-weight: 800; padding: 0.45rem 0.9rem;
          border-radius: 999px; text-decoration: none; border: 1px solid transparent;
          transition: all 0.18s;
        }
        .after-btn--pink   { color: #f472b6; background: rgba(244,114,182,0.12); border-color: rgba(244,114,182,0.3); }
        .after-btn--purple { color: #a78bfa; background: rgba(167,139,250,0.12); border-color: rgba(167,139,250,0.3); }
        .after-btn--orange { color: #fb923c; background: rgba(251,146,60,0.12);  border-color: rgba(251,146,60,0.3);  }
        .after-btn:hover { opacity: 0.8; transform: translateY(-1px); }

        /* Community */
        .community-section { display: flex; flex-direction: column; gap: 0.75rem; }
        .responses-list { display: flex; flex-direction: column; gap: 0.6rem; }
        .no-responses { font-size: 0.82rem; color: var(--text-dim, #666); text-align: center; padding: 1rem; }

        /* Buttons */
        .sim-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0.5rem 1rem; border-radius: 999px; font-size: 0.82rem; font-weight: 800;
          cursor: pointer; text-decoration: none; border: 1px solid transparent;
          transition: all 0.18s; white-space: nowrap;
        }
        .sim-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sim-btn--primary {
          background: linear-gradient(135deg, #f472b6 0%, #a855f7 100%);
          color: #fff; border: none;
        }
        .sim-btn--primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .sim-btn--ghost {
          background: transparent; color: var(--text-muted, #aaa);
          border-color: rgba(255,255,255,0.15);
        }
        .sim-btn--ghost:hover { background: rgba(255,255,255,0.06); }
        .sim-btn--gold {
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          color: #1a1a1a; border: none; font-weight: 900;
        }
        .sim-btn--gold:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }

        /* Safety */
        .sim-safety {
          font-size: 0.75rem; color: var(--text-dim, #666); text-align: center;
          padding: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05);
        }

        /* Error */
        .sim-error { font-size: 0.78rem; color: #f87171; margin: 0; }

        /* Skeleton */
        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        /* Modal */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .modal-box {
          background: var(--card, #1a0535); border-radius: var(--radius, 12px);
          border: 1px solid rgba(244,114,182,0.2); padding: 1.5rem;
          max-width: 380px; width: 100%; text-align: center;
          display: flex; flex-direction: column; gap: 0.75rem;
        }
        .modal-emoji { font-size: 2.5rem; }
        .modal-title { font-size: 1rem; font-weight: 900; color: var(--text, #fff); margin: 0; }
        .modal-desc { font-size: 0.85rem; color: var(--text-muted, #aaa); margin: 0; }
        .modal-actions { display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}
