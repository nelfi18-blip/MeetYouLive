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
import CreatorCommandCenter from "@/components/creator/CreatorCommandCenter";
import CreatorSnapshotRail from "@/components/creator/CreatorSnapshotRail";
import CreatorDayProgress from "@/components/creator/CreatorDayProgress";
import CreatorActionLauncher from "@/components/creator/CreatorActionLauncher";
import CreatorWalletCompact from "@/components/creator/CreatorWalletCompact";
import CreatorNetworkCompact from "@/components/creator/CreatorNetworkCompact";
import CreatorGrowthTipsCard from "@/components/creator/CreatorGrowthTipsCard";
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

  const todaySummaryCards = useMemo(() => {
    const order = ["followers", "gifts", "today", "notifications"];
    return order
      .map((key) => statsCards.find((item) => item.key === key))
      .filter(Boolean);
  }, [statsCards]);

  const todayDate = useMemo(
    () => new Date().toLocaleDateString(t("common.locale"), { day: "2-digit", month: "short", year: "numeric" }),
    [t]
  );

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

  const handleCopyAgencyLink = () => {
    const agencyCode = agencyData?.agencyProfile?.agencyCode;
    if (!agencyCode) return;
    const url = `${window.location.origin}/register?creatorInvite=${agencyCode}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setAgencyCopied(true);
        setAgencyCopyError(false);
        setTimeout(() => setAgencyCopied(false), 2000);
      })
      .catch(() => {
        setAgencyCopyError(true);
        setTimeout(() => setAgencyCopyError(false), 3000);
      });
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
      <CreatorCommandCenter
        displayName={displayName}
        avatar={avatar}
        status={creatorStatus}
        statusCopy={{ title: statusConfig.title, subtitle: statusConfig.subtitle }}
        creatorLevel={creatorLevel}
        availableForPayout={isApproved ? availableForPayout : null}
        activeLive={activeLive}
        cta={statusConfig.cta}
        secondaryCta={isApproved ? { href: "/creator#analytics", label: t("creatorPage.viewAnalytics") } : null}
        onRequestPayout={isApproved ? handleRequestPayout : null}
        payoutDisabled={isPayoutDisabled}
        payoutNote={
          isApproved
            ? hasPendingPayout
              ? t("creatorPage.pendingPayoutNote")
                  .replace("{coins}", formatCoins(dashboard?.pendingPayout?.amountCoins ?? 0))
                  .replace("{currency}", t("common.coins"))
              : availableForPayout < minPayoutCoins
                ? t("creatorPage.minPayoutNote")
                    .replace("{coins}", minPayoutCoins)
                    .replace("{currency}", t("common.coins"))
                : null
            : null
        }
      />

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
            <span id="followers" className="anchor-target" aria-hidden="true" />
            <CreatorSnapshotRail items={todaySummaryCards} subtitle={todayDate} />
          </section>

          <section id="analytics">
            <CreatorDayProgress
              creatorLevel={creatorLevel}
              consistencyDays={dashboard?.consistencyDays || 0}
              items={earnings?.recentMonetizationActivity || []}
            />
          </section>

          <section id="wallet">
            <CreatorWalletCompact hasPendingPayout={hasPendingPayout} />
          </section>

          <section>
            <CreatorActionLauncher
              canMonetize
              profileHref={profileHref}
              onRequestPayout={handleRequestPayout}
              payoutDisabled={isPayoutDisabled}
            />
          </section>

          <CreatorNetworkCompact
            agencyData={agencyData}
            agencyCopied={agencyCopied}
            agencyCopyError={agencyCopyError}
            onCopyLink={handleCopyAgencyLink}
          />

          <CreatorGrowthTipsCard />
        </>
      ) : (
        <FuturisticCard className="state-card" accent="cyan" hover={false}>
          <PremiumSectionHeader
            title={statusConfig.helperTitle}
            subtitle={statusConfig.helperCopy}
            action={<Link href={statusConfig.cta.href} className="btn btn-secondary btn-sm">{statusConfig.cta.label}</Link>}
          />
          <CreatorActionLauncher
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
          gap: 0.75rem;
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
        .state-card {
          padding: 0.85rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .anchor-target {
          display: block;
          height: 0;
          width: 0;
        }
        /* Ensure the last cards/actions clear the fixed mobile BottomNav
           (pill nav + safe-area-inset-bottom) instead of relying solely on
           the shared .main-content spacing. */
        @media (max-width: 768px) {
          .creator-pro-page {
            padding-bottom: calc(6.5rem + env(safe-area-inset-bottom));
          }
          /* scroll-margin (not extra padding) keeps interactive controls
             reachable above the fixed BottomNav when they are scrolled or
             focused into view (e.g. keyboard navigation, in-page anchors),
             without adding more empty space at the end of the page. */
          .creator-pro-page :global(button),
          .creator-pro-page :global(a) {
            scroll-margin-bottom: calc(96px + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  );
}
