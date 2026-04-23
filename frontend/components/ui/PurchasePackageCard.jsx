"use client";

import GradientButton from "./GradientButton";
import NeonBadge from "./NeonBadge";
import { CoinIcon } from "./MonetizationIcons";

export default function PurchasePackageCard({ pkg, onBuy, loading }) {
  return (
    <div className={`ppc ${pkg.highlight ? "ppc-highlight" : ""}`.trim()}>
      <div className="ppc-top-row">
        {pkg.badge ? <NeonBadge tone={pkg.badgeTone || "pink"}>{pkg.badge}</NeonBadge> : <span />}
        {pkg.benefit ? <span className="ppc-benefit">{pkg.benefit}</span> : null}
      </div>

      <div className="ppc-main">
        <span className="ppc-icon"><CoinIcon size={22} /></span>
        <div>
          <div className="ppc-title">{pkg.label}</div>
          <div className="ppc-coins">{pkg.coins} Coins</div>
        </div>
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
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-height: 100%;
          border-radius: 20px;
          border: 1px solid rgba(148,163,184,0.22);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 38%),
            linear-gradient(155deg, rgba(18,10,40,0.95) 0%, rgba(11,6,28,0.95) 100%);
          padding: 1rem;
          box-shadow: var(--shadow-sm);
          transition: transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition);
        }
        .ppc:hover {
          transform: translateY(-4px);
          border-color: rgba(139,92,246,0.38);
          box-shadow: var(--shadow), 0 0 24px rgba(124,58,237,0.22);
        }
        .ppc-highlight {
          border-color: rgba(224,64,251,0.42);
          box-shadow: var(--shadow), 0 0 30px rgba(224,64,251,0.24);
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
        .ppc-main {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .ppc-icon {
          width: 2.3rem;
          height: 2.3rem;
          border-radius: 14px;
          border: 1px solid rgba(251,146,60,0.32);
          background: rgba(251,146,60,0.12);
          color: #fdba74;
          display: inline-flex;
          align-items: center;
          justify-content: center;
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
          font-size: 1.45rem;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #fff;
        }
        .ppc-price-wrap {
          display: flex;
          align-items: baseline;
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
        }
        .ppc-foot {
          margin-top: auto;
          display: flex;
          flex-direction: column;
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
      `}</style>
    </div>
  );
}
