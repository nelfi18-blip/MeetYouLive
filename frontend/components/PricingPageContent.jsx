"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import FuturisticCard from "@/components/ui/FuturisticCard";
import {
  CoinIcon,
  GiftIcon,
  LockIcon,
  SparkIcon,
  VideoIcon,
} from "@/components/ui/MonetizationIcons";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Mirrors the usage list shown on the (authenticated) /coins page, reusing
// the same translation keys so the two pages never describe Coins
// differently. See frontend/app/coins/page.jsx COIN_USE_CONFIG.
const COIN_USE_CONFIG = [
  { key: "virtualGifts", icon: <GiftIcon size={17} /> },
  { key: "privateCalls", icon: <VideoIcon size={17} /> },
  { key: "liveRooms", icon: <SparkIcon size={17} /> },
  { key: "exclusiveContent", icon: <LockIcon size={17} /> },
];

function formatUsd(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `$${value.toFixed(2)}`;
}

export default function PricingPageContent() {
  const { t } = useLanguage();
  const [packages, setPackages] = useState([]);
  const [vipTiers, setVipTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Both endpoints are public (no Authorization header, no auth
    // middleware) so this page never needs a session to show real prices.
    // See backend/src/routes/coins.routes.js (GET /packages) and
    // backend/src/routes/subscription.routes.js (GET /tiers).
    Promise.all([
      fetch(`${API_URL}/api/coins/packages`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_URL}/api/subscriptions/tiers`).then((r) => (r.ok ? r.json() : { tiers: [] })),
    ])
      .then(([coinPackages, subscriptionData]) => {
        if (cancelled) return;
        setPackages(Array.isArray(coinPackages) ? coinPackages : []);
        setVipTiers(Array.isArray(subscriptionData?.tiers) ? subscriptionData.tiers : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pricing-page">
      <header className="pricing-hero">
        <p className="pricing-eyebrow">{t("pricing.eyebrow")}</p>
        <h1 className="pricing-title">{t("pricing.title")}</h1>
        <p className="pricing-subtitle">{t("pricing.subtitle")}</p>
        <p className="pricing-intro">{t("pricing.intro")}</p>
      </header>

      {loading && <p className="pricing-status">{t("pricing.loading")}</p>}
      {!loading && error && <p className="pricing-status pricing-status-error">{t("pricing.loadError")}</p>}

      <section className="pricing-section" aria-labelledby="pricing-coins-heading">
        <p className="pricing-section-eyebrow">{t("pricing.coinsEyebrow")}</p>
        <h2 id="pricing-coins-heading">{t("pricing.coinsTitle")}</h2>
        <p className="pricing-section-subtitle">{t("pricing.coinsSubtitle")}</p>

        {!loading && packages.length === 0 && (
          <p className="pricing-status">{t("pricing.coinsPackagesUnavailable")}</p>
        )}

        {packages.length > 0 && (
          <div className="pricing-grid">
            {packages.map((pkg) => {
              const price = formatUsd(pkg.priceUsd);
              return (
                <FuturisticCard key={pkg.id} className="pricing-card" accent="purple">
                  <div className="pricing-card-inner">
                    <span className="pricing-card-icon" aria-hidden="true">{pkg.icon || "🪙"}</span>
                    <h3>{pkg.label}</h3>
                    <p className="pricing-card-coins">{pkg.coins} {t("common.coins")}</p>
                    {price && <p className="pricing-card-price">{price}</p>}
                    <p className="pricing-card-note">{t("pricing.coinsOneTime")}</p>
                    {pkg.description && <p className="pricing-card-desc">{pkg.description}</p>}
                  </div>
                </FuturisticCard>
              );
            })}
          </div>
        )}

        <div className="pricing-uses">
          <h3 className="pricing-uses-title">{t("pricing.coinsUsesTitle")}</h3>
          <ul className="pricing-uses-list">
            {COIN_USE_CONFIG.map((use) => (
              <li key={use.key}>
                <span className="pricing-uses-icon" aria-hidden="true">{use.icon}</span>
                {t(`coins.uses.${use.key}.title`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pricing-section" aria-labelledby="pricing-vip-heading">
        <p className="pricing-section-eyebrow">{t("pricing.vipEyebrow")}</p>
        <h2 id="pricing-vip-heading">{t("pricing.vipTitle")}</h2>
        <p className="pricing-section-subtitle">{t("pricing.vipSubtitle")}</p>
        <p className="pricing-vip-paused">{t("pricing.vipPausedNotice")}</p>

        {!loading && vipTiers.length === 0 && (
          <p className="pricing-status">{t("pricing.vipUnavailableNote")}</p>
        )}

        {vipTiers.length > 0 && (
          <div className="pricing-grid">
            {vipTiers.map((tier) => {
              const price = tier.available ? formatUsd(tier.priceUsd) : null;
              return (
                <FuturisticCard key={tier.id} className="pricing-card" accent="pink">
                  <div className="pricing-card-inner">
                    <span className="pricing-card-icon" aria-hidden="true">{tier.badge}</span>
                    <h3>{tier.name}</h3>
                    {price && (
                      <p className="pricing-card-price">
                        {price}
                        <span className="pricing-card-period">{t("pricing.vipMonthly")}</span>
                      </p>
                    )}
                    {typeof tier.bonusCoinsPerMonth === "number" && (
                      <p className="pricing-card-desc">
                        {t("pricing.vipBonusCoins").replace("{count}", tier.bonusCoinsPerMonth)}
                      </p>
                    )}
                    {!tier.available && (
                      <span className="pricing-badge-soon">{t("pricing.vipComingSoon")}</span>
                    )}
                  </div>
                </FuturisticCard>
              );
            })}
          </div>
        )}
      </section>

      <section className="pricing-section" aria-labelledby="pricing-gifts-heading">
        <p className="pricing-section-eyebrow">{t("pricing.giftsEyebrow")}</p>
        <h2 id="pricing-gifts-heading">{t("pricing.giftsTitle")}</h2>
        <p className="pricing-section-subtitle">{t("pricing.giftsBody")}</p>
      </section>

      <section className="pricing-section" aria-labelledby="pricing-payments-heading">
        <p className="pricing-section-eyebrow">{t("pricing.paymentsEyebrow")}</p>
        <h2 id="pricing-payments-heading">{t("pricing.paymentsTitle")}</h2>
        <p className="pricing-section-subtitle">{t("pricing.paymentsBody")}</p>
      </section>

      <section className="pricing-cta">
        <h2>{t("pricing.ctaTitle")}</h2>
        <p>{t("pricing.ctaBody")}</p>
        <div className="pricing-cta-actions">
          <Link href="/register" className="btn btn-primary">{t("pricing.ctaRegister")}</Link>
          <Link href="/login" className="btn btn-secondary">{t("pricing.ctaLogin")}</Link>
        </div>
        <Link href="/" className="pricing-back-link">← {t("pricing.backToHome")}</Link>
      </section>

      <style jsx>{`
        .pricing-page { min-height: 100vh; padding: 2rem 1rem 4rem; max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 2.5rem; }
        .pricing-hero { max-width: 760px; }
        .pricing-eyebrow, .pricing-section-eyebrow { margin: 0 0 0.5rem; color: var(--accent-3); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
        .pricing-title { font-size: clamp(2rem, 5vw, 3rem); font-weight: 900; color: var(--text); margin: 0 0 0.75rem; letter-spacing: -0.04em; }
        .pricing-subtitle { color: var(--text-muted); font-size: 1rem; line-height: 1.7; margin: 0 0 0.5rem; }
        .pricing-intro { color: var(--text-muted); font-size: 0.88rem; line-height: 1.6; }
        .pricing-status { color: var(--text-muted); font-size: 0.9rem; }
        .pricing-status-error { color: var(--error); }

        .pricing-section { display: flex; flex-direction: column; gap: 0.6rem; border-top: 1px solid var(--border); padding-top: 2rem; }
        .pricing-section h2 { font-size: 1.4rem; font-weight: 800; color: var(--text); margin: 0; }
        .pricing-section-subtitle { color: var(--text-muted); font-size: 0.92rem; line-height: 1.7; margin: 0 0 0.75rem; }
        .pricing-vip-paused { color: var(--text-muted); font-size: 0.85rem; line-height: 1.6; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); border-radius: var(--radius-sm); padding: 0.75rem 1rem; }

        .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 0.5rem; }
        .pricing-card-inner { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.35rem; text-align: center; }
        .pricing-card-icon { font-size: 1.8rem; }
        .pricing-card-inner h3 { font-size: 1.05rem; font-weight: 800; color: var(--text); margin: 0.25rem 0 0; }
        .pricing-card-coins { color: var(--accent-cyan); font-weight: 700; font-size: 0.95rem; margin: 0; }
        .pricing-card-price { font-size: 1.4rem; font-weight: 900; color: var(--text); margin: 0.1rem 0; }
        .pricing-card-period { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin-left: 0.25rem; }
        .pricing-card-note { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
        .pricing-card-desc { font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; margin: 0.25rem 0 0; }
        .pricing-badge-soon { align-self: center; margin-top: 0.4rem; font-size: 0.7rem; font-weight: 800; color: #fbbf24; border: 1px solid rgba(251,191,36,0.5); border-radius: 999px; padding: 0.2rem 0.6rem; }

        .pricing-uses { margin-top: 0.75rem; }
        .pricing-uses-title { font-size: 0.95rem; font-weight: 800; color: var(--text); margin: 0 0 0.5rem; }
        .pricing-uses-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
        .pricing-uses-list li { display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted); font-size: 0.88rem; }
        .pricing-uses-icon { display: inline-flex; color: var(--accent-cyan); }

        .pricing-cta { text-align: center; border-top: 1px solid var(--border); padding-top: 2.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
        .pricing-cta h2 { font-size: 1.3rem; font-weight: 800; color: var(--text); margin: 0; }
        .pricing-cta p { color: var(--text-muted); margin: 0; }
        .pricing-cta-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center; margin-top: 0.5rem; }
        .pricing-back-link { color: var(--text-muted); text-decoration: none; font-size: 0.85rem; margin-top: 0.5rem; }
        .pricing-back-link:hover { color: var(--text); }

        @media (max-width: 600px) {
          .pricing-page { padding: 1.5rem 1rem 3rem; gap: 2rem; }
        }
      `}</style>
    </div>
  );
}
