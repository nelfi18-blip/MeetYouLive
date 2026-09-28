"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import FuturisticCard from "@/components/ui/FuturisticCard";
import FuturisticBalanceCard from "@/components/ui/FuturisticBalanceCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import TransactionListCard from "@/components/ui/TransactionListCard";
import NeonBadge from "@/components/ui/NeonBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ActivityIcon,
  AlertIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CoinIcon,
  EmptyStateIcon,
  HistoryIcon,
  LockIcon,
  SparkIcon,
  VideoIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function formatDate(iso, locale) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

function timeLeft(iso, t) {
  if (!iso) return "";
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return t("wallet.expired");
  const h = Math.floor(diff / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h`;
}

const PASS_INFO = {
  backstage_pass: "Backstage Pass",
  vip_live_pass: "VIP Live Pass",
  private_date: "Private Date",
  inner_circle: "Inner Circle",
};

const PASS_ICON_BY_TYPE = {
  backstage_pass: <VideoIcon size={15} />,
  vip_live_pass: <ActivityIcon size={15} />,
  private_date: <SparkIcon size={15} />,
  inner_circle: <LockIcon size={15} />,
};

export default function WalletPage() {
  const { t } = useLanguage();
  const locale = t("wallet.locale");
  const { data: session } = useSession();
  const [coins, setCoins] = useState(null);
  const [sparks, setSparks] = useState(null);
  const [earningsCoins, setEarningsCoins] = useState(null);
  const [activePasses, setActivePasses] = useState([]);
  const [recentCoinTx, setRecentCoinTx] = useState([]);
  const [recentSparkTx, setRecentSparkTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const coinTxLabels = {
    purchase: { label: t("wallet.transactionTypes.purchase"), tone: "green" },
    gift_sent: { label: t("wallet.transactionTypes.giftSent"), tone: "pink" },
    gift_received: { label: t("wallet.transactionTypes.giftReceived"), tone: "green" },
    private_call: { label: t("wallet.transactionTypes.privateCall"), tone: "pink" },
    call_started: { label: t("wallet.transactionTypes.callStarted"), tone: "pink" },
    call_earned: { label: t("wallet.transactionTypes.callEarned"), tone: "green" },
    room_entry: { label: t("wallet.transactionTypes.roomEntry"), tone: "purple" },
    content_unlock: { label: t("wallet.transactionTypes.contentUnlock"), tone: "purple" },
    content_earned: { label: t("wallet.transactionTypes.contentEarned"), tone: "green" },
    refund: { label: t("wallet.transactionTypes.refund"), tone: "green" },
    daily_reward: { label: t("wallet.transactionTypes.dailyReward"), tone: "cyan" },
    referral_reward: { label: t("wallet.transactionTypes.referralReward"), tone: "cyan" },
    agency_earned: { label: t("wallet.transactionTypes.agencyEarned"), tone: "green" },
    admin_adjustment: { label: t("wallet.transactionTypes.adminAdjustment"), tone: "purple" },
  };
  const sparkTxLabels = {
    purchase: { label: t("wallet.sparkTransactionTypes.purchase"), tone: "green" },
    boost_used: { label: t("wallet.sparkTransactionTypes.boostUsed"), tone: "pink" },
    pass_purchase: { label: t("wallet.sparkTransactionTypes.passPurchase"), tone: "purple" },
    match_boost: { label: t("wallet.sparkTransactionTypes.matchBoost"), tone: "purple" },
    speed_dating: { label: t("wallet.sparkTransactionTypes.speedDating"), tone: "purple" },
    room_entry: { label: t("wallet.sparkTransactionTypes.roomEntry"), tone: "pink" },
    admin_adjustment: { label: t("wallet.sparkTransactionTypes.adminAdjustment"), tone: "purple" },
  };

  useEffect(() => {
    const localToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const token = localToken || session?.backendToken || null;

    if (!token) {
      setLoading(false);
      setError(t("wallet.loginRequired"));
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/api/user/coins`, { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_URL}/api/coins/transactions?limit=5`, { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_URL}/api/sparks/transactions?limit=5`, { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_URL}/api/passes/my`, { headers }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([balanceData, coinTxData, sparkTxData, passesData]) => {
        if (balanceData) {
          setCoins(balanceData.coins ?? 0);
          setSparks(balanceData.sparks ?? 0);
          setEarningsCoins(balanceData.earningsCoins ?? 0);
          setError("");
        } else {
          setError(t("wallet.balanceLoadError"));
        }
        if (coinTxData) setRecentCoinTx(coinTxData.transactions || []);
        if (sparkTxData) setRecentSparkTx(sparkTxData.transactions || []);
        if (passesData) {
          setActivePasses(
            passesData.filter((p) => p.status === "active" && new Date(p.expiresAt) > new Date())
          );
        }
      })
      .catch(() => {
        setError(t("wallet.connectionError"));
      })
      .finally(() => setLoading(false));
  }, [session?.backendToken, t]);

  if (loading) {
    return (
      <div className="wallet-loading" role="status" aria-live="polite">
        <span className="spinner" />
        <span>{t("wallet.loading")}</span>
        <style jsx>{`
          .wallet-loading {
            min-height: 45vh;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.7rem;
            color: var(--text-muted);
            font-size: 0.9rem;
          }
          .spinner {
            width: 20px;
            height: 20px;
            border-radius: 999px;
            border: 2px solid rgba(196,181,253,0.22);
            border-top-color: #c4b5fd;
            animation: spin 0.7s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="wallet-page">
      <FuturisticCard className="wallet-hero" accent="purple" hover={false}>
        <PremiumSectionHeader
          eyebrow={t("wallet.eyebrow")}
          title={t("wallet.title")}
          subtitle={t("wallet.subtitle")}
          action={
            <div className="hero-actions">
              <Link href="/coins" className="btn btn-primary btn-sm">{t("wallet.buyMore")}</Link>
              <a href="#wallet-history" className="btn btn-secondary btn-sm">{t("wallet.viewHistory")}</a>
            </div>
          }
        />

        <div className="balance-grid">
          <FuturisticBalanceCard
            title="MYL Coins"
            value={coins ?? "—"}
            icon={<CoinIcon size={16} />}
            tone="orange"
            description={t("wallet.coinsDescription")}
            action={<Link href="/coins" className="cta-link">{t("wallet.useCoins")} <ArrowRightIcon size={14} /></Link>}
          />
          <FuturisticBalanceCard
            title="Sparks"
            value={sparks ?? "—"}
            icon={<SparkIcon size={16} />}
            tone="purple"
            description={t("wallet.sparksDescription")}
            action={<Link href="/sparks" className="cta-link">{t("wallet.buySparks")} <ArrowRightIcon size={14} /></Link>}
          />
          {earningsCoins !== null && earningsCoins > 0 ? (
            <FuturisticBalanceCard
              title={t("wallet.creatorEarningsTitle")}
              value={earningsCoins}
              icon={<ActivityIcon size={16} />}
              tone="green"
              description={t("wallet.creatorEarningsDescription")}
            />
          ) : null}
        </div>
      </FuturisticCard>

      {error ? (
        <FuturisticCard className="wallet-banner" accent="pink" hover={false}>
          <div className="banner-content">
            <span className="banner-icon"><AlertIcon size={15} /></span>
            <span>{error}</span>
          </div>
        </FuturisticCard>
      ) : null}

      <FuturisticCard className="passes-card" accent="cyan" hover={false}>
        <PremiumSectionHeader
          title={t("wallet.activePassesTitle")}
          subtitle={t("wallet.activePassesSubtitle")}
          action={<Link href="/passes" className="section-link">{t("wallet.viewAllPasses")}</Link>}
        />

        {activePasses.length === 0 ? (
          <div className="empty-line">
            <span className="empty-icon"><EmptyStateIcon size={15} /></span>
            <span>{t("wallet.noActivePasses")}</span>
            <Link href="/passes" className="inline-action">{t("wallet.explorePasses")}</Link>
          </div>
        ) : (
          <div className="pass-list">
            {activePasses.map((pass) => {
              const name = PASS_INFO[pass.type] || pass.type;
              return (
                <div key={pass._id} className="pass-row">
                  <div className="pass-main">
                    <span className="pass-icon">{PASS_ICON_BY_TYPE[pass.type] || <VideoIcon size={15} />}</span>
                    <div>
                      <strong>{name}</strong>
                      <p>{t("wallet.passExpires").replace("{time}", timeLeft(pass.expiresAt, t)).replace("{date}", formatDate(pass.expiresAt, locale))}</p>
                    </div>
                  </div>
                  <NeonBadge tone="green"><CheckCircleIcon size={11} /> {t("wallet.active")}</NeonBadge>
                </div>
              );
            })}
          </div>
        )}
      </FuturisticCard>

      <div id="wallet-history" className="tx-grid">
        <TransactionListCard
          title={t("wallet.coinHistoryTitle")}
          subtitle={t("wallet.coinHistorySubtitle")}
          items={recentCoinTx}
          loading={false}
          emptyText={t("wallet.coinHistoryEmpty")}
          labels={coinTxLabels}
          symbol="Coins"
          historyHref="/coins"
          actionLabel={t("wallet.goToCoins")}
        />

        <TransactionListCard
          title={t("wallet.sparkHistoryTitle")}
          subtitle={t("wallet.sparkHistorySubtitle")}
          items={recentSparkTx}
          loading={false}
          emptyText={t("wallet.sparkHistoryEmpty")}
          labels={sparkTxLabels}
          symbol="Sparks"
          historyHref="/sparks"
          actionLabel={t("wallet.goToSparks")}
        />
      </div>

      <div className="quick-actions">
        <Link href="/coins" className="qa-link"><CoinIcon size={16} /> {t("wallet.buyMylCoins")}</Link>
        <a href="#wallet-history" className="qa-link"><HistoryIcon size={16} /> {t("wallet.viewHistory")}</a>
        <Link href="/dashboard" className="qa-link qa-muted"><WalletIcon size={16} /> {t("wallet.backToDashboard")}</Link>
      </div>

      <style jsx>{`
        .wallet-page {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 1020px;
          margin: 0 auto;
        }
        .wallet-hero {
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .hero-actions {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .balance-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .cta-link {
          color: #c4b5fd;
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 0.28rem;
        }
        .cta-link:hover {
          color: #f5d0fe;
        }
        .wallet-banner {
          padding: 0.9rem 1rem;
        }
        .banner-content {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.86rem;
          color: #fda4af;
        }
        .banner-icon {
          width: 1.65rem;
          height: 1.65rem;
          border-radius: 10px;
          border: 1px solid rgba(248,113,113,0.34);
          background: rgba(248,113,113,0.14);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .passes-card {
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .section-link {
          color: #a5f3fc;
          font-size: 0.78rem;
          font-weight: 700;
          text-decoration: none;
        }
        .section-link:hover {
          color: #67e8f9;
        }
        .pass-list {
          display: flex;
          flex-direction: column;
          gap: 0.56rem;
        }
        .pass-row {
          display: flex;
          justify-content: space-between;
          gap: 0.8rem;
          align-items: center;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.2);
          background: rgba(255,255,255,0.03);
          padding: 0.78rem 0.85rem;
        }
        .pass-main {
          display: flex;
          align-items: center;
          gap: 0.58rem;
          min-width: 0;
        }
        .pass-icon {
          width: 1.9rem;
          height: 1.9rem;
          border-radius: 12px;
          border: 1px solid rgba(34,211,238,0.3);
          background: rgba(34,211,238,0.12);
          color: #a5f3fc;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .pass-main strong {
          font-size: 0.86rem;
          color: #fff;
        }
        .pass-main p {
          margin: 0.16rem 0 0;
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .empty-line {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          color: var(--text-muted);
          font-size: 0.84rem;
          padding: 0.45rem 0;
        }
        .empty-icon {
          width: 1.65rem;
          height: 1.65rem;
          border-radius: 10px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(255,255,255,0.04);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #c4b5fd;
        }
        .inline-action {
          color: #c4b5fd;
          font-size: 0.8rem;
          font-weight: 700;
          text-decoration: none;
        }
        .inline-action:hover {
          color: #f5d0fe;
        }
        .tx-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.72rem;
        }
        .quick-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.56rem;
        }
        .qa-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          border-radius: 12px;
          border: 1px solid rgba(224,64,251,0.32);
          background: rgba(224,64,251,0.12);
          color: #f5d0fe;
          text-decoration: none;
          font-size: 0.81rem;
          font-weight: 700;
          padding: 0.72rem;
          transition: border-color var(--transition), background var(--transition), transform var(--transition);
        }
        .qa-link:hover {
          border-color: rgba(224,64,251,0.5);
          background: rgba(224,64,251,0.2);
          transform: translateY(-1px);
        }
        .qa-muted {
          border-color: rgba(148,163,184,0.27);
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
        }
        .qa-muted:hover {
          border-color: rgba(148,163,184,0.42);
          color: #e2e8f0;
        }
        @media (max-width: 960px) {
          .balance-grid,
          .tx-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .wallet-hero,
          .passes-card {
            padding: 1rem;
          }
          .quick-actions {
            grid-template-columns: 1fr;
          }
          .hero-actions {
            width: 100%;
          }
          .hero-actions :global(.btn) {
            flex: 1;
          }
          .pass-row {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
