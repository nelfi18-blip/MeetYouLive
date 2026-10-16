"use client";

import GradientButton from "./GradientButton";
import NeonBadge from "./NeonBadge";
import GoldCoin from "./GoldCoin";

export default function PurchasePackageCard({ pkg, onBuy, loading }) {
  return (
    <div className={`ppc ${pkg.highlight ? "ppc-highlight" : ""}`.trim()}>
      {pkg.highlight ? <span className="ppc-crown" aria-hidden="true">★</span> : null}

      <div className="ppc-top-row">
        {pkg.badge ? <NeonBadge tone={pkg.badgeTone || "pink"}>{pkg.badge}</NeonBadge> : <span />}
        {pkg.benefit ? <span className="ppc-benefit">{pkg.benefit}</span> : null}
      </div>

      <div className="ppc-coin-stage">
        <GoldCoin size={pkg.highlight ? 76 : 60} stacked className="ppc-coin-visual" />
      </div>

      <div className="ppc-main">
        <div className="ppc-title">{pkg.label}</div>
        <div className="ppc-coins">{pkg.coins} Coins</div>
      </div>

      <div className="ppc-price-wrap">
        <div className="ppc-price">{pkg.price}</div>
        <div className="ppc-price-note">{pkg.priceNote}</div>
      </div>

      <p className="ppc-desc">{pkg.desc}</p>

      <div className="ppc-foot">
        <div className="ppc-per-coin">{pkg.perCoin} por coin</div>
        <GradientButton
          className="ppc-btn"
          onClick={() => onBuy(pkg.value)}
          disabled={loading}
          variant={pkg.highlight ? "primary" : "ghost"}
        >
          {loading ? "Redirigiendo…" : "Comprar paquete"}
        </GradientButton>
      </div>

      <style jsx>{`
        .ppc {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-height: 100%;
          border-radius: 20px;
          border: 1px solid rgba(148,163,184,0.22);
          background:
            radial-gradient(120% 60% at 50% -10%, rgba(255,196,80,0.1), transparent 60%),
            linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 38%),
            linear-gradient(155deg, rgba(18,10,40,0.95) 0%, rgba(11,6,28,0.95) 100%);
          padding: 1rem;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
          transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition);
        }
        .ppc:hover {
          transform: translateY(-4px);
          border-color: rgba(139,92,246,0.38);
          box-shadow: var(--shadow), 0 0 24px rgba(124,58,237,0.22);
        }
        .ppc-highlight {
          border-color: rgba(255,196,80,0.5);
          background:
            radial-gradient(130% 70% at 50% -16%, rgba(255,196,80,0.22), transparent 62%),
            linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%),
            linear-gradient(155deg, rgba(28,12,42,0.96) 0%, rgba(12,6,26,0.97) 100%);
          box-shadow: var(--shadow), 0 0 34px rgba(224,64,251,0.26), 0 0 20px rgba(255,196,80,0.18);
        }
        .ppc-highlight:hover {
          box-shadow: var(--shadow), 0 0 42px rgba(224,64,251,0.34), 0 0 26px rgba(255,196,80,0.26);
        }
        .ppc-crown {
          position: absolute;
          top: 0.6rem;
          right: 0.7rem;
          font-size: 0.85rem;
          color: #ffd98a;
          text-shadow: 0 0 10px rgba(255,196,80,0.75);
        }
        .ppc-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          min-height: 1.5rem;
        }
        .ppc-benefit {
          font-size: 0.72rem;
          color: var(--text-dim);
          font-weight: 600;
        }
        .ppc-coin-stage {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.4rem 0 0.1rem;
        }
        :global(.ppc-coin-visual) {
          filter: drop-shadow(0 8px 16px rgba(255, 196, 80, 0.25));
        }
        .ppc-main {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.1rem;
        }
        .ppc-title {
          font-size: 0.74rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
        }
        .ppc-coins {
          margin-top: 0.14rem;
          font-size: 1.55rem;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #fff;
        }
        .ppc-price-wrap {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .ppc-price {
          font-size: 1.7rem;
          line-height: 1;
          font-weight: 800;
          background: var(--grad-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ppc-price-note {
          font-size: 0.78rem;
          color: var(--text-dim);
        }
        .ppc-desc {
          margin: 0;
          font-size: 0.83rem;
          color: var(--text-muted);
          line-height: 1.5;
          text-align: center;
        }
        .ppc-foot {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
        }
        .ppc-per-coin {
          font-size: 0.76rem;
          color: var(--text-dim);
          font-weight: 600;
        }
        :global(.ppc-btn) {
          width: 100%;
        }
        @media (prefers-reduced-motion: reduce) {
          .ppc, .ppc-highlight {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
