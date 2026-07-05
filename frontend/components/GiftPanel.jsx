"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BUNDLE_CONFIG, bundleTotal, bundleSavings } from "../lib/giftBundles";
import { getGiftTier } from "../lib/giftTiers";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/* ─── Rarity visual config ─────────────────────────────────────────────── */
const RARITY = {
  common:    { color: "#94a3b8", glow: "rgba(148,163,184,0.45)", label: "Común",      gradient: "linear-gradient(135deg,#475569,#64748b)" },
  uncommon:  { color: "#4ade80", glow: "rgba(74,222,128,0.45)",  label: "Poco común", gradient: "linear-gradient(135deg,#16a34a,#4ade80)" },
  rare:      { color: "#60a5fa", glow: "rgba(96,165,250,0.5)",   label: "Raro",       gradient: "linear-gradient(135deg,#2563eb,#60a5fa)" },
  epic:      { color: "#c084fc", glow: "rgba(192,132,252,0.55)", label: "Épico",      gradient: "linear-gradient(135deg,#7c3aed,#c084fc)" },
  legendary: { color: "#fbbf24", glow: "rgba(251,191,36,0.55)",  label: "Legendario", gradient: "linear-gradient(135deg,#d97706,#fbbf24)" },
  mythic:    { color: "#f43f5e", glow: "rgba(244,63,94,0.6)",    label: "Mítico",     gradient: "linear-gradient(135deg,#be123c,#f43f5e)" },
};



const CATEGORIES = [
  // ═══ NEW 3-TIER SYSTEM ═══
  { id: "basic",      label: "💝 Básicos",       filter: (g) => getGiftTier(g) === "basic" },
  { id: "premium",    label: "⭐ Premium",       filter: (g) => getGiftTier(g) === "premium" },
  { id: "super",      label: "🔥 Super",         filter: (g) => getGiftTier(g) === "super" },
  
  // ═══ CATEGORY-BASED FILTERS (SECONDARY) ═══
  { id: "emotional",  label: "💖 Emocional",    filter: (g) => g.category === "emotional" },
  { id: "energy",     label: "⚡ Energía",      filter: (g) => g.category === "energy" },
  { id: "luxury",     label: "💎 Lujo",         filter: (g) => g.category === "luxury" },
  { id: "show",       label: "🎆 Espectáculo",  filter: (g) => g.category === "show" },
  { id: "exclusive",  label: "🌀 Exclusivo",    filter: (g) => g.category === "exclusive" },
];

/**
 * GiftPanel — premium full-screen gift selection overlay.
 *
 * Props:
 *  - receiverId  {string}   Target user id
 *  - liveId      {string}   Live stream id (optional)
 *  - context     {string}   "live" | "profile" (optional)
 *  - onClose     {()=>void} Callback to close the panel
 *  - onGiftSent  {(data)=>void} Callback after successful send
 */
export default function GiftPanel({ receiverId, liveId, context, onClose, onGiftSent, initialCoinBalance, isOwnLive, visualOnly = false }) {
  const router = useRouter();

  /* ── Auth check ────────────────────────────────────────────────────── */
  const [isLoggedIn] = useState(() =>
    typeof window !== "undefined" && !!localStorage.getItem("token")
  );

  /* ── State ─────────────────────────────────────────────────────────── */
  const [catalog, setCatalog]           = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  const [coinBalance, setCoinBalance]   = useState(visualOnly ? null : initialCoinBalance ?? null);
  const [activeCategory, setActiveCategory] = useState("basic");
  const [selectedGift, setSelectedGift] = useState(null);
  const [quantity, setQuantity]         = useState(1);

  const [showConfirm, setShowConfirm]   = useState(false);
  const [sending, setSending]           = useState(false);
  const [sendError, setSendError]       = useState("");
  const [sendSuccess, setSendSuccess]   = useState("");

  const [insufficientCoins, setInsufficientCoins] = useState(false);

  /* ── Load catalog + coin balance ───────────────────────────────────── */
  useEffect(() => {
    const token = localStorage.getItem("token");

    // Fetch gift catalog
    fetch(`${API_URL}/api/gifts`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => setCatalog(data))
      .catch((err) => setCatalogError(`No se pudo cargar el catálogo de regalos (${err.message})`))
      .finally(() => setLoadingCatalog(false));

    // Fetch coin balance only if not provided by parent and user is logged in
    if (!visualOnly && token && initialCoinBalance === undefined) {
      fetch(`${API_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data?.coins !== undefined) setCoinBalance(data.coins); })
        .catch(() => {});
    }
  // Intentionally run only once on mount. `initialCoinBalance` is used only as an
  // initial seed (captured in useState), so re-running when it changes would cause
  // duplicate fetches if the parent updates the prop later.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualOnly]);

  /* ── Filtered gifts for active category ────────────────────────────── */
  const filteredGifts = useCallback(() => {
    const cat = CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat) return catalog;
    return catalog.filter(cat.filter);
  }, [catalog, activeCategory]);

  /* ── Tap a gift card → check login, balance, show confirm ──────────── */
  const handleSelectGift = (gift) => {
    setSendError("");
    setSendSuccess("");
    setInsufficientCoins(false);

    if (isOwnLive) {
      setSendError("No puedes enviar regalos a tu propio directo");
      return;
    }

    if (!visualOnly && !isLoggedIn) {
      setSendError("Debes iniciar sesión para enviar regalos");
      return;
    }

    // RESTRICTION: Super gifts only allowed outside visual preview mode in live context
    if (!visualOnly && gift.isSuper && context !== "live" && !liveId) {
      setSendError("Este regalo solo se puede enviar en directo 🔥");
      return;
    }

    if (!visualOnly && coinBalance !== null && coinBalance < bundleTotal(gift.coinCost, quantity)) {
      setSelectedGift(gift);
      setInsufficientCoins(true);
      return;
    }
    setSelectedGift(gift);
    setShowConfirm(true);
  };

  /* ── Send gift ──────────────────────────────────────────────────────── */
  const handleConfirmSend = async () => {
    if (!selectedGift) return;
    setSending(true);
    setSendError("");

    const totalCost = bundleTotal(selectedGift.coinCost, quantity);

    try {
      if (visualOnly) {
        const data = {
          _id: `visual-${Date.now()}`,
          visualOnly: true,
          quantity,
          coinCost: totalCost,
          context: context || (liveId ? "live" : "profile"),
          contextId: liveId || null,
          giftCatalogItem: {
            _id: selectedGift._id,
            name: selectedGift.name,
            slug: selectedGift.slug,
            icon: selectedGift.icon,
            coinCost: selectedGift.coinCost,
            rarity: selectedGift.rarity,
            category: selectedGift.category,
            type: selectedGift.type,
            isSuper: selectedGift.isSuper,
            animationType: selectedGift.animationType,
            soundUrl: selectedGift.soundUrl,
          },
        };
        const comboLabel = quantity > 1 ? ` x${quantity} combo` : "";
        setSendSuccess(`🎁 Vista previa enviada${comboLabel}`);
        setShowConfirm(false);
        setSelectedGift(null);
        setQuantity(1);
        if (onGiftSent) onGiftSent(data);
        setTimeout(() => setSendSuccess(""), 3000);
        return;
      }

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/gifts/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId,
          giftSlug: selectedGift.slug,
          quantity,
          context: context || (liveId ? "live" : "profile"),
          contextId: liveId || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 402 || (data.message || "").toLowerCase().includes("coin")) {
          setShowConfirm(false);
          setInsufficientCoins(true);
        } else {
          setSendError(data.message || "Error al enviar el regalo");
        }
        return;
      }

      // Success
      setCoinBalance((prev) => (prev !== null ? prev - totalCost : prev));
      const comboLabel = quantity > 1 ? ` x${quantity} combo` : "";
      setSendSuccess(`🎁 ¡Regalo enviado!${comboLabel}`);
      setShowConfirm(false);
      setSelectedGift(null);
      setQuantity(1);
      if (onGiftSent) onGiftSent(data);
      setTimeout(() => setSendSuccess(""), 3000);
    } catch {
      setSendError("No se pudo conectar con el servidor");
    } finally {
      setSending(false);
    }
  };

  /* ── Helpers ────────────────────────────────────────────────────────── */
  const rs = (g) => RARITY[g?.rarity] || RARITY.common;
  const gifts = filteredGifts();

  /* ──────────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* Backdrop */}
      <div className="gp-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="gp-panel" role="dialog" aria-modal="true" aria-label="Panel de regalos">

        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="gp-header">
          <div className="gp-header-left">
            <span className="gp-title">🎁 Enviar regalo</span>
            {visualOnly && (
              <span className="gp-visual-mode">Modo visual · sin cobro</span>
            )}
            {coinBalance !== null && (
              <span className="gp-balance" aria-label={`Saldo: ${coinBalance.toLocaleString()} monedas`}>
                🪙 {coinBalance.toLocaleString()} monedas
              </span>
            )}
          </div>
          <div className="gp-header-right">
            {!visualOnly && (
              <button
                className="gp-buy-btn"
                onClick={() => router.push("/coins")}
                aria-label="Comprar monedas"
              >
                ＋ Comprar monedas
              </button>
            )}
            <button
              className="gp-close-btn"
              onClick={onClose}
              aria-label="Cerrar panel de regalos"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Category tabs ─────────────────────────────────────────── */}
        <div className="gp-tabs" role="tablist">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              role="tab"
              aria-selected={activeCategory === cat.id}
              className={`gp-tab${activeCategory === cat.id ? " gp-tab-active" : ""}`}
              onClick={() => { setActiveCategory(cat.id); setInsufficientCoins(false); setSendError(""); }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* ── Not logged in notice ───────────────────────────────────── */}
        {!visualOnly && !isLoggedIn && (
          <div className="gp-not-logged-in" role="alert">
            <span className="gp-nli-icon">🔐</span>
            <div className="gp-nli-text">
              <strong>Inicia sesión para enviar regalos</strong>
              <span>Crea una cuenta o inicia sesión para apoyar al creador.</span>
            </div>
            <button
              className="gp-insufficient-btn"
              onClick={() => router.push("/login")}
            >
              Iniciar sesión
            </button>
          </div>
        )}

        {/* ── Creator self-send notice ───────────────────────────────── */}
        {isOwnLive && (
          <div className="gp-self-notice" role="alert">
            <span className="gp-self-notice-icon">🚫</span>
            <span>No puedes enviar regalos a tu propio directo.</span>
          </div>
        )}

        {/* ── Feedback banners ──────────────────────────────────────── */}
        {sendSuccess && (
          <div className="gp-feedback gp-feedback-success" role="status">
            {sendSuccess}
          </div>
        )}
        {sendError && (
          <div className="gp-feedback gp-feedback-error" role="alert">
            {sendError}
          </div>
        )}

        {/* ── Insufficient coins notice ──────────────────────────────── */}
        {insufficientCoins && selectedGift && (
          <div className="gp-insufficient" role="alert">
            <span className="gp-insufficient-icon">🪙</span>
            <div className="gp-insufficient-text">
              <strong>Monedas insuficientes</strong>
              <span>Necesitas {bundleTotal(selectedGift.coinCost, quantity).toLocaleString()} monedas para enviar {quantity > 1 ? `x${quantity} ` : ""}{selectedGift.icon} {selectedGift.name}.</span>
            </div>
            <button
              className="gp-insufficient-btn"
              onClick={() => router.push("/coins")}
            >
              Conseguir monedas
            </button>
          </div>
        )}

        {/* ── Gift grid ─────────────────────────────────────────────── */}
        <div className="gp-grid-wrap">
          {loadingCatalog ? (
            <div className="gp-loading">
              <span className="gp-spinner" />
              <span>Cargando regalos…</span>
            </div>
          ) : catalogError ? (
            <div className="gp-feedback gp-feedback-error">{catalogError}</div>
          ) : gifts.length === 0 ? (
            <div className="gp-empty">No hay regalos en esta categoría</div>
          ) : (
            <div className="gp-grid" role="list">
              {gifts.map((g) => {
                const r = rs(g);
                const isSelected = selectedGift?._id === g._id;
                const isSuperGift = g.isSuper;
                const isLiveContext = visualOnly || context === "live" || !!liveId;
                const isRestricted = isSuperGift && !isLiveContext;
                
                return (
                  <button
                    key={g._id}
                    role="listitem"
                    aria-label={`${g.name} — ${g.coinCost} monedas — ${r.label}${isRestricted ? " (solo en directo)" : ""}`}
                    aria-pressed={isSelected}
                    className={`gp-card${isSelected ? " gp-card-selected" : ""}${isRestricted ? " gp-card-restricted" : ""}`}
                    style={{
                      "--rc": r.color,
                      "--rg": r.glow,
                      "--rgrad": r.gradient,
                    }}
                    onClick={() => handleSelectGift(g)}
                  >
                    {/* Rarity glow overlay */}
                    <span className="gp-card-glow" />

                    {/* Super badge */}
                    {g.isSuper && (
                      <span className="gp-super-badge" title="¡Super Regalo!">
                        ⭐ SUPER
                      </span>
                    )}

                    {/* Rarity badge */}
                    <span className="gp-rarity-badge" style={{ background: r.gradient }}>
                      {r.label}
                    </span>
                    
                    {/* Live-only badge for super gifts in non-live context */}
                    {isRestricted && (
                      <span className="gp-live-only-badge" title="Este regalo solo se puede enviar en directo">
                        🔥 DIRECTO
                      </span>
                    )}

                    {/* Gift icon */}
                    <span className="gp-card-icon">{g.icon}</span>

                    {/* Gift name */}
                    <span className="gp-card-name">{g.name}</span>

                    {/* Coin cost */}
                    <span className="gp-card-cost">🪙 {g.coinCost.toLocaleString('es-ES')}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Quantity selector ─────────────────────────────────────── */}
        <div className="gp-qty-bar" role="group" aria-label="Cantidad de regalos">
          {[1, 5, 10, 50].map((q) => {
            const bundle = BUNDLE_CONFIG[q];
            return (
              <button
                key={q}
                className={`gp-qty-btn${quantity === q ? " gp-qty-btn-active" : ""}${bundle ? " gp-qty-btn-big" : ""}`}
                onClick={() => {
                  setQuantity(q);
                  // Re-check balance when quantity changes
                  if (selectedGift && coinBalance !== null && coinBalance < bundleTotal(selectedGift.coinCost, q)) {
                    setInsufficientCoins(true);
                  } else {
                    setInsufficientCoins(false);
                  }
                }}
                aria-pressed={quantity === q}
              >
                x{q}
                {bundle && (
                  <span className="gp-qty-bundle-badge">
                    {bundle.emoji} -{bundle.discountPct}%
                  </span>
                )}
              </button>
            );
          })}
          {selectedGift && (
            <span className="gp-qty-total">
              Total: 🪙 {bundleTotal(selectedGift.coinCost, quantity).toLocaleString()}
              {BUNDLE_CONFIG[quantity] && bundleSavings(selectedGift.coinCost, quantity) > 0 && (
                <span className="gp-qty-savings">
                  {" "}· Ahorras {bundleSavings(selectedGift.coinCost, quantity).toLocaleString()}🪙
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Confirmation modal ──────────────────────────────────────── */}
      {showConfirm && selectedGift && (
        <>
          <div className="gp-modal-backdrop" onClick={() => setShowConfirm(false)} />
          <div className="gp-modal" role="alertdialog" aria-modal="true" aria-label="Confirmar envío de regalo">
            {/* Rarity glow accent */}
            <div
              className="gp-modal-accent"
              style={{ background: rs(selectedGift).gradient }}
            />

            {/* Bundle banner */}
            {BUNDLE_CONFIG[quantity] && (
              <div className="gp-modal-bundle-banner">
                {BUNDLE_CONFIG[quantity].emoji} Bundle {BUNDLE_CONFIG[quantity].label} · -{BUNDLE_CONFIG[quantity].discountPct}%
              </div>
            )}

            <span className="gp-modal-icon">{selectedGift.icon}</span>
            <h3 className="gp-modal-title">{selectedGift.name}{quantity > 1 ? <span className="gp-modal-qty"> x{quantity}</span> : null}</h3>
            <span
              className="gp-modal-rarity"
              style={{ color: rs(selectedGift).color }}
            >
              {rs(selectedGift).label}
            </span>

            {quantity > 1 && (
              <div className="gp-modal-cost-row">
                <span className="gp-modal-cost-label">Precio unitario</span>
                <span className="gp-modal-cost-value">🪙 {selectedGift.coinCost}</span>
              </div>
            )}
            {BUNDLE_CONFIG[quantity] && (
              <div className="gp-modal-cost-row">
                <span className="gp-modal-cost-label">Precio sin bundle</span>
                <span className="gp-modal-cost-value gp-modal-cost-strikethrough">🪙 {(selectedGift.coinCost * quantity).toLocaleString()}</span>
              </div>
            )}
            <div className="gp-modal-cost-row">
              <span className="gp-modal-cost-label">{quantity > 1 ? "Total" : "Coste"}</span>
              <span className="gp-modal-cost-value gp-modal-cost-total">🪙 {bundleTotal(selectedGift.coinCost, quantity).toLocaleString()}</span>
            </div>
            {BUNDLE_CONFIG[quantity] && bundleSavings(selectedGift.coinCost, quantity) > 0 && (
              <div className="gp-modal-savings-row">
                <span className="gp-modal-savings-label">✨ Ahorras</span>
                <span className="gp-modal-savings-value">🪙 {bundleSavings(selectedGift.coinCost, quantity).toLocaleString()}</span>
              </div>
            )}

            {coinBalance !== null && (
              <div className="gp-modal-balance-row">
                <span className="gp-modal-balance-label">Tu saldo</span>
                <span className={`gp-modal-balance-value${coinBalance < bundleTotal(selectedGift.coinCost, quantity) ? " gp-balance-low" : ""}`}>🪙 {coinBalance.toLocaleString()}</span>
              </div>
            )}

            {visualOnly && (
              <div className="gp-visual-note">
                Vista previa Premium: no descuenta monedas, no activa Stripe y no genera payout.
              </div>
            )}

            {sendError && (
              <div className="gp-feedback gp-feedback-error" role="alert" style={{ marginTop: "0.5rem" }}>
                {sendError}
              </div>
            )}

            <div className="gp-modal-actions">
              <button
                className="gp-modal-cancel"
                onClick={() => { setShowConfirm(false); setSendError(""); }}
                disabled={sending}
              >
                Cancelar
              </button>
              <button
                className="gp-modal-confirm"
                onClick={handleConfirmSend}
                disabled={sending}
                aria-live="polite"
              >
                {sending ? (
                  <><span className="gp-btn-spinner" /> Enviando…</>
                ) : (
                  visualOnly
                    ? `Enviar visual ${selectedGift.icon}${quantity > 1 ? ` x${quantity}` : ""}`
                    : `Enviar ${selectedGift.icon}${quantity > 1 ? ` x${quantity}` : ""} · 🪙 ${bundleTotal(selectedGift.coinCost, quantity).toLocaleString()}`
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─────────────────── Styles ─────────────────────────────────── */}
      <style jsx>{`
        /* ── Backdrop ─────────────────────────────────────────────── */
        .gp-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(4px);
          z-index: 200;
          animation: gp-fade-in 0.2s ease;
        }

        /* ── Panel ────────────────────────────────────────────────── */
        .gp-panel {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 201;
          max-height: 78vh;
          background: linear-gradient(180deg, rgba(10,4,24,0.99) 0%, rgba(6,2,18,1) 100%);
          border-top: 1px solid rgba(139,92,246,0.3);
          border-radius: 20px 20px 0 0;
          padding: 0 0 env(safe-area-inset-bottom, 0);
          display: flex;
          flex-direction: column;
          box-shadow: 0 -8px 40px rgba(0,0,0,0.7), 0 -2px 0 rgba(139,92,246,0.2);
          animation: gp-slide-up 0.28s cubic-bezier(0.25,0.46,0.45,0.94);
          overflow: hidden;
        }

        /* ── Header ───────────────────────────────────────────────── */
        .gp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }

        .gp-header-left {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .gp-title {
          font-size: 1rem;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.02em;
        }

        .gp-balance {
          font-size: 0.78rem;
          color: #fbbf24;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .gp-visual-mode {
          font-size: 0.74rem;
          color: #67e8f9;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        .gp-header-right {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .gp-buy-btn {
          padding: 0.42rem 0.9rem;
          border-radius: 999px;
          background: linear-gradient(135deg,#d97706,#fbbf24);
          border: none;
          color: #1a0a00;
          font-size: 0.75rem;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: 0.02em;
          transition: filter 0.18s ease, box-shadow 0.18s ease;
          font-family: inherit;
          white-space: nowrap;
        }

        .gp-buy-btn:hover {
          filter: brightness(1.12);
          box-shadow: 0 0 14px rgba(251,191,36,0.45);
        }

        .gp-close-btn {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.55);
          font-size: 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.18s ease;
          font-family: inherit;
          flex-shrink: 0;
        }

        .gp-close-btn:hover {
          background: rgba(255,255,255,0.14);
          color: #fff;
        }

        /* ── Tabs ─────────────────────────────────────────────────── */
        .gp-tabs {
          display: flex;
          gap: 0.4rem;
          padding: 0.75rem 1.25rem 0.6rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .gp-tabs::-webkit-scrollbar { display: none; }

        .gp-tab {
          padding: 0.42rem 1rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.5);
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          white-space: nowrap;
          font-family: inherit;
          letter-spacing: 0.01em;
        }

        .gp-tab:hover {
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.8);
          border-color: rgba(255,255,255,0.2);
        }

        .gp-tab-active {
          background: linear-gradient(135deg,rgba(139,92,246,0.25),rgba(217,70,239,0.2));
          border-color: rgba(139,92,246,0.55);
          color: #c084fc;
          box-shadow: 0 0 12px rgba(139,92,246,0.2);
        }

        /* ── Feedback ─────────────────────────────────────────────── */
        .gp-feedback {
          margin: 0.5rem 1.25rem 0;
          padding: 0.55rem 0.9rem;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 600;
          text-align: center;
          flex-shrink: 0;
        }

        .gp-feedback-success {
          color: #4ade80;
          background: rgba(74,222,128,0.1);
          border: 1px solid rgba(74,222,128,0.25);
        }

        .gp-feedback-error {
          color: #f87171;
          background: rgba(248,113,113,0.1);
          border: 1px solid rgba(248,113,113,0.22);
        }

        /* ── Not logged in ────────────────────────────────────────── */
        .gp-not-logged-in {
          margin: 0.5rem 1.25rem 0;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          background: rgba(99,102,241,0.08);
          border: 1px solid rgba(99,102,241,0.3);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        .gp-nli-icon {
          font-size: 1.4rem;
          flex-shrink: 0;
        }

        .gp-nli-text {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          flex: 1;
        }

        .gp-nli-text strong {
          color: #a5b4fc;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .gp-nli-text span {
          color: rgba(255,255,255,0.55);
          font-size: 0.75rem;
        }

        /* ── Creator self-send notice ─────────────────────────────── */
        .gp-self-notice {
          margin: 0.5rem 1.25rem 0;
          padding: 0.65rem 0.9rem;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 700;
          color: #f87171;
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.35);
          text-align: center;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
        }

        .gp-self-notice-icon {
          font-size: 1rem;
          flex-shrink: 0;
        }

        /* ── Insufficient coins ───────────────────────────────────── */
        .gp-insufficient {
          margin: 0.5rem 1.25rem 0;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          background: rgba(245,158,11,0.08);
          border: 1px solid rgba(245,158,11,0.3);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        .gp-insufficient-icon {
          font-size: 1.4rem;
          flex-shrink: 0;
        }

        .gp-insufficient-text {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          flex: 1;
        }

        .gp-insufficient-text strong {
          color: #fbbf24;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .gp-insufficient-text span {
          color: rgba(255,255,255,0.55);
          font-size: 0.75rem;
        }

        .gp-insufficient-btn {
          padding: 0.4rem 0.85rem;
          border-radius: 999px;
          background: linear-gradient(135deg,#d97706,#fbbf24);
          border: none;
          color: #1a0a00;
          font-size: 0.72rem;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
          transition: filter 0.18s ease;
          flex-shrink: 0;
        }

        .gp-insufficient-btn:hover { filter: brightness(1.1); }

        /* ── Grid wrapper ─────────────────────────────────────────── */
        .gp-grid-wrap {
          flex: 1;
          overflow-y: auto;
          padding: 0.85rem 1.25rem 1.25rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(139,92,246,0.3) transparent;
        }

        .gp-grid-wrap::-webkit-scrollbar { width: 4px; }
        .gp-grid-wrap::-webkit-scrollbar-thumb {
          background: rgba(139,92,246,0.3);
          border-radius: 4px;
        }

        /* ── Gift grid ────────────────────────────────────────────── */
        .gp-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.65rem;
        }

        /* ── Gift card ────────────────────────────────────────────── */
        .gp-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.28rem;
          padding: 0.85rem 0.4rem 0.7rem;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          cursor: pointer;
          font-family: inherit;
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
          overflow: hidden;
          -webkit-tap-highlight-color: transparent;
        }

        .gp-card:hover {
          border-color: var(--rc);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 16px var(--rg);
          transform: translateY(-3px) scale(1.02);
        }

        .gp-card:active {
          transform: translateY(0) scale(0.97);
        }

        .gp-card-selected {
          border-color: var(--rc) !important;
          background: rgba(255,255,255,0.07) !important;
          box-shadow: 0 0 22px var(--rg) !important;
          transform: translateY(-3px) scale(1.02) !important;
        }
        
        /* Restricted card (super gifts outside live) */
        .gp-card-restricted {
          opacity: 0.6;
          filter: grayscale(0.3);
          cursor: not-allowed !important;
        }
        
        .gp-card-restricted:hover {
          transform: none !important;
          box-shadow: none !important;
        }

        /* Super gift styling */
        .gp-card-super {
          border-width: 2px;
          animation: gp-super-pulse 2s ease-in-out infinite;
        }

        @keyframes gp-super-pulse {
          0%, 100% { box-shadow: 0 0 10px var(--rg), 0 0 20px var(--rg); }
          50% { box-shadow: 0 0 20px var(--rg), 0 0 30px var(--rg); }
        }

        .gp-card-super:hover {
          box-shadow: 0 0 24px var(--rg), 0 0 36px var(--rg) !important;
        }

        /* Super badge */
        .gp-super-badge {
          position: absolute;
          top: 5px;
          left: 5px;
          font-size: 0.48rem;
          font-weight: 900;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #fbbf24;
          background: linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15));
          border: 1px solid rgba(251,191,36,0.5);
          padding: 0.15rem 0.35rem;
          border-radius: 999px;
          line-height: 1.2;
          z-index: 2;
          animation: gp-super-shimmer 3s ease-in-out infinite;
        }

        @keyframes gp-super-shimmer {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 1; }
        }

        /* Rarity glow layer (subtle inner glow) */
        .gp-card-glow {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(ellipse at 50% 0%, var(--rg, transparent) 0%, transparent 70%);
          opacity: 0;
          transition: opacity 0.22s ease;
          pointer-events: none;
        }

        .gp-card:hover .gp-card-glow,
        .gp-card-selected .gp-card-glow {
          opacity: 1;
        }

        /* Rarity badge pill */
        .gp-rarity-badge {
          position: absolute;
          top: 5px;
          right: 5px;
          font-size: 0.52rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.92);
          padding: 0.15rem 0.4rem;
          border-radius: 999px;
          line-height: 1.3;
        }
        
        /* Live-only badge for restricted super gifts */
        .gp-live-only-badge {
          position: absolute;
          bottom: 5px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 0.48rem;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #fff;
          background: linear-gradient(135deg, #f97316, #fb923c);
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
          line-height: 1.2;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
        }

        .gp-card-icon {
          font-size: 2rem;
          line-height: 1;
          filter: drop-shadow(0 2px 6px var(--rg, transparent));
          transition: filter 0.2s ease, transform 0.2s ease;
        }

        .gp-card:hover .gp-card-icon,
        .gp-card-selected .gp-card-icon {
          filter: drop-shadow(0 4px 12px var(--rg, transparent));
          transform: scale(1.1);
        }

        .gp-card-name {
          font-size: 0.65rem;
          color: rgba(255,255,255,0.75);
          font-weight: 700;
          text-align: center;
          line-height: 1.2;
          letter-spacing: 0.01em;
        }

        .gp-card-cost {
          font-size: 0.65rem;
          color: #fbbf24;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        /* ── Loading / Empty ──────────────────────────────────────── */
        .gp-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.65rem;
          padding: 2.5rem 0;
          color: rgba(255,255,255,0.4);
          font-size: 0.85rem;
        }

        .gp-spinner {
          width: 26px;
          height: 26px;
          border: 2px solid rgba(255,255,255,0.08);
          border-top-color: #c084fc;
          border-radius: 50%;
          animation: gp-spin 0.7s linear infinite;
          display: block;
        }

        .gp-empty {
          text-align: center;
          padding: 2rem 0;
          color: rgba(255,255,255,0.35);
          font-size: 0.85rem;
        }

        /* ── Confirmation modal ───────────────────────────────────── */
        .gp-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 202;
          background: rgba(0,0,0,0.5);
        }

        .gp-modal {
          position: fixed;
          bottom: 50%;
          left: 50%;
          transform: translate(-50%, 50%);
          z-index: 203;
          width: min(360px, calc(100vw - 2.5rem));
          background: linear-gradient(160deg,rgba(18,6,40,0.99),rgba(8,3,22,1));
          border: 1px solid rgba(139,92,246,0.3);
          border-radius: 20px;
          padding: 1.75rem 1.5rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          box-shadow: 0 24px 80px rgba(0,0,0,0.8), 0 0 40px rgba(139,92,246,0.15);
          overflow: hidden;
          animation: gp-modal-pop 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }

        .gp-modal-accent {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          border-radius: 20px 20px 0 0;
        }

        .gp-modal-icon {
          font-size: 3.2rem;
          line-height: 1;
          margin-bottom: 0.2rem;
          filter: drop-shadow(0 4px 16px rgba(139,92,246,0.5));
          animation: gp-icon-bounce 0.5s cubic-bezier(0.34,1.56,0.64,1);
        }

        .gp-modal-title {
          font-size: 1.1rem;
          font-weight: 800;
          color: #fff;
          margin: 0;
          letter-spacing: 0.02em;
        }

        .gp-modal-rarity {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 0.4rem;
        }

        .gp-modal-cost-row,
        .gp-modal-balance-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.07);
          margin-top: 0.25rem;
        }

        .gp-visual-note {
          margin-top: 0.6rem;
          border: 1px solid rgba(103,232,249,0.25);
          background: rgba(8,47,73,0.38);
          color: #a5f3fc;
          border-radius: 14px;
          padding: 0.65rem 0.8rem;
          font-size: 0.8rem;
          font-weight: 700;
          text-align: center;
        }

        .gp-modal-cost-label,
        .gp-modal-balance-label {
          font-size: 0.8rem;
          color: rgba(255,255,255,0.5);
          font-weight: 600;
        }

        .gp-modal-cost-value {
          font-size: 0.9rem;
          color: #fbbf24;
          font-weight: 800;
        }

        .gp-modal-balance-value {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.75);
          font-weight: 700;
        }

        .gp-modal-actions {
          display: flex;
          gap: 0.65rem;
          width: 100%;
          margin-top: 0.9rem;
        }

        .gp-modal-cancel {
          flex: 1;
          padding: 0.75rem;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.65);
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.18s ease;
        }

        .gp-modal-cancel:hover:not(:disabled) {
          background: rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.85);
        }

        .gp-modal-cancel:disabled { opacity: 0.4; cursor: not-allowed; }

        .gp-modal-confirm {
          flex: 1.4;
          padding: 0.75rem;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg,#ff0f8a,#e040fb);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          transition: filter 0.18s ease, box-shadow 0.18s ease;
          letter-spacing: 0.01em;
        }

        .gp-modal-confirm:hover:not(:disabled) {
          filter: brightness(1.12);
          box-shadow: 0 0 20px rgba(255,15,138,0.45);
        }

        .gp-modal-confirm:disabled { opacity: 0.45; cursor: not-allowed; }

        .gp-btn-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: gp-spin 0.6s linear infinite;
          display: inline-block;
          flex-shrink: 0;
        }

        .gp-modal-cost-total {
          font-size: 1rem;
          font-weight: 900;
        }

        .gp-modal-cost-strikethrough {
          text-decoration: line-through;
          opacity: 0.5;
          font-size: 0.8rem;
        }

        .gp-modal-bundle-banner {
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #fbbf24;
          background: linear-gradient(135deg,rgba(245,158,11,0.18),rgba(251,191,36,0.12));
          border: 1px solid rgba(251,191,36,0.35);
          border-radius: 999px;
          padding: 0.28rem 0.85rem;
          margin-bottom: 0.15rem;
        }

        .gp-modal-savings-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.45rem 0.75rem;
          border-radius: 10px;
          background: rgba(74,222,128,0.08);
          border: 1px solid rgba(74,222,128,0.25);
          margin-top: 0.25rem;
        }

        .gp-modal-savings-label {
          font-size: 0.8rem;
          color: #4ade80;
          font-weight: 700;
        }

        .gp-modal-savings-value {
          font-size: 0.88rem;
          color: #4ade80;
          font-weight: 900;
        }

        .gp-modal-qty {
          font-size: 0.85rem;
          font-weight: 700;
          color: #e040fb;
          margin-left: 0.3rem;
        }

        .gp-balance-low {
          color: #f87171 !important;
        }

        /* ── Quantity selector bar ─────────────────────────────────── */
        .gp-qty-bar {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.65rem 1.25rem 0.75rem;
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .gp-qty-btn {
          padding: 0.38rem 0.8rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.55);
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.18s ease;
          letter-spacing: 0.02em;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.1rem;
          line-height: 1.2;
        }

        .gp-qty-bundle-badge {
          font-size: 0.58rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          opacity: 0.85;
          line-height: 1;
        }

        .gp-qty-btn:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(224,64,251,0.5);
          color: #fff;
        }

        .gp-qty-btn-active {
          background: linear-gradient(135deg,rgba(139,92,246,0.3),rgba(217,70,239,0.25));
          border-color: #e040fb;
          color: #e040fb;
          box-shadow: 0 0 10px rgba(224,64,251,0.3);
        }

        .gp-qty-btn-big {
          border-color: rgba(245,158,11,0.35);
        }

        .gp-qty-btn-big.gp-qty-btn-active {
          background: linear-gradient(135deg,rgba(245,158,11,0.3),rgba(251,191,36,0.2));
          border-color: #fbbf24;
          color: #fbbf24;
          box-shadow: 0 0 12px rgba(251,191,36,0.35);
        }

        .gp-qty-total {
          margin-left: auto;
          font-size: 0.82rem;
          font-weight: 800;
          color: #fbbf24;
          letter-spacing: 0.01em;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.05rem;
        }

        .gp-qty-savings {
          font-size: 0.7rem;
          font-weight: 700;
          color: #4ade80;
          letter-spacing: 0.01em;
        }

        /* ── Animations ───────────────────────────────────────────── */
        @keyframes gp-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        @keyframes gp-slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0);    }
        }

        @keyframes gp-modal-pop {
          from { opacity: 0; transform: translate(-50%, 50%) scale(0.88); }
          to   { opacity: 1; transform: translate(-50%, 50%) scale(1);    }
        }

        @keyframes gp-icon-bounce {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }

        @keyframes gp-spin {
          to { transform: rotate(360deg); }
        }

        /* ── Responsive ───────────────────────────────────────────── */
        @media (min-width: 640px) {
          .gp-panel {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            width: 420px;
            border-radius: 20px 20px 0 0;
          }

          .gp-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .gp-panel {
            bottom: auto;
            top: 50%;
            transform: translate(-50%, -50%);
            max-height: 82vh;
            border-radius: 20px;
            border: 1px solid rgba(139,92,246,0.3);
          }

          @keyframes gp-slide-up {
            from { opacity: 0; transform: translate(-50%, -44%); }
            to   { opacity: 1; transform: translate(-50%, -50%); }
          }
        }
      `}</style>
    </>
  );
}
