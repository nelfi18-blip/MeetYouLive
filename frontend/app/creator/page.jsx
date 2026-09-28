"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { getFullLocale } from "@/lib/localeUtils";
import { clearToken } from "@/lib/token";
import { isApprovedCreator } from "@/lib/creatorUtils";
import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import CreatorHeroCard from "@/components/creator/CreatorHeroCard";
import CreatorCenterNav from "@/components/creator/CreatorCenterNav";
import EarningsStatCard from "@/components/creator/EarningsStatCard";
import MonetizationHistoryCard from "@/components/creator/MonetizationHistoryCard";
import CreatorProgressCard from "@/components/creator/CreatorProgressCard";
import CreatorQuickActions from "@/components/creator/CreatorQuickActions";
import {
  ActivityIcon,
  AlertIcon,
  CheckCircleIcon,
  CoinIcon,
  GiftIcon,
  VideoIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

// Force dynamic rendering - this page requires client-side logic
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const DEFAULT_MIN_PAYOUT_COINS = 100;

function formatCoins(value) {
  return Number(value || 0).toLocaleString(getFullLocale());
}

function formatCount(value) {
  return new Intl.NumberFormat(getFullLocale(), { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function getStatusConfig(t, isCreator, status) {
  if (!isCreator) {
    return {
      title: t("creatorPage.activatePanelTitle"),
      subtitle: t("creatorPage.activatePanelSubtitle"),
      cta: { href: "/creator-request", label: t("creatorPage.requestAccess") },
      helperTitle: t("creatorPage.notCreatorYetTitle"),
      helperCopy: t("creatorPage.notCreatorYetCopy"),
    };
  }

  if (status === "pending") {
    return {
      title: t("creatorPage.requestInReviewTitle"),
      subtitle: t("creatorPage.requestInReviewSubtitle"),
      cta: { href: "/creator-request", label: t("creatorPage.completeProfile") },
      helperTitle: t("creatorPage.requestReviewHelperTitle"),
      helperCopy: t("creatorPage.requestReviewHelperCopy"),
    };
  }

  if (status === "rejected") {
    return {
      title: t("creatorPage.requestNeedsChangesTitle"),
      subtitle: t("creatorPage.requestNeedsChangesSubtitle"),
      cta: { href: "/creator-request", label: t("creatorPage.updateRequest") },
      helperTitle: t("creatorPage.requestRejectedTitle"),
      helperCopy: t("creatorPage.requestRejectedCopy"),
    };
  }

  if (status === "suspended") {
    return {
      title: t("creatorPage.suspendedTitle"),
      subtitle: t("creatorPage.suspendedSubtitle"),
      cta: { href: "/profile", label: t("creatorPage.viewProfile") },
      helperTitle: t("creatorPage.suspendedHelperTitle"),
      helperCopy: t("creatorPage.suspendedHelperCopy"),
    };
  }

  return {
    title: t("creatorPage.realtimeEarningsTitle"),
    subtitle: t("creatorPage.realtimeEarningsSubtitle"),
    cta: { href: "/live/start", label: t("creatorPage.goLive"), icon: "live" },
    helperTitle: t("creatorPage.canMonetizeTitle"),
    helperCopy: t("creatorPage.canMonetizeCopy"),
  };
}

export default function CreatorPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");
  const [agencyData, setAgencyData] = useState(null);
  const [agencyCopied, setAgencyCopied] = useState(false);
  const [agencyCopyError, setAgencyCopyError] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/me`, { headers })
      .then(async (res) => {
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        if (!res.ok) throw new Error(t("creatorPage.loadProfileError"));

        const userData = await res.json();
        setUser(userData);

        if (!isApprovedCreator(userData)) return null;

        const [dashboardRes, earningsRes, agencyRes] = await Promise.all([
          fetch(`${API_URL}/api/creator/dashboard`, { headers }),
          fetch(`${API_URL}/api/creator/earnings`, { headers }),
          fetch(`${API_URL}/api/agency/me`, { headers }),
        ]);

        if (dashboardRes.ok) setDashboard(await dashboardRes.json());
        if (earningsRes.ok) setEarnings(await earningsRes.json());
        if (agencyRes.ok) setAgencyData(await agencyRes.json());

        return null;
      })
      .catch((err) => setError(err.message || t("creatorPage.loadPanelError")))
      .finally(() => setLoading(false));
  }, [router, t]);

  const hasCreatorRole = user?.role === "creator" || user?.role === "subCreator";
  const creatorStatus = hasCreatorRole ? user?.creatorStatus || "none" : "none";
  const isApproved = isApprovedCreator(user);

  const statusConfig = getStatusConfig(t, hasCreatorRole, creatorStatus);
  const displayName = user?.creatorProfile?.displayName || user?.username || user?.name || t("creatorPage.creatorFallback");
  const avatar = user?.avatar || null;
  const creatorLevel = dashboard?.creatorLevel || null;
  const activeLive = dashboard?.activeLive || null;
  const earningsHighlight = formatCoins(
    isApproved
      ? dashboard?.totalEarnedLifetime ?? earnings?.totalEarnedLifetime ?? user?.earningsCoins
      : user?.earningsCoins
  );
  const availableForPayout = Number(
    dashboard?.earningsCoins ?? earnings?.availableForPayoutCoins ?? user?.earningsCoins ?? 0
  );
  const minPayoutCoins = Number(dashboard?.minPayoutCoins ?? DEFAULT_MIN_PAYOUT_COINS);
  const profileHref = user?._id ? `/creator/${user._id}` : "/profile";
  const hasPendingPayout = Boolean(dashboard?.pendingPayout);
  const isPayoutDisabled = payoutLoading || availableForPayout < minPayoutCoins || hasPendingPayout;
  const importantNotificationsCount = Number(hasPendingPayout) + Number(isApproved && availableForPayout < minPayoutCoins);

  const statsCards = useMemo(() => {
    if (!isApproved) return [];

    return [
      {
        key: "available",
        label: t("creatorPage.availableBalance"),
        value: formatCoins(availableForPayout),
        unit: t("common.coins"),
        icon: <WalletIcon size={14} />,
        accent: "green",
        helper: t("creatorPage.readyForPayout"),
      },
      {
        key: "today",
        label: t("creatorPage.todayEarnings"),
        value: formatCoins(dashboard?.todayEarnings ?? dashboard?.todayCoins ?? 0),
        unit: t("common.coins"),
        icon: <CoinIcon size={14} />,
        accent: "purple",
        helper: t("creatorPage.earningsGeneratedToday"),
      },
      {
        key: "followers",
        label: t("creatorPage.newFollowers"),
        value: formatCount(dashboard?.newFollowersToday ?? dashboard?.followersToday ?? 0),
        icon: <ActivityIcon size={14} />,
        accent: "cyan",
        helper: t("creatorPage.audienceGrowth"),
      },
      {
        key: "gifts",
        label: t("creatorPage.giftsReceived"),
        value: formatCount(dashboard?.totalGiftsReceived ?? dashboard?.totalGifts ?? earnings?.totalGiftCount ?? 0),
        icon: <GiftIcon size={14} />,
        accent: "orange",
        helper: t("creatorPage.accumulatedFanGifts"),
      },
      {
        key: "live",
        label: t("creatorPage.activeLive"),
        value: activeLive ? t("creatorPage.active") : t("creatorPage.inactive"),
        icon: <VideoIcon size={14} />,
        accent: activeLive ? "pink" : "purple",
        helper: activeLive?.title || t("creatorPage.noActiveStream"),
      },
      {
        key: "notifications",
        label: t("creatorPage.importantNotifications"),
        value: formatCount(importantNotificationsCount),
        icon: <AlertIcon size={14} />,
        accent: "pink",
        helper: t("creatorPage.relevantAlerts"),
      },
    ];
  }, [dashboard, earnings, isApproved, availableForPayout, activeLive, importantNotificationsCount, t]);

  const handleRequestPayout = async () => {
    const token = localStorage.getItem("token");
    if (!token || !isApproved) return;

    setPayoutLoading(true);
    setPayoutError("");
    setPayoutSuccess("");

    try {
      const response = await fetch(`${API_URL}/api/creator/request-payout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      const payoutFallbackId =
        data.payout?._id ||
        globalThis.crypto?.randomUUID?.() ||
        `payout-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (!response.ok) throw new Error(data.message || t("creatorPage.payoutProcessError"));

      setPayoutSuccess(t("creatorPage.payoutRequestSent"));
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          earningsCoins: 0,
          pendingPayout: data.payout || prev.pendingPayout,
          pendingPayoutCoins: (prev.pendingPayoutCoins || 0) + (data.payout?.amountCoins || 0),
        };
      });
      setEarnings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          availableForPayoutCoins: 0,
          pendingPayoutCoins: (prev.pendingPayoutCoins || 0) + (data.payout?.amountCoins || 0),
          recentMonetizationActivity: [
            {
              _id: payoutFallbackId,
              type: "payout",
              label: t("creatorPage.payoutRequestLabel"),
              amountCoins: data.payout?.amountCoins || 0,
              status: data.payout?.status || "pending",
              createdAt: data.payout?.createdAt || new Date().toISOString(),
            },
            ...(prev.recentMonetizationActivity || []),
          ],
        };
      });
      setUser((prev) => (prev ? { ...prev, earningsCoins: 0 } : prev));
    } catch (err) {
      setPayoutError(err.message || t("creatorPage.payoutProcessError"));
    } finally {
      setPayoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="creator-pro-page">
        <div className="skeleton" style={{ height: 210, borderRadius: "var(--radius)" }} />
        <div className="skeleton-grid">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="skeleton" style={{ height: 130, borderRadius: "var(--radius)" }} />
          ))}
        </div>
        <style jsx>{`
          .creator-pro-page {
            display: flex;
            flex-direction: column;
            gap: 0.9rem;
            max-width: 1080px;
            margin: 0 auto;
          }
          .skeleton-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.75rem;
          }
          @media (max-width: 920px) {
            .skeleton-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="creator-pro-page">
      <CreatorHeroCard
        displayName={displayName}
        avatar={avatar}
        status={creatorStatus}
        statusCopy={{ title: statusConfig.title, subtitle: statusConfig.subtitle }}
        creatorLevel={creatorLevel}
        earningsHighlight={earningsHighlight}
        availableForPayout={isApproved ? availableForPayout : null}
        activeLive={activeLive}
        cta={statusConfig.cta}
      />

      <CreatorCenterNav />

      {error ? (
        <FuturisticCard className="feedback-banner" accent="pink" hover={false}>
          <span className="feedback-icon"><AlertIcon size={15} /></span>
          <span>{error}</span>
        </FuturisticCard>
      ) : null}

      {payoutError ? (
        <FuturisticCard className="feedback-banner" accent="pink" hover={false}>
          <span className="feedback-icon"><AlertIcon size={15} /></span>
          <span>{payoutError}</span>
        </FuturisticCard>
      ) : null}

      {payoutSuccess ? (
        <FuturisticCard className="feedback-banner feedback-ok" accent="green" hover={false}>
          <span className="feedback-icon"><CheckCircleIcon size={15} /></span>
          <span>{payoutSuccess}</span>
        </FuturisticCard>
      ) : null}

      {isApproved ? (
        <>
          <section id="earnings">
            <PremiumSectionHeader
              title={t("creatorPage.dashboardTitle")}
              subtitle={t("creatorPage.dashboardSubtitle")}
            />
            <div className="stats-grid">
              {statsCards.map((item) => (
                <EarningsStatCard
                  key={item.key}
                  label={item.label}
                  value={item.value}
                  unit={item.unit}
                  icon={item.icon}
                  helper={item.helper}
                  accent={item.accent}
                />
              ))}
            </div>
          </section>

          <section id="gifts">
            <MonetizationHistoryCard items={earnings?.recentMonetizationActivity || []} />
          </section>

          <section id="analytics">
            <CreatorProgressCard
              creatorLevel={creatorLevel}
              consistencyDays={dashboard?.consistencyDays || 0}
            />
          </section>

          <FuturisticCard id="wallet" className="quick-actions-card" accent="purple" hover={false}>
            <PremiumSectionHeader
              title={t("creatorPage.walletTitle")}
              subtitle={t("creatorPage.walletSubtitle")}
            />
            <CreatorQuickActions
              canMonetize
              profileHref={profileHref}
              onRequestPayout={handleRequestPayout}
              payoutDisabled={isPayoutDisabled}
            />
            {hasPendingPayout ? (
              <p className="quick-note">
                {t("creatorPage.pendingPayoutNote")
                  .replace("{coins}", formatCoins(dashboard?.pendingPayout?.amountCoins ?? 0))
                  .replace("{currency}", t("common.coins"))}
              </p>
            ) : availableForPayout < minPayoutCoins ? (
              <p className="quick-note">
                {t("creatorPage.minPayoutNote")
                  .replace("{coins}", minPayoutCoins)
                  .replace("{currency}", t("common.coins"))}
              </p>
            ) : null}
          </FuturisticCard>

          <FuturisticCard className="structure-card" accent="cyan" hover={false}>
            <PremiumSectionHeader
              title={t("creatorPage.sectionsTitle")}
              subtitle={t("creatorPage.sectionsSubtitle")}
            />
            <div className="structure-grid">
              <div id="followers" className="structure-item">
                <strong>{t("creatorPage.communityTitle")}</strong>
                <span>{t("creatorPage.communityDescription")}</span>
              </div>
              <div id="withdrawals" className="structure-item">
                <strong>{t("creatorPage.withdrawalsTitle")}</strong>
                <span>{t("creatorPage.withdrawalsDescription")}</span>
              </div>
              <div id="creator-settings" className="structure-item">
                <strong>{t("creatorPage.settingsTitle")}</strong>
                <span>{t("creatorPage.settingsDescription")}</span>
              </div>
            </div>
          </FuturisticCard>

          {agencyData && (
            <FuturisticCard className="agency-card" accent="cyan" hover={false}>
              <PremiumSectionHeader
                title={t("creatorPage.agencyTitle")}
                subtitle={t("creatorPage.agencySubtitle")}
                action={<Link href="/agency" className="btn btn-secondary btn-sm">{t("creatorPage.viewFullPanel")}</Link>}
              />

              <div className="agency-stats">
                <div className="agency-stat">
                  <div className="agency-stat-value">{agencyData.agencyProfile?.subCreatorsCount || 0}</div>
                  <div className="agency-stat-label">{t("creatorPage.subCreators")}</div>
                </div>
                <div className="agency-stat">
                  <div className="agency-stat-value agency-stat-green">{formatCoins(agencyData.agencyEarningsCoins || 0)}</div>
                  <div className="agency-stat-label">{t("creatorPage.commissionEarned")}</div>
                </div>
                <div className="agency-stat">
                  <div className="agency-stat-value agency-stat-purple">{formatCoins(agencyData.totalAgencyGeneratedCoins || 0)}</div>
                  <div className="agency-stat-label">{t("creatorPage.totalGenerated")}</div>
                </div>
                <div className="agency-stat">
                  <div className="agency-stat-value">{agencyData.counts?.pending || 0}</div>
                  <div className="agency-stat-label">{t("creatorPage.pending")}</div>
                </div>
              </div>

              {agencyData.agencyProfile?.agencyCode ? (
                <div className="agency-invite-row">
                  <div className="agency-invite-url">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/register?creatorInvite=${agencyData.agencyProfile.agencyCode}`
                      : `/register?creatorInvite=${agencyData.agencyProfile.agencyCode}`}
                  </div>
                  <button
                    className={`agency-copy-btn${agencyCopied ? " copied" : agencyCopyError ? " error" : ""}`}
                    onClick={() => {
                      const url = `${window.location.origin}/register?creatorInvite=${agencyData.agencyProfile.agencyCode}`;
                      navigator.clipboard.writeText(url).then(() => {
                        setAgencyCopied(true);
                        setAgencyCopyError(false);
                        setTimeout(() => setAgencyCopied(false), 2000);
                      }).catch(() => {
                        setAgencyCopyError(true);
                        setTimeout(() => setAgencyCopyError(false), 3000);
                      });
                    }}
                  >
                    {agencyCopied
                      ? t("creatorPage.copied")
                      : agencyCopyError
                        ? t("creatorPage.copyError")
                        : t("creatorPage.copyLink")}
                  </button>
                  <Link href="/agency" className="agency-manage-btn">
                    {t("creatorPage.manageNetwork")}
                  </Link>
                </div>
              ) : (
                <Link href="/agency" className="btn btn-secondary btn-sm" style={{ marginTop: "0.5rem" }}>
                  {t("creatorPage.activateAgency")}
                </Link>
              )}
            </FuturisticCard>
          )}
        </>
      ) : (
        <FuturisticCard className="state-card" accent="cyan" hover={false}>
          <PremiumSectionHeader
            title={statusConfig.helperTitle}
            subtitle={statusConfig.helperCopy}
            action={<Link href={statusConfig.cta.href} className="btn btn-secondary btn-sm">{statusConfig.cta.label}</Link>}
          />
          <CreatorQuickActions
            canMonetize={false}
            profileHref={profileHref}
            onRequestPayout={() => {}}
            payoutDisabled
          />
        </FuturisticCard>
      )}

      <style jsx>{`
        .creator-pro-page {
          display: flex;
          flex-direction: column;
          gap: 0.95rem;
          max-width: 1080px;
          margin: 0 auto;
          padding-bottom: 1.6rem;
        }
        .feedback-banner {
          padding: 0.78rem 0.9rem;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: #fda4af;
          font-size: 0.84rem;
          font-weight: 600;
        }
        .feedback-ok {
          color: #86efac;
        }
        .feedback-icon {
          width: 1.65rem;
          height: 1.65rem;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(255, 255, 255, 0.06);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .stats-grid {
          margin-top: 0.74rem;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.62rem;
        }
        .quick-actions-card,
        .state-card,
        .agency-card,
        .structure-card {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.82rem;
        }
        .quick-note {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.79rem;
        }
        .agency-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.6rem;
        }
        .agency-stat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 0.65rem 0.8rem;
          text-align: center;
        }
        .agency-stat-value {
          font-size: 1.25rem;
          font-weight: 800;
          color: #e2e8f0;
          line-height: 1.2;
        }
        .agency-stat-green { color: #34d399; }
        .agency-stat-purple { color: #a78bfa; }
        .agency-stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          margin-top: 0.2rem;
        }
        .agency-invite-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 0.65rem 0.8rem;
        }
        .agency-invite-url {
          flex: 1;
          min-width: 0;
          font-size: 0.72rem;
          color: #818cf8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .agency-copy-btn {
          flex-shrink: 0;
          background: rgba(139,92,246,0.18);
          border: 1px solid rgba(139,92,246,0.4);
          color: #c4b5fd;
          border-radius: 8px;
          padding: 0.35rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s;
        }
        .agency-copy-btn.copied {
          background: rgba(52,211,153,0.18);
          border-color: rgba(52,211,153,0.4);
          color: #6ee7b7;
        }
        .agency-copy-btn.error {
          background: rgba(239,68,68,0.12);
          border-color: rgba(239,68,68,0.3);
          color: #fca5a5;
        }
        .agency-copy-btn:hover { background: rgba(139,92,246,0.28); }
        .agency-manage-btn {
          flex-shrink: 0;
          background: rgba(34,211,238,0.12);
          border: 1px solid rgba(34,211,238,0.3);
          color: #67e8f9;
          border-radius: 8px;
          padding: 0.35rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }
        .agency-manage-btn:hover { background: rgba(34,211,238,0.2); }
        .structure-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.6rem;
        }
        .structure-item {
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          border-radius: 12px;
          padding: 0.72rem;
          display: flex;
          flex-direction: column;
          gap: 0.28rem;
        }
        .structure-item strong {
          color: #e0f2fe;
          font-size: 0.84rem;
        }
        .structure-item span {
          color: var(--text-muted);
          font-size: 0.75rem;
          line-height: 1.45;
        }
        @media (min-width: 760px) {
          .stats-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 760px) {
          .structure-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (min-width: 1100px) {
          .stats-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
