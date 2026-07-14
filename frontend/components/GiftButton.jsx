"use client";

import { useState, useEffect } from "react";
import { BUNDLE_CONFIG, bundleTotal, bundleSavings } from "../lib/giftBundles";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const GIFT_SLUG_RE = /^[a-z0-9-]+$/i;
const VALID_GIFT_CONTEXTS = new Set(["live", "profile", "private_call"]);

const resolveGiftContext = (context, liveId) =>
  VALID_GIFT_CONTEXTS.has(context) ? context : liveId ? "live" : "profile";

const RARITY_STYLES = {
  common:    { color: "#94a3b8", glow: "rgba(148,163,184,0.35)",  label: "Común"     },
  uncommon:  { color: "#4ade80", glow: "rgba(74,222,128,0.35)",   label: "Poco común" },
  rare:      { color: "#60a5fa", glow: "rgba(96,165,250,0.4)",    label: "Raro"      },
  epic:      { color: "#c084fc", glow: "rgba(192,132,252,0.45)",  label: "Épico"     },
  legendary: { color: "#fbbf24", glow: "rgba(251,191,36,0.45)",   label: "Legendario" },
  mythic:    { color: "#f43f5e", glow: "rgba(244,63,94,0.5)",     label: "Mítico"    },
};

const buildSendLabel = (gift, qty) => {
  const total = bundleTotal(gift.coinCost, qty);
  const savings = bundleSavings(gift.coinCost, qty);
  const bundleEmoji = BUNDLE_CONFIG[qty] ? ` ${BUNDLE_CONFIG[qty].emoji}` : "";
  const savingsText = savings > 0 ? ` (ahorras ${savings}🪙)` : "";
  return `Enviar ${gift.icon}${qty > 1 ? ` x${qty}` : ""}${bundleEmoji} · ${total} 🪙${savingsText}`;
};

export default function GiftButton({ receiverId, liveId, context, onGiftSent }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState(1);
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
    if (!OBJECT_ID_RE.test(String(receiverId || ""))) {
      setError("Destinatario inválido");
      return;
    }
    if (!selected?.slug || !GIFT_SLUG_RE.test(String(selected.slug))) {
      setError("Regalo inválido");
      return;
    }

    setLoading(true);
    const totalCost = bundleTotal(selected.coinCost, quantity);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/gifts/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId,
          giftSlug: selected.slug,
          quantity,
          context: resolveGiftContext(context, liveId),
          contextId: liveId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al enviar el regalo");
        return;
      }
      const comboLabel = quantity > 1 ? `x${quantity} ` : "";
      setSuccess(`¡Enviaste ${comboLabel}${selected.icon} ${selected.name}! (${totalCost} 🪙)`);
      setSelected(null);
      setQuantity(1);
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
                  {selected.icon} <strong>{selected.name}</strong>
                  <em className="gift-rarity-label" style={{ color: rStyle(selected).color }}>
                    {" "}· {rStyle(selected).label}
                  </em>
                </span>
              </div>
            )}

            <div className="gift-qty-row" role="group" aria-label="Cantidad">
              {[1, 5, 10, 50].map((q) => {
                const bundle = BUNDLE_CONFIG[q];
                return (
                  <button
                    key={q}
                    className={`gift-qty-btn${quantity === q ? " gift-qty-btn-active" : ""}${bundle ? " gift-qty-btn-bundle" : ""}`}
                    onClick={() => setQuantity(q)}
                    aria-pressed={quantity === q}
                  >
                    x{q}
                    {bundle && (
                      <span className="gift-qty-bundle-badge">{bundle.emoji} -{bundle.discountPct}%</span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              className="gift-send-btn"
              onClick={send}
              disabled={!selected || loading}
            >
              {loading
                ? "Enviando…"
                : selected
                  ? buildSendLabel(selected, quantity)
                  : "Selecciona un regalo"}
            </button>
          </div>
        </>
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

        .gift-qty-row {
          display: flex;
          gap: 0.35rem;
        }

        .gift-qty-btn {
          padding: 0.3rem 0.65rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.5);
          font-size: 0.72rem;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
          letter-spacing: 0.02em;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.05rem;
          line-height: 1.2;
        }

        .gift-qty-bundle-badge {
          font-size: 0.54rem;
          font-weight: 900;
          opacity: 0.85;
          line-height: 1;
        }

        .gift-qty-btn-bundle {
          border-color: rgba(245,158,11,0.35);
        }

        .gift-qty-btn-bundle.gift-qty-btn-active {
          background: linear-gradient(135deg,rgba(245,158,11,0.25),rgba(251,191,36,0.15));
          border-color: #fbbf24;
          color: #fbbf24;
          box-shadow: 0 0 8px rgba(251,191,36,0.3);
        }

        .gift-qty-btn:hover {
          background: rgba(255,255,255,0.09);
          border-color: rgba(224,64,251,0.45);
          color: #fff;
        }

        .gift-qty-btn-active {
          background: rgba(224,64,251,0.18);
          border-color: #e040fb;
          color: #e040fb;
          box-shadow: 0 0 8px rgba(224,64,251,0.3);
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
      `}</style>
    </div>
  );
}
