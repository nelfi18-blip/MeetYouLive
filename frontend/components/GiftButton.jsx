"use client";

import { useState, useEffect } from "react";
import GiftEffect from "@/components/GiftEffect";
import { RARITY_STYLES } from "@/lib/giftConstants";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function GiftButton({ receiverId, liveId, context, onGiftSent }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [effectGift, setEffectGift] = useState(null); // gift effect overlay

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
          contextId: liveId || null,
          message: selected.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al enviar el regalo");
        return;
      }
      setSuccess(`¡Enviaste ${selected.icon} ${selected.name}!`);
      setEffectGift(selected);
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

  const rStyle = (g) => RARITY_STYLES[g.rarity] || RARITY_STYLES.common;

  return (
    <div className="gift-btn-wrap">
      <button className="gift-trigger-btn" onClick={() => setOpen((v) => !v)} aria-label="Enviar regalo">
        🎁 <span>Regalar</span>
      </button>

      {open && (
        <>
          <div className="gift-overlay" onClick={() => setOpen(false)} />
          <div className="gift-panel">
            <div className="gift-panel-header">
              <span className="gift-panel-title">🎁 Enviar regalo</span>
              <button className="gift-close-btn" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
            </div>

            {error && <div className="gift-feedback gift-feedback-error">{error}</div>}
            {success && <div className="gift-feedback gift-feedback-success">{success}</div>}

            <div className="gift-catalog">
              {catalog.map((g) => {
                const rs = rStyle(g);
                const isSelected = selected?._id === g._id;
                return (
                  <button
                    key={g._id}
                    className={`gift-item${isSelected ? " gift-item-selected" : ""}`}
                    style={{
                      "--rarity-color": rs.color,
                      "--rarity-glow": rs.glow,
                    }}
                    onClick={() => setSelected(g)}
                  >
                    <span className="gift-rarity-dot" title={rs.label} />
                    <span className="gift-item-icon">{g.icon}</span>
                    <span className="gift-item-name">{g.name}</span>
                    <span className="gift-item-cost">🪙 {g.coinCost}</span>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="gift-confirm-bar">
                <span className="gift-confirm-text">
                  {selected.icon} <strong>{selected.name}</strong> — {selected.coinCost} 🪙
                  <em className="gift-rarity-label" style={{ color: rStyle(selected).color }}>
                    {" "}· {rStyle(selected).label}
                  </em>
                </span>
              </div>
            )}

            <button
              className="gift-send-btn"
              onClick={send}
              disabled={!selected || loading}
            >
              {loading ? "Enviando…" : selected ? `Enviar ${selected.icon} · ${selected.coinCost} 🪙` : "Selecciona un regalo"}
            </button>
          </div>
        </>
      )}

      {/* Elegant confirmation animation for profile / private-call context */}
      {effectGift && (
        <div className="gift-effect-anchor">
          <GiftEffect
            gift={effectGift}
            senderName="Tú"
            context={context === "live" ? "live" : "profile"}
            onDone={() => setEffectGift(null)}
          />
        </div>
      )}

      <style jsx>{`
        .gift-btn-wrap {
          position: relative;
          display: inline-block;
        }

        .gift-overlay {
          position: fixed;
          inset: 0;
          z-index: 98;
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
          background: rgba(224,64,251,0.22);
          border-color: rgba(224,64,251,0.65);
          box-shadow: 0 0 12px rgba(224,64,251,0.25);
        }

        .gift-panel {
          position: absolute;
          bottom: calc(100% + 10px);
          left: 0;
          z-index: 99;
          width: 320px;
          background: rgba(10,4,24,0.97);
          border: 1px solid rgba(224,64,251,0.25);
          border-radius: var(--radius);
          padding: 1.1rem;
          box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 30px rgba(139,92,246,0.12);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          backdrop-filter: blur(12px);
        }

        .gift-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .gift-panel-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: 0.02em;
        }

        .gift-close-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border);
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.8rem;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all var(--transition);
          font-family: inherit;
        }

        .gift-close-btn:hover {
          background: rgba(255,255,255,0.12);
          color: var(--text);
        }

        .gift-catalog {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
        }

        .gift-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          padding: 0.65rem 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
          position: relative;
        }

        .gift-item:hover {
          border-color: var(--rarity-color);
          background: rgba(255,255,255,0.04);
          box-shadow: 0 0 10px var(--rarity-glow);
          transform: translateY(-2px);
        }

        .gift-item-selected {
          border-color: var(--rarity-color) !important;
          background: rgba(255,255,255,0.06) !important;
          box-shadow: 0 0 16px var(--rarity-glow) !important;
        }

        .gift-rarity-dot {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--rarity-color);
          box-shadow: 0 0 4px var(--rarity-glow);
        }

        .gift-item-icon { font-size: 1.6rem; line-height: 1; }

        .gift-item-name {
          font-size: 0.62rem;
          color: var(--text-muted);
          font-weight: 700;
          text-align: center;
          line-height: 1.2;
        }

        .gift-item-cost {
          font-size: 0.62rem;
          color: #fbbf24;
          font-weight: 600;
        }

        .gift-confirm-bar {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-sm);
          padding: 0.5rem 0.75rem;
        }

        .gift-confirm-text {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .gift-confirm-text strong {
          color: var(--text);
          font-weight: 700;
        }

        .gift-rarity-label {
          font-style: normal;
          font-weight: 600;
          font-size: 0.75rem;
        }

        .gift-send-btn {
          width: 100%;
          padding: 0.75rem;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--grad-primary);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: filter 0.2s ease, box-shadow 0.2s ease;
          font-family: inherit;
        }

        .gift-send-btn:hover:not(:disabled) {
          filter: brightness(1.12);
          box-shadow: 0 0 16px rgba(255,15,138,0.4);
        }

        .gift-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .gift-feedback {
          font-size: 0.8rem;
          font-weight: 600;
          border-radius: var(--radius-sm);
          padding: 0.45rem 0.7rem;
          text-align: center;
        }

        .gift-feedback-error {
          color: #f87171;
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.25);
        }

        .gift-feedback-success {
          color: #4ade80;
          background: rgba(74,222,128,0.1);
          border: 1px solid rgba(74,222,128,0.25);
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

        .gift-effect-anchor {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          z-index: 300;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
