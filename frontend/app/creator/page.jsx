"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { getFullLocale } from "@/lib/localeUtils";
import { clearToken } from "@/lib/token";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { isValidPaypalEmail } from "@/lib/payoutValidation";
import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import CreatorCommandCenter from "@/components/creator/CreatorCommandCenter";
import CreatorSnapshotRail from "@/components/creator/CreatorSnapshotRail";
import CreatorDayProgress from "@/components/creator/CreatorDayProgress";
import CreatorActionLauncher from "@/components/creator/CreatorActionLauncher";
import CreatorWalletCompact from "@/components/creator/CreatorWalletCompact";
import CreatorPayoutProfileCard from "@/components/creator/CreatorPayoutProfileCard";
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
  const [payoutProfile, setPayoutProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [paypalEmailError, setPaypalEmailError] = useState("");
  // Stable per-attempt key: reused across retries of the SAME logical
  // request (e.g. a tap that double-fires, or a retry after a network
  // error with the same destination email) so the backend's idempotency
  // check can recognize a replay instead of creating a second Payout. It is
  // reset to null whenever the request becomes a genuinely NEW one (the
  // destination email changed, the modal was cancelled, or the previous
  // attempt already succeeded) — see resetPayoutIdempotencyKey below.
  const payoutIdempotencyKeyRef = useRef(null);
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

        const [dashboardRes, earningsRes, agencyRes, payoutProfileRes] = await Promise.all([
          fetch(`${API_URL}/api/creator/dashboard`, { headers }),
          fetch(`${API_URL}/api/creator/earnings`, { headers }),
          fetch(`${API_URL}/api/agency/me`, { headers }),
          fetch(`${API_URL}/api/creator/payout-profile`, { headers }),
        ]);

        if (dashboardRes.ok) setDashboard(await dashboardRes.json());
        if (earningsRes.ok) setEarnings(await earningsRes.json());
        if (agencyRes.ok) setAgencyData(await agencyRes.json());
        if (payoutProfileRes.ok) {
          const payoutProfileData = await payoutProfileRes.json();
          setPayoutProfile(payoutProfileData.profile);
        }

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
  const isPayoutProfileComplete = payoutProfile?.completionStatus === "complete";
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

  const openPayoutModal = () => {
    if (!isApproved) return;
    if (!isPayoutProfileComplete) {
      setPayoutError(t("creatorPage.payoutProfileCompleteRequiredNote"));
      const target = document.getElementById("payout-profile");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setPayoutError("");
    setPayoutSuccess("");
    setPaypalEmailError("");
    setPayoutModalOpen(true);
  };

  const closePayoutModal = () => {
    if (payoutLoading) return;
    setPayoutModalOpen(false);
    setPaypalEmailError("");
    // Cancelling means any further attempt is a brand-new request, not a
    // retry of this one.
    payoutIdempotencyKeyRef.current = null;
  };

  const handleConfirmPayout = async () => {
    const token = localStorage.getItem("token");
    if (!token || !isApproved || payoutLoading) return;

    // The PayPal destination is always the one saved on "Mi cuenta de
    // cobros" — it can never be substituted from this modal. To change it,
    // the creator must update their payout profile first.
    const savedEmail = (payoutProfile?.destination?.paypalEmail || "").trim();
    if (!isValidPaypalEmail(savedEmail)) {
      setPaypalEmailError(t("creatorPage.payoutPaypalEmailInvalid"));
      return;
    }

    // Reuse the key across retries of this exact (method, email) attempt;
    // only mint a new one the first time this logical request is sent.
    if (!payoutIdempotencyKeyRef.current) {
      payoutIdempotencyKeyRef.current =
        globalThis.crypto?.randomUUID?.() || `payout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    setPayoutLoading(true);
    setPayoutError("");
    setPayoutSuccess("");

    try {
      const response = await fetch(`${API_URL}/api/creator/request-payout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": payoutIdempotencyKeyRef.current,
        },
        body: JSON.stringify({ method: "paypal", paymentDetails: savedEmail }),
      });
      const data = await response.json();
      const payoutFallbackId =
        data.payout?._id ||
        globalThis.crypto?.randomUUID?.() ||
        `payout-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (!response.ok) throw new Error(data.message || t("creatorPage.payoutProcessError"));

      setPayoutSuccess(t("creatorPage.payoutRequestSent"));
      setPayoutModalOpen(false);
      // The request succeeded: this attempt is finished, so the next click
      // of "withdraw" must start a brand-new request with a fresh key.
      payoutIdempotencyKeyRef.current = null;
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
      // Keep the idempotency key: if the creator retries with the same
      // email, the backend will recognize it as the same request instead
      // of reserving the balance twice.
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
        onRequestPayout={isApproved ? openPayoutModal : null}
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
            <CreatorWalletCompact hasPendingPayout={hasPendingPayout} isPayoutProfileComplete={isPayoutProfileComplete} />
          </section>

          <section id="payout-profile">
            <CreatorPayoutProfileCard onProfileChange={setPayoutProfile} />
          </section>

          <section>
            <CreatorActionLauncher
              canMonetize
              profileHref={profileHref}
              onRequestPayout={openPayoutModal}
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

      {payoutModalOpen ? (
        <div
          className="payout-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payout-modal-title"
          onClick={closePayoutModal}
        >
          <div className="payout-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <h3 id="payout-modal-title" className="payout-modal-title">
              {t("creatorPage.payoutPaypalModalTitle")}
            </h3>
            <p className="payout-modal-subtitle">{t("creatorPage.payoutPaypalModalSubtitle")}</p>

            <span className="payout-modal-label">{t("creatorPage.payoutPaypalEmailLabel")}</span>
            {/* The saved PayPal destination is reused as-is and can never be
                substituted here — changing it requires updating "Mi cuenta
                de cobros", which already enforces its own validation and
                pending-withdrawal lock. */}
            <p className="payout-modal-destination" data-testid="payout-modal-destination">
              {payoutProfile?.destination?.maskedPaypalEmail || "—"}
            </p>
            <a href="#payout-profile" className="payout-modal-change-link" onClick={closePayoutModal}>
              {t("creatorPage.payoutPaypalChangeDestinationLink")}
            </a>
            {paypalEmailError ? <p className="payout-modal-error">{paypalEmailError}</p> : null}

            <div className="payout-modal-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closePayoutModal}
                disabled={payoutLoading}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmPayout}
                disabled={payoutLoading || !payoutProfile?.destination?.paypalEmail}
              >
                {payoutLoading ? t("creatorDashboard.processing") : t("creatorPage.payoutPaypalConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .creator-pro-page {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          max-width: 1040px;
          margin: 0 auto;
          padding: 0.9rem 0;
          min-width: 0;
        }
        .creator-pro-page :global(.command-center) {
          padding: 0.9rem;
          gap: 0.7rem;
          border-radius: var(--radius);
          border-color: var(--border);
        }
        .creator-pro-page :global(.snapshot-card),
        .creator-pro-page :global(.day-card),
        .creator-pro-page :global(.wallet-compact),
        .creator-pro-page :global(.network-card) {
          padding: 0.85rem 0.9rem;
        }
        .creator-pro-page :global(.snapshot-card),
        .creator-pro-page :global(.day-card),
        .creator-pro-page :global(.network-card) {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .creator-pro-page :global(.tips-card) {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.85rem 0 0.85rem 0.9rem;
        }
        .creator-pro-page :global(.live-cta) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          min-height: 44px;
          padding: 0.85rem 0.9rem;
          border: 1px solid var(--border-glow);
          border-radius: var(--radius-sm);
          background: var(--grad-primary);
          color: var(--text);
          font-size: 0.96rem;
          font-weight: 800;
          text-decoration: none;
          box-shadow: var(--shadow-sm);
        }
        .creator-pro-page :global(.analytics-cta),
        .creator-pro-page :global(.manage-btn),
        .creator-pro-page :global(.activate-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          gap: 0.32rem;
          min-height: 44px;
          padding: 0.4rem 0.75rem;
          border: 1px solid rgba(34, 211, 238, 0.35);
          border-radius: var(--radius-pill);
          background: rgba(34, 211, 238, 0.1);
          color: var(--accent-cyan);
          font-size: 0.7rem;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }
        .creator-pro-page :global(.network-cta) {
          flex-shrink: 0;
          max-width: 40%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--accent-cyan);
          font-size: 0.66rem;
          font-weight: 700;
          text-decoration: none;
        }
        .creator-pro-page :global(.live-cta:hover),
        .creator-pro-page :global(.analytics-cta:hover),
        .creator-pro-page :global(.manage-btn:hover),
        .creator-pro-page :global(.activate-btn:hover) {
          filter: brightness(1.12);
        }
        .creator-pro-page :global(.metric-icon),
        .creator-pro-page :global(.wallet-icon),
        .creator-pro-page :global(.network-icon) {
          width: 1.7rem;
          height: 1.7rem;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .creator-pro-page :global(.feedback-banner) {
          padding: 0.78rem 0.9rem;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: #fda4af;
          font-size: 0.84rem;
          font-weight: 600;
        }
        .creator-pro-page :global(.feedback-ok) {
          color: #86efac;
        }
        .feedback-icon {
          width: 1.65rem;
          height: 1.65rem;
          border-radius: 50%;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(255, 255, 255, 0.06);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .creator-pro-page :global(.state-card) {
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
        @media (max-width: 540px) {
          .creator-pro-page :global(.snapshot-card),
          .creator-pro-page :global(.day-card),
          .creator-pro-page :global(.wallet-compact),
          .creator-pro-page :global(.network-card) {
            padding: 0.95rem;
          }
          .creator-pro-page :global(.snapshot-metric) {
            gap: 0.3rem;
            padding: 0.45rem 0.3rem;
            border-radius: 0.65rem;
            background: rgba(255, 255, 255, 0.035);
          }
          .creator-pro-page :global(.metric-icon) {
            width: 2rem;
            height: 2rem;
          }
          .creator-pro-page :global(.metric-value) {
            max-width: 100%;
            overflow: visible;
            overflow-wrap: anywhere;
            text-overflow: clip;
            white-space: normal;
          }
          .creator-pro-page :global(.metric-label) {
            max-width: 100%;
            overflow: visible;
            overflow-wrap: anywhere;
            text-overflow: clip;
            white-space: normal;
            color: #cbd5e1;
            font-size: 0.68rem;
            line-height: 1.25;
          }
          .creator-pro-page :global(.metric-unit),
          .creator-pro-page :global(.progress-copy),
          .creator-pro-page :global(.row-date),
          .creator-pro-page :global(.no-activity),
          .creator-pro-page :global(.network-summary) {
            color: #cbd5e1;
          }
          .creator-pro-page :global(.network-summary),
          .creator-pro-page :global(.row-copy strong) {
            white-space: normal;
            overflow: visible;
            overflow-wrap: anywhere;
            text-overflow: clip;
          }
          .creator-pro-page :global(.network-cta) {
            max-width: 45%;
            flex-shrink: 1;
            overflow: visible;
            overflow-wrap: anywhere;
            text-overflow: clip;
            white-space: normal;
          }
        }
        @media (max-width: 420px) {
          .creator-pro-page {
            gap: 0.55rem;
          }
          .creator-pro-page :global(.snapshot-card),
          .creator-pro-page :global(.day-card),
          .creator-pro-page :global(.wallet-compact),
          .creator-pro-page :global(.network-card) {
            padding: 1rem;
          }
          .creator-pro-page :global(.analytics-cta) { width: 100%; }
          .creator-pro-page :global(.network-cta) {
            max-width: 100%;
            flex-basis: 100%;
            overflow: visible;
            overflow-wrap: anywhere;
            text-overflow: clip;
            white-space: normal;
          }
        }
        /* BottomNav clearance for /creator is provided transversally by the
           shared .main-content-bottom-nav reservation (--bottom-spacing-mobile
           in app/globals.css), which already exceeds the real BottomNavEnhanced
           footprint (~93px plus the central "IR" button) with margin to spare.
           No local override is needed here; keep it that way unless the real
           nav geometry changes. */

        /* Mobile-first PayPal destination modal: a simple bottom sheet on
           small screens, centered dialog on larger ones. */
        .payout-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          background: rgba(8, 6, 20, 0.72);
          backdrop-filter: blur(4px);
          padding: 0;
        }
        .payout-modal-sheet {
          width: 100%;
          max-width: 440px;
          background: #130f24;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 1.1rem 1.1rem 0 0;
          padding: 1.25rem 1.1rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .payout-modal-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: #fff;
          margin: 0;
        }
        .payout-modal-subtitle {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.7);
          margin: 0 0 0.3rem;
        }
        .payout-modal-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
        }
        .payout-modal-input {
          width: 100%;
          padding: 0.7rem 0.8rem;
          border-radius: 0.65rem;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-size: 0.95rem;
        }
        .payout-modal-input:focus {
          outline: none;
          border-color: #a78bfa;
        }
        .payout-modal-destination {
          width: 100%;
          padding: 0.7rem 0.8rem;
          border-radius: 0.65rem;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-size: 0.95rem;
          font-weight: 700;
          margin: 0;
        }
        .payout-modal-change-link {
          align-self: flex-start;
          font-size: 0.78rem;
          font-weight: 600;
          color: #c4b5fd;
          text-decoration: underline;
        }
        .payout-modal-error {
          color: #fda4af;
          font-size: 0.78rem;
          margin: 0;
        }
        .payout-modal-actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 0.4rem;
        }
        .payout-modal-actions button {
          flex: 1;
        }
        @media (min-width: 640px) {
          .payout-modal-overlay {
            align-items: center;
          }
          .payout-modal-sheet {
            border-radius: 1.1rem;
          }
        }
      `}</style>
    </div>
  );
}
