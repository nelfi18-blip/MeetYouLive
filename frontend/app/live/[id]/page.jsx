"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const LIVE_PROVIDER_KEY = process.env.NEXT_PUBLIC_LIVE_PROVIDER_KEY;

export default function LiveViewerPage() {
  const { id } = useParams();
  const [live, setLive] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Gift state
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftCatalog, setGiftCatalog] = useState([]);
  const [selectedGift, setSelectedGift] = useState(null);
  const [giftMessage, setGiftMessage] = useState("");
  const [sendingGift, setSendingGift] = useState(false);
  const [giftError, setGiftError] = useState("");
  const [giftSuccess, setGiftSuccess] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    fetch(`${API_URL}/api/lives/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar el directo");
        return res.json();
      })
      .then((data) => setLive(data))
      .catch(() => setError("Directo no encontrado o ya finalizado"));
  }, [id]);

  const openGiftModal = useCallback(() => {
    setGiftError("");
    setGiftSuccess("");
    setSelectedGift(null);
    setGiftMessage("");
    if (giftCatalog.length === 0) {
      fetch(`${API_URL}/api/gifts`)
        .then((r) => r.ok ? r.json() : [])
        .then((data) => setGiftCatalog(data))
        .catch(() => {});
    }
    setShowGiftModal(true);
  }, [giftCatalog.length]);

  const handleSendGift = async () => {
    if (!token) { setGiftError("Debes iniciar sesión para enviar regalos."); return; }
    if (!selectedGift) { setGiftError("Selecciona un regalo."); return; }
    if (!live?.user?._id) { setGiftError("No se pudo identificar al creador."); return; }
    setSendingGift(true);
    setGiftError("");
    setGiftSuccess("");
    try {
      const res = await fetch(`${API_URL}/api/gifts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId: live.user._id,
          liveId: id,
          amount: selectedGift.coins,
          message: giftMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al enviar el regalo");
      setGiftSuccess(`¡Enviaste ${selectedGift.icon} ${selectedGift.name} a @${live.user.username || live.user.name}!`);
      setSelectedGift(null);
      setGiftMessage("");
      setTimeout(() => { setShowGiftModal(false); setGiftSuccess(""); }, 2200);
    } catch (err) {
      setGiftError(err.message);
    } finally {
      setSendingGift(false);
    }
  };

  const handleJoin = async () => {
    if (!token) {
      setJoinError("Debes iniciar sesión para unirte a este directo privado.");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const res = await fetch(`${API_URL}/api/lives/${id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.message || "No se pudo unir al directo");
        return;
      }
      setLive(data);
    } catch {
      setJoinError("No se pudo conectar con el servidor");
    } finally {
      setJoining(false);
    }
  };

  if (error) {
    return (
      <div className="viewer-error">
        <span style={{ fontSize: "3rem" }}>📡</span>
        <h2>Este directo ya terminó</h2>
        <p>{error}</p>
        <Link href="/live" className="btn btn-primary">← Volver a directos</Link>
        <style jsx>{`
          .viewer-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 0.75rem;
            text-align: center;
          }
          .viewer-error h2 { color: var(--text); font-size: 1.4rem; }
          .viewer-error p { color: var(--text-muted); }
        `}</style>
      </div>
    );
  }

  if (!live) {
    return (
      <div className="viewer-loading">
        <div className="spinner" />
        <p>Cargando directo…</p>
        <style jsx>{`
          .viewer-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 1rem;
            color: var(--text-muted);
          }
          .spinner {
            width: 44px;
            height: 44px;
            border: 3px solid rgba(255,15,138,0.15);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Private stream paywall
  if (live.isPrivate && !live.hasAccess) {
    return (
      <div className="viewer-page">
        <div className="paywall card">
          <div className="paywall-icon">🔒</div>
          <h2 className="paywall-title">{live.title}</h2>
          <p className="paywall-streamer">por @{live.user?.username || "anónimo"}</p>
          <p className="paywall-desc">Este directo es privado. Paga la entrada con monedas para acceder.</p>
          <div className="paywall-cost">
            <span className="coin-icon">🪙</span>
            <span className="cost-num">{live.entryCost}</span>
            <span className="cost-label">monedas</span>
          </div>
          {joinError && <div className="error-banner">{joinError}</div>}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? "Procesando…" : `🪙 Pagar ${live.entryCost} monedas y entrar`}
          </button>
          {!token && (
            <p className="paywall-login-hint">
              <Link href="/login" className="link-accent">Inicia sesión</Link> para comprar la entrada.
            </p>
          )}
          <Link href="/live" className="btn btn-secondary">← Volver a directos</Link>
        </div>

        <style jsx>{`
          .viewer-page { display: flex; flex-direction: column; gap: 1rem; }
          .paywall {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 3rem 2rem;
            max-width: 480px;
            margin: 2rem auto;
            text-align: center;
          }
          .paywall-icon { font-size: 3rem; }
          .paywall-title { font-size: 1.4rem; font-weight: 800; color: var(--text); margin: 0; }
          .paywall-streamer { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
          .paywall-desc { color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
          .paywall-cost {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(139,92,246,0.1);
            border: 1px solid rgba(139,92,246,0.3);
            border-radius: var(--radius-pill);
            padding: 0.5rem 1.5rem;
          }
          .coin-icon { font-size: 1.4rem; }
          .cost-num { font-size: 1.75rem; font-weight: 900; color: #a78bfa; }
          .cost-label { font-size: 0.85rem; color: var(--text-muted); font-weight: 600; }
          .error-banner {
            width: 100%;
            background: rgba(244,67,54,0.1);
            border: 1px solid var(--error);
            color: var(--error);
            border-radius: var(--radius-sm);
            padding: 0.65rem 1rem;
            font-size: 0.85rem;
          }
          .paywall-login-hint { font-size: 0.8rem; color: var(--text-muted); }
          .link-accent { color: var(--accent); text-decoration: underline; }
        `}</style>
      </div>
    );
  }

  const playerUrl = `https://wl.cinectar.com/player/${LIVE_PROVIDER_KEY}/${live.streamKey}`;

  return (
    <div className="viewer-page">
      {/* Player */}
      <div className="player-wrap">
        <iframe
          src={playerUrl}
          allow="autoplay; fullscreen"
          allowFullScreen
          title={live.title}
          className="player-frame"
        />
      </div>

      {/* Info bar */}
      <div className="viewer-info card">
        <div className="viewer-info-left">
          <div className="viewer-user-row">
            <div className="avatar-placeholder" style={{ width: 44, height: 44, fontSize: "1.1rem" }}>
              {(live.user?.username || "?")[0].toUpperCase()}
            </div>
            <div>
              <div className="viewer-streamer">@{live.user?.username || "anónimo"}</div>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.25rem" }}>
                <span className="badge badge-live">EN VIVO</span>
                {live.isPrivate && (
                  <span className="badge badge-private">🔒 PRIVADO</span>
                )}
              </div>
            </div>
          </div>
          <div>
            <h1 className="viewer-title">{live.title}</h1>
            {live.description && <p className="viewer-desc">{live.description}</p>}
          </div>
        </div>
        <div className="viewer-actions">
          {live.viewers && (
            <div className="viewer-count-badge">
              <span>👁</span>
              <span>{live.viewers} viendo</span>
            </div>
          )}
          <button className="btn btn-primary" onClick={openGiftModal}>
            🎁 Enviar regalo
          </button>
          <Link href="/live" className="btn btn-secondary">
            ← Directos
          </Link>
        </div>
      </div>

      {/* Gift Modal */}
      {showGiftModal && (
        <>
          <div className="gift-overlay" onClick={() => setShowGiftModal(false)} />
          <div className="gift-modal">
            <div className="gift-modal-header">
              <h2 className="gift-modal-title">🎁 Enviar regalo</h2>
              <button className="gift-modal-close" onClick={() => setShowGiftModal(false)}>✕</button>
            </div>
            <p className="gift-modal-sub">Elige un regalo para @{live.user?.username || "el creador"}</p>

            {giftSuccess && <div className="gift-alert gift-success">{giftSuccess}</div>}
            {giftError && <div className="gift-alert gift-error">{giftError}</div>}

            {!token && (
              <div className="gift-alert gift-error">
                <Link href="/login" style={{ color: "inherit", textDecoration: "underline" }}>Inicia sesión</Link> para enviar regalos.
              </div>
            )}

            <div className="gift-catalog">
              {giftCatalog.map((gift) => (
                <button
                  key={gift.id}
                  type="button"
                  className={`gift-item${selectedGift?.id === gift.id ? " selected" : ""}`}
                  onClick={() => setSelectedGift(gift)}
                >
                  <span className="gift-icon">{gift.icon}</span>
                  <span className="gift-name">{gift.name}</span>
                  <span className="gift-cost">🪙 {gift.coins}</span>
                </button>
              ))}
            </div>

            <div className="gift-message-row">
              <input
                type="text"
                className="gift-message-input"
                placeholder="Mensaje opcional…"
                value={giftMessage}
                onChange={(e) => setGiftMessage(e.target.value)}
                maxLength={100}
              />
            </div>

            <button
              className="btn btn-primary btn-lg gift-send-btn"
              onClick={handleSendGift}
              disabled={sendingGift || !selectedGift || !token}
            >
              {sendingGift
                ? "Enviando…"
                : selectedGift
                ? `Enviar ${selectedGift.icon} ${selectedGift.name} — ${selectedGift.coins} 🪙`
                : "Selecciona un regalo"}
            </button>

            <p className="gift-coins-hint">
              ¿Necesitas más monedas?{" "}
              <Link href="/coins" className="gift-coins-link">Comprar monedas</Link>
            </p>
          </div>
        </>
      )}

      <style jsx>{`
        .viewer-page { display: flex; flex-direction: column; gap: 1rem; }

        .player-wrap {
          position: relative;
          width: 100%;
          padding-top: 56.25%;
          background: #000;
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid rgba(255,15,138,0.2);
          box-shadow: 0 0 40px rgba(255,15,138,0.15);
        }

        .player-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: none;
        }

        .viewer-info {
          display: flex;
          align-items: flex-start;
          gap: 1.5rem;
          flex-wrap: wrap;
          justify-content: space-between;
          background: rgba(20,8,42,0.9);
          border: 1px solid var(--border-glow);
          border-radius: var(--radius);
          padding: 1.25rem;
          backdrop-filter: blur(16px);
          box-shadow: var(--shadow);
        }

        .viewer-info-left {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex: 1;
        }

        .viewer-user-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .viewer-streamer {
          font-weight: 700;
          color: var(--text);
          font-size: 0.95rem;
        }

        .viewer-title {
          font-size: 1.35rem;
          font-weight: 800;
          background: linear-gradient(135deg, #F8F4FF, #FF4FD8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .viewer-desc { color: var(--text-muted); font-size: 0.9rem; }

        .viewer-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          flex-shrink: 0;
        }

        .viewer-count-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(26,11,46,0.8);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 0.4rem 1rem;
          font-size: 0.85rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .badge-private {
          background: rgba(139,92,246,0.15);
          color: #a78bfa;
          border: 1px solid rgba(139,92,246,0.35);
          border-radius: var(--radius-pill);
          padding: 0.15rem 0.55rem;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        /* ── Gift Modal ─────────────────────────── */
        .gift-overlay {
          position: fixed;
          inset: 0;
          z-index: 300;
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(4px);
        }

        .gift-modal {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          z-index: 400;
          width: min(480px, 100vw);
          background: rgba(12,6,28,0.98);
          border: 1px solid rgba(224,64,251,0.25);
          border-bottom: none;
          border-radius: var(--radius) var(--radius) 0 0;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          box-shadow: var(--shadow), 0 -8px 40px rgba(139,92,246,0.15);
          animation: slide-up 0.22s ease;
        }

        @keyframes slide-up {
          from { transform: translateX(-50%) translateY(100%); }
          to   { transform: translateX(-50%) translateY(0); }
        }

        .gift-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .gift-modal-title {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text);
        }

        .gift-modal-close {
          background: rgba(255,255,255,0.07);
          border: 1px solid var(--border);
          border-radius: 50%;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.85rem;
          transition: all var(--transition);
        }

        .gift-modal-close:hover { background: rgba(255,255,255,0.12); color: var(--text); }

        .gift-modal-sub {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: -0.5rem 0 0;
        }

        .gift-alert {
          padding: 0.6rem 0.875rem;
          border-radius: var(--radius-sm);
          font-size: 0.82rem;
          font-weight: 600;
        }

        .gift-success {
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.3);
          color: #4ade80;
        }

        .gift-error {
          background: rgba(244,67,54,0.08);
          border: 1px solid var(--error);
          color: var(--error);
        }

        .gift-catalog {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
          gap: 0.5rem;
        }

        .gift-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 0.65rem 0.25rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--transition);
        }

        .gift-item:hover {
          border-color: rgba(224,64,251,0.35);
          background: rgba(224,64,251,0.05);
        }

        .gift-item.selected {
          border-color: var(--accent);
          background: rgba(255,15,138,0.1);
          box-shadow: 0 0 12px rgba(255,15,138,0.25);
        }

        .gift-icon { font-size: 1.6rem; }
        .gift-name { font-size: 0.7rem; font-weight: 700; color: var(--text); }
        .gift-cost { font-size: 0.65rem; color: var(--accent-orange); font-weight: 600; }

        .gift-message-row { display: flex; }

        .gift-message-input {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          font-size: 0.875rem;
          padding: 0.6rem 0.875rem;
          outline: none;
          transition: border-color var(--transition);
        }

        .gift-message-input:focus { border-color: rgba(139,92,246,0.5); }
        .gift-message-input::placeholder { color: var(--text-dim); }

        .gift-send-btn { align-self: stretch; }

        .gift-coins-hint {
          text-align: center;
          font-size: 0.78rem;
          color: var(--text-dim);
        }

        .gift-coins-link {
          color: var(--accent-orange);
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
