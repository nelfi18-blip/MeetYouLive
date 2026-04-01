"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function GiftButton({ receiverId, liveId, context, onGiftSent }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch(`${API_URL}/api/gifts`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setCatalog)
      .catch((err) => setError(`No se pudo cargar el catálogo de regalos (${err.message})`));
  }, [open]);

  const send = async () => {
    if (!selected) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/gifts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId,
          giftId: selected._id,
          liveId,
          context: context || (liveId ? "live" : "profile"),
          message: selected.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al enviar el regalo");
        return;
      }
      setSuccess(`¡Enviaste ${selected.icon} ${selected.name}!`);
      setSelected(null);
      if (onGiftSent) onGiftSent(data);
      setTimeout(() => {
        setSuccess("");
        setOpen(false);
      }, 2000);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gift-btn-wrap">
      <button className="gift-trigger-btn" onClick={() => setOpen((v) => !v)} aria-label="Enviar regalo">
        🎁 <span>Regalar</span>
      </button>

      {open && (
        <div className="gift-panel">
          <div className="gift-panel-header">
            <span className="gift-panel-title">Elige un regalo</span>
            <button className="gift-close-btn" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
          </div>

          {error && <div className="gift-error">{error}</div>}
          {success && <div className="gift-success">{success}</div>}

          <div className="gift-catalog">
            {catalog.map((g) => (
              <button
                key={g._id}
                className={`gift-item${selected?._id === g._id ? " gift-item-selected" : ""}`}
                onClick={() => setSelected(g)}
              >
                <span className="gift-item-icon">{g.icon}</span>
                <span className="gift-item-name">{g.name}</span>
                <span className="gift-item-cost">🪙 {g.coinCost}</span>
              </button>
            ))}
          </div>

          <button
            className="gift-send-btn"
            onClick={send}
            disabled={!selected || loading}
          >
            {loading ? "Enviando…" : selected ? `Enviar ${selected.icon} (${selected.coinCost} 🪙)` : "Selecciona un regalo"}
          </button>
        </div>
      )}

      <style jsx>{`
        .gift-btn-wrap {
          position: relative;
          display: inline-block;
        }

        .gift-trigger-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.55rem 1.1rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(224,64,251,0.35);
          background: rgba(224,64,251,0.1);
          color: var(--text);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
        }

        .gift-trigger-btn:hover {
          background: rgba(224,64,251,0.2);
          border-color: rgba(224,64,251,0.6);
        }

        .gift-panel {
          position: absolute;
          bottom: calc(100% + 10px);
          left: 0;
          z-index: 100;
          width: 300px;
          background: var(--bg-2, #1a0f2e);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1rem;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .gift-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .gift-panel-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text);
        }

        .gift-close-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0.2rem 0.4rem;
          border-radius: var(--radius-sm);
          transition: color var(--transition);
          font-family: inherit;
        }

        .gift-close-btn:hover { color: var(--text); }

        .gift-catalog {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.5rem;
        }

        .gift-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 0.6rem 0.3rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: transparent;
          cursor: pointer;
          transition: all var(--transition);
          font-family: inherit;
        }

        .gift-item:hover {
          border-color: rgba(224,64,251,0.4);
          background: rgba(224,64,251,0.08);
        }

        .gift-item-selected {
          border-color: rgba(224,64,251,0.7);
          background: rgba(224,64,251,0.15);
          box-shadow: 0 0 12px rgba(224,64,251,0.25);
        }

        .gift-item-icon { font-size: 1.5rem; }

        .gift-item-name {
          font-size: 0.65rem;
          color: var(--text-muted);
          font-weight: 600;
          text-align: center;
        }

        .gift-item-cost {
          font-size: 0.65rem;
          color: var(--text-dim);
          font-weight: 500;
        }

        .gift-send-btn {
          width: 100%;
          padding: 0.7rem;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          transition: filter var(--transition);
          font-family: inherit;
        }

        .gift-send-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .gift-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .gift-error {
          font-size: 0.8rem;
          color: var(--error, #f87171);
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.25);
          border-radius: var(--radius-sm);
          padding: 0.4rem 0.65rem;
        }

        .gift-success {
          font-size: 0.8rem;
          color: var(--accent-green, #34d399);
          background: rgba(52,211,153,0.1);
          border: 1px solid rgba(52,211,153,0.25);
          border-radius: var(--radius-sm);
          padding: 0.4rem 0.65rem;
          text-align: center;
        }

        @media (max-width: 480px) {
          .gift-panel {
            position: fixed;
            bottom: 70px;
            left: 0.75rem;
            right: 0.75rem;
            width: auto;
          }
        }
      `}</style>
    </div>
  );
}
