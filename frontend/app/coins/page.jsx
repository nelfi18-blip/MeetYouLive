"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { fetchUserRole } from "@/lib/token";
import UrgencyBanner from "@/components/UrgencyBanner";
import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import PurchasePackageCard from "@/components/ui/PurchasePackageCard";
import TransactionListCard from "@/components/ui/TransactionListCard";
import NeonBadge from "@/components/ui/NeonBadge";
import { shouldUseNativeStorePayments } from "@/lib/mobilePayments";
import { redirectToTrustedCheckout } from "@/lib/checkoutRedirect";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  ArrowRightIcon,
  CardIcon,
  CoinIcon,
  GiftIcon,
  HistoryIcon,
  LockIcon,
  ShieldIcon,
  SparkIcon,
  TrendUpIcon,
  VideoIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

// Force dynamic rendering - this page requires client-side logic
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const PACKAGE_CONFIG = [
  {
    value: 100,
    price: "$4.99",
    perCoin: "$0.0499",
    badgeTone: "purple",
  },
  {
    value: 250,
    price: "$9.99",
    perCoin: "$0.0399",
    highlight: true,
    badgeTone: "pink",
  },
  {
    value: 700,
    price: "$19.99",
    perCoin: "$0.0285",
    badgeTone: "green",
  },
];

const TX_TYPE_CONFIG = {
  purchase: { key: "purchase", tone: "green" },
  gift_sent: { key: "giftSent", tone: "pink" },
  gift_received: { key: "giftReceived", tone: "green" },
  private_call: { key: "privateCall", tone: "pink" },
  call_started: { key: "callStarted", tone: "pink" },
  call_earned: { key: "callEarned", tone: "green" },
  room_entry: { key: "roomEntry", tone: "purple" },
  content_unlock: { key: "contentUnlock", tone: "purple" },
  content_earned: { key: "contentEarned", tone: "green" },
  refund: { key: "refund", tone: "green" },
  daily_reward: { key: "dailyReward", tone: "cyan" },
  referral_reward: { key: "referralReward", tone: "cyan" },
  agency_earned: { key: "agencyEarned", tone: "green" },
  admin_adjustment: { key: "adminAdjustment", tone: "purple" },
};

function getCheckoutErrorMessage(data, fallback) {
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }
  const firstError = Array.isArray(data?.errors) ? data.errors[0] : null;
  if (typeof firstError?.message === "string" && firstError.message.trim()) {
    return firstError.message;
  }
  if (typeof firstError === "string" && firstError.trim()) {
    return firstError;
  }
  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }
  return fallback;
}

const COIN_USE_CONFIG = [
  {
    key: "virtualGifts",
    icon: <GiftIcon size={17} />,
  },
  {
    key: "privateCalls",
    icon: <VideoIcon size={17} />,
  },
  {
    key: "liveRooms",
    icon: <SparkIcon size={17} />,
  },
  {
    key: "exclusiveContent",
    icon: <LockIcon size={17} />,
  },
  {
    key: "interactionsMatches",
    icon: <TrendUpIcon size={17} />,
  },
];

// Mirrors backend/src/services/coins.service.js MAX_USER_COINS_BALANCE.
// Sized conservatively so 40,000 coins x $0.0499/coin (the most expensive
// package rate) = $1,996 USD, staying under Stripe's $2,000 requirement
// regardless of which package(s) or bonus(es) were used to reach that balance.
const MAX_COINS_BALANCE = 40000;

const COIN_NOT_KEYS = [
  "virtualCredit",
  "notStoredValue",
  "noPhysicalGoods",
  "noUserTransfers",
  "noDirectCashRedemption",
  "noExternalMonetaryValue",
];

export default function BuyCoinsPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState(null);
  const [sparks, setSparks] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);

  const packages = PACKAGE_CONFIG.map((pkg) => ({
    ...pkg,
    label: t(`coins.packages.${pkg.value}.label`),
    coins: String(pkg.value),
    priceNote: t("coins.packagePriceNote"),
    desc: t(`coins.packages.${pkg.value}.desc`),
    badge: t(`coins.packages.${pkg.value}.badge`),
    benefit: t(`coins.packages.${pkg.value}.benefit`),
  }));

  const txTypeLabels = Object.fromEntries(
    Object.entries(TX_TYPE_CONFIG).map(([key, config]) => [
      key,
      { label: t(`coins.transactionTypes.${config.key}`), tone: config.tone },
    ]),
  );

  const coinUses = COIN_USE_CONFIG.map((item) => ({
    ...item,
    title: t(`coins.uses.${item.key}.title`),
    desc: t(`coins.uses.${item.key}.desc`),
  }));

  const coinNotList = COIN_NOT_KEYS.map((key) => t(`coins.notList.${key}`));

  // Admin redirect - admins should not access the coins page
  useEffect(() => {
    const localToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const token = localToken || session?.backendToken || null;
    if (!token) return;
    
    let isMounted = true;
    
    const checkAdminRole = async () => {
      try {
        const userData = await fetchUserRole(token);
        if (isMounted && userData?.role === "admin") {
          router.replace("/admin");
        }
      } catch (err) {
        console.error("Error checking user role:", err);
      }
    };
    
    checkAdminRole();
    
    return () => {
      isMounted = false;
    };
  }, [session?.backendToken, router]);

  useEffect(() => {
    const localToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const token = localToken || session?.backendToken || null;
    if (!token) {
      setTxLoading(false);
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/coins`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setBalance(d.coins);
          setSparks(d.sparks ?? null);
        }
      })
      .catch(() => {});

    fetch(`${API_URL}/api/coins/transactions?limit=20`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setTransactions(d.transactions || []);
      })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [session?.backendToken]);

  const buy = async (pkg) => {
    setError("");
    trackAnalyticsEvent("coins_checkout_started", { packageId: String(pkg) });
    if (shouldUseNativeStorePayments()) {
      setError(t("common.mobileStorePaymentRequired"));
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token") || session?.backendToken;
      const res = await fetch(`${API_URL}/api/payments/coins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packageId: pkg }),
      });
      let data;
      try {
        data = await res.json();
      } catch (parseError) {
        console.error("Invalid coin checkout response:", parseError);
        setError(t("common.invalidServerResponse"));
        return;
      }
      if (!res.ok) {
        setError(getCheckoutErrorMessage(data, t("coins.checkoutError")));
        return;
      }
      if (!data?.url) {
      setError(t("coins.paymentUrlError"));
        return;
      }
      if (!redirectToTrustedCheckout(data.url)) {
        setError(t("common.invalidPaymentUrl"));
      }
    } catch {
      setError(t("coins.connectionError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="coins-page">
      <UrgencyBanner />

      <FuturisticCard className="hero-card" accent="pink" hover={false}>
        <PremiumSectionHeader
          align="center"
          eyebrow={t("coins.heroEyebrow")}
          title={t("coins.heroTitle")}
          subtitle={t("coins.heroSubtitle")}
        />

        <div className="hero-balance-grid">
          <div className="hero-balance-pill">
            <span className="hero-pill-icon"><CoinIcon size={16} /></span>
            <span className="hero-pill-label">{t("coins.currentBalance")}</span>
            <strong className="hero-pill-value">{balance ?? "—"} Coins</strong>
          </div>
          <Link href="/wallet" className="hero-balance-pill is-link">
            <span className="hero-pill-icon"><WalletIcon size={16} /></span>
            <span className="hero-pill-label">{t("coins.fullWallet")}</span>
            <strong className="hero-pill-value">{t("coins.viewBalanceHistory")}</strong>
          </Link>
          {sparks !== null && (
            <Link href="/sparks" className="hero-balance-pill is-link is-sparks">
              <span className="hero-pill-icon"><SparkIcon size={16} /></span>
              <span className="hero-pill-label">{t("coins.availableSparks")}</span>
              <strong className="hero-pill-value">{sparks}</strong>
            </Link>
          )}
        </div>

        <div className="hero-cta-row">
          <a href="#packages" className="btn btn-primary btn-lg">
            {t("coins.buyNow")} <ArrowRightIcon size={16} />
          </a>
          <Link href="/wallet" className="btn btn-secondary btn-lg">
            {t("coins.viewMyWallet")} <HistoryIcon size={16} />
          </Link>
        </div>
      </FuturisticCard>

      {error ? <div className="banner-error">{error}</div> : null}

      <section id="packages" className="coin-section">
        <PremiumSectionHeader
          eyebrow={t("coins.packagesEyebrow")}
          title={t("coins.packagesTitle")}
          subtitle={t("coins.packagesSubtitle")}
        />
        <div className="packages-grid">
          {packages.map((pkg) => (
            <PurchasePackageCard key={pkg.value} pkg={pkg} onBuy={buy} loading={loading} />
          ))}
        </div>
      </section>

      <FuturisticCard className="trust-card" accent="cyan" hover={false}>
        <PremiumSectionHeader
          eyebrow={t("coins.valueEyebrow")}
          title={t("coins.valueTitle")}
          subtitle={t("coins.valueSubtitle")}
        />

        <div className="uses-grid">
          {coinUses.map((use) => (
            <div key={use.title} className="use-item">
              <span className="use-icon">{use.icon}</span>
              <div>
                <h3>{use.title}</h3>
                <p>{use.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="trust-strip">
          <NeonBadge tone="green"><ShieldIcon size={12} /> {t("coins.securePayment")}</NeonBadge>
          <NeonBadge tone="purple"><CardIcon size={12} /> {t("coins.stripeIntegrated")}</NeonBadge>
          <NeonBadge tone="cyan"><TrendUpIcon size={12} /> {t("coins.transparentMonetization")}</NeonBadge>
        </div>
      </FuturisticCard>

      <FuturisticCard className="clarify-card" accent="purple" hover={false}>
        <PremiumSectionHeader
          eyebrow={t("coins.clarifyEyebrow")}
          title={t("coins.clarifyTitle")}
          subtitle={t("coins.clarifySubtitle")}
        />
        <ul className="not-list">
          {coinNotList.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="creator-earnings-note">
          <h3>{t("coins.creatorEarningsTitle")}</h3>
          <p>
            {t("coins.creatorEarningsParagraph1Start")} <strong>earnings</strong>{" "}
            {t("coins.creatorEarningsParagraph1Middle")}{" "}
            <Link href="/creator-policy">{t("coins.creatorPolicy")}</Link>.{" "}
            {t("coins.creatorEarningsParagraph1End")}
          </p>
          <p>
            {t("coins.creatorEarningsParagraph2Start")} <Link href="/refund">{t("coins.refundPolicy")}</Link>{" "}
            {t("coins.creatorEarningsParagraph2Middle")} <Link href="/acceptable-use">{t("coins.acceptableUsePolicy")}</Link>{" "}
            {t("coins.creatorEarningsParagraph2End")}
          </p>
        </div>
        <div className="creator-earnings-note wallet-limit-note">
          <h3>{t("coins.balanceLimitTitle")}</h3>
          <p>
            {t("coins.balanceLimitParagraphStart")}
            {" "}
            <strong>{MAX_COINS_BALANCE.toLocaleString(t("common.locale"))} Coins</strong>
            {" "}
            {t("coins.balanceLimitParagraphEnd")}
          </p>
        </div>
      </FuturisticCard>

      <TransactionListCard
        title={t("coins.historyTitle")}
        subtitle={t("coins.historySubtitle")}
        items={transactions}
        loading={txLoading}
        emptyText={t("coins.historyEmpty")}
        labels={txTypeLabels}
        symbol="Coins"
        historyHref="/wallet"
        actionLabel={t("coins.viewFullWallet")}
      />

      <div className="support-actions">
        <Link href="/wallet" className="support-link">
          <WalletIcon size={16} /> {t("coins.viewFullBalanceHistory")}
        </Link>
        <Link href="/dashboard" className="support-link support-link-muted">
          <ArrowRightIcon size={16} /> {t("coins.backToDashboard")}
        </Link>
      </div>

      <style jsx>{`
        .coins-page {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          max-width: 980px;
          margin: 0 auto;
        }
        .hero-card {
          padding: 1.2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .hero-balance-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .hero-balance-pill {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          padding: 0.85rem 0.9rem;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(255,255,255,0.03);
          text-decoration: none;
        }
        .hero-balance-pill.is-link {
          transition: border-color var(--transition), background var(--transition), transform var(--transition);
        }
        .hero-balance-pill.is-link:hover {
          border-color: rgba(224,64,251,0.38);
          background: rgba(224,64,251,0.1);
          transform: translateY(-1px);
        }
        .hero-balance-pill.is-sparks:hover {
          border-color: rgba(124,58,237,0.44);
          background: rgba(124,58,237,0.11);
        }
        .hero-pill-icon {
          width: 1.8rem;
          height: 1.8rem;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #f5d0fe;
          border: 1px solid rgba(224,64,251,0.42);
          background: rgba(224,64,251,0.14);
        }
        .hero-pill-label {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .hero-pill-value {
          font-size: 0.92rem;
          color: #fff;
          font-weight: 700;
        }
        .hero-cta-row {
          display: flex;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .coin-section {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .packages-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
        }
        .trust-card {
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .uses-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.72rem;
        }
        .use-item {
          display: flex;
          gap: 0.62rem;
          padding: 0.85rem;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.2);
          background: rgba(255,255,255,0.03);
        }
        .use-icon {
          width: 1.95rem;
          height: 1.95rem;
          flex-shrink: 0;
          border-radius: 12px;
          border: 1px solid rgba(34,211,238,0.35);
          background: rgba(34,211,238,0.12);
          color: #a5f3fc;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .use-item h3 {
          margin: 0;
          font-size: 0.87rem;
          font-weight: 700;
          color: #fff;
        }
        .use-item p {
          margin: 0.24rem 0 0;
          font-size: 0.78rem;
          color: var(--text-muted);
          line-height: 1.45;
        }
        .trust-strip {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .clarify-card {
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .not-list {
          margin: 0;
          padding-left: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          color: var(--text-muted);
          font-size: 0.85rem;
          line-height: 1.55;
        }
        .creator-earnings-note {
          border-top: 1px solid rgba(148,163,184,0.2);
          padding-top: 0.9rem;
        }
        .creator-earnings-note h3 {
          margin: 0 0 0.5rem;
          font-size: 0.92rem;
          font-weight: 700;
          color: #fff;
        }
        .creator-earnings-note p {
          margin: 0 0 0.6rem;
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.6;
        }
        .creator-earnings-note p:last-child {
          margin-bottom: 0;
        }
        .creator-earnings-note :global(a) {
          color: #f5d0fe;
          text-decoration: underline;
        }
        .support-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.62rem;
        }
        .support-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.48rem;
          padding: 0.75rem 0.85rem;
          border-radius: 12px;
          border: 1px solid rgba(224,64,251,0.34);
          background: rgba(224,64,251,0.12);
          color: #f5d0fe;
          font-size: 0.82rem;
          font-weight: 700;
          text-decoration: none;
          transition: border-color var(--transition), background var(--transition), transform var(--transition);
        }
        .support-link:hover {
          transform: translateY(-1px);
          border-color: rgba(224,64,251,0.56);
          background: rgba(224,64,251,0.2);
        }
        .support-link-muted {
          border-color: rgba(148,163,184,0.28);
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
        }
        .support-link-muted:hover {
          border-color: rgba(148,163,184,0.42);
          color: #e2e8f0;
        }
        @media (max-width: 960px) {
          .hero-balance-grid,
          .packages-grid,
          .uses-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .coins-page {
            gap: 0.9rem;
          }
          .hero-card,
          .trust-card,
          .clarify-card {
            padding: 0.85rem;
            gap: 0.75rem;
          }
          .hero-card :global(.psh-title) {
            font-size: 1.1rem;
          }
          .hero-card :global(.psh-subtitle) {
            margin-top: 0.3rem;
            font-size: 0.82rem;
          }
          .hero-balance-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
          }
          .hero-balance-pill {
            display: grid;
            grid-template-columns: auto 1fr;
            grid-template-rows: auto auto;
            align-items: center;
            column-gap: 0.5rem;
            row-gap: 0.05rem;
            padding: 0.6rem 0.65rem;
          }
          .hero-pill-icon {
            grid-row: 1 / 3;
            grid-column: 1;
            width: 1.6rem;
            height: 1.6rem;
            flex-shrink: 0;
          }
          .hero-pill-label {
            grid-column: 2;
            grid-row: 1;
            font-size: 0.64rem;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .hero-pill-value {
            grid-column: 2;
            grid-row: 2;
            font-size: 0.84rem;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .coin-section {
            gap: 0.65rem;
          }
          .packages-grid,
          .uses-grid,
          .support-actions {
            grid-template-columns: 1fr;
            gap: 0.65rem;
          }
          .hero-cta-row {
            flex-direction: column;
            gap: 0.5rem;
          }
          .hero-cta-row :global(.btn) {
            width: 100%;
          }
          .use-item {
            padding: 0.7rem;
          }
          .creator-earnings-note {
            padding-top: 0.7rem;
          }
        }
      `}</style>
    </div>
  );
}
