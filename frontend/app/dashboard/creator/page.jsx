"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function CreatorEarningsDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [error, setError] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);

  const fetchDashboardData = useCallback(async () => {
    if (!session?.backendToken) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/creator/dashboard`, {
        headers: {
          Authorization: `Bearer ${session.backendToken}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || t("creatorDashboard.loadError"));
      }

      setDashboardData(data);
    } catch (err) {
      console.error("Error fetching dashboard:", err);
      setError(err.message || t("creatorDashboard.loadError"));
    } finally {
      setLoading(false);
    }
  }, [session, t]);

  const fetchPayoutHistory = useCallback(async () => {
    if (!session?.backendToken) return;

    try {
      const res = await fetch(`${API_URL}/api/creator/payout-history?limit=10`, {
        headers: {
          Authorization: `Bearer ${session.backendToken}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setPayoutHistory(data.payouts || []);
      }
    } catch (err) {
      console.error("Error fetching payout history:", err);
    }
  }, [session]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      fetchDashboardData();
      fetchPayoutHistory();
    }
  }, [status, router, fetchDashboardData, fetchPayoutHistory]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">{t("creatorDashboard.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="bg-red-500/20 border border-red-500 text-white px-6 py-4 rounded-lg">
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{error}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm"
          >
            {t("creatorDashboard.backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return null;
  }

  const {
    todayEarnings = 0,
    totalEarnings = 0,
    totalGiftsReceived = 0,
    topSupporter = null,
    avgEarningsPerLive = 0,
    agencyMetrics = null,
    totalLives = 0,
    earningsCoins = 0,
  } = dashboardData || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">{t("creatorDashboard.title")} 💰</h1>
            <p className="text-gray-300">{t("creatorDashboard.subtitle")}</p>
          </div>
          <Link
            href="/dashboard"
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition"
          >
            ← {t("creatorDashboard.back")}
          </Link>
        </div>

        {/* Section 1: Today and Total Earnings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <EarningsCard
            title={t("creatorDashboard.earnedToday")}
            amount={todayEarnings}
            icon="💰"
            color="from-green-600 to-green-800"
            unitLabel={t("common.coins")}
          />
          <EarningsCard
            title={t("creatorDashboard.totalEarned")}
            amount={totalEarnings}
            icon="🔥"
            color="from-purple-600 to-purple-800"
            unitLabel={t("common.coins")}
          />
        </div>

        {/* Payout request: unified in the Creator Hub (/creator), which
            collects the PayPal destination before submitting. This page no
            longer sends payout/withdrawal requests itself — it only shows
            balance + history so the same earnings can never be requested
            through two different flows at once. */}
        <div className="mb-8 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-6 shadow-xl border border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>{t("creatorDashboard.availableForWithdrawal")} 💵</span>
              </h2>
              <p className="text-4xl font-bold">{earningsCoins.toLocaleString()} {t("common.coins")}</p>
              <p className="text-sm text-white/70 mt-1">≈ ${(earningsCoins / 10).toFixed(2)} USD</p>
            </div>
            <Link
              href="/creator"
              className="inline-block text-center bg-white text-indigo-600 hover:bg-gray-100 font-semibold px-6 py-3 rounded-lg transition"
            >
              💰 {t("creatorDashboard.goToCreatorPayout")}
            </Link>
          </div>
          <p className="text-sm text-white/70 mt-4">{t("creatorDashboard.payoutFlowMovedNotice")}</p>
        </div>

        {/* Payout history: read-only, fed by the same /api/creator/payout-history
            endpoint used by the Creator Hub. */}
        <div className="mb-8 bg-white/5 rounded-2xl p-6 border border-white/10">
          <h2 className="text-xl font-bold mb-4">{t("creatorDashboard.payoutHistoryTitle")}</h2>
          {payoutHistory.length === 0 ? (
            <p className="text-gray-400 text-sm">{t("creatorDashboard.payoutHistoryEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {payoutHistory.map((payout) => (
                    <tr key={payout._id} className="border-b border-white/10 last:border-0">
                      <td className="py-2 pr-4 text-gray-300">
                        {payout.createdAt ? new Date(payout.createdAt).toLocaleDateString(t("common.locale")) : "—"}
                      </td>
                      <td className="py-2 pr-4 font-semibold">
                        {Number(payout.amountCoins || 0).toLocaleString()} {t("common.coins")}
                      </td>
                      <td className="py-2 pr-4 text-gray-300 capitalize">{payout.method}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            payout.status === "paid"
                              ? "bg-green-500/20 text-green-300"
                              : payout.status === "approved"
                                ? "bg-blue-500/20 text-blue-300"
                                : payout.status === "rejected"
                                  ? "bg-red-500/20 text-red-300"
                                  : "bg-yellow-500/20 text-yellow-300"
                          }`}
                        >
                          {t(`creatorDashboard.payoutHistoryStatus.${payout.status}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>


        {/* Section 2: Top Fan and Gifts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <StatCard
            title={t("creatorDashboard.topFan")}
            icon="👑"
            color="from-yellow-600 to-yellow-800"
          >
            {topSupporter ? (
              <div>
                <p className="text-2xl font-bold mb-1">{topSupporter.username}</p>
                <p className="text-lg text-gray-300">
                  {topSupporter.totalCoins.toLocaleString()} {t("common.coins")}
                </p>
              </div>
            ) : (
              <p className="text-gray-400">{t("creatorDashboard.noFansYet")}</p>
            )}
          </StatCard>
          <StatCard
            title={t("creatorDashboard.receivedGifts")}
            icon="🎁"
            color="from-pink-600 to-pink-800"
          >
            <p className="text-4xl font-bold">{totalGiftsReceived.toLocaleString()}</p>
          </StatCard>
        </div>

        {/* Section 3: Average per Live */}
        <div className="mb-8">
          <StatCard
            title={t("creatorDashboard.averagePerLive")}
            icon="📈"
            color="from-blue-600 to-blue-800"
          >
            <p className="text-4xl font-bold mb-2">
              {avgEarningsPerLive.toLocaleString()} {t("common.coins")}
            </p>
            <p className="text-sm text-gray-300">
              {t("creatorDashboard.basedOnLives").replace("{count}", String(totalLives))}
            </p>
          </StatCard>
        </div>

        {/* Section 4: Agency Metrics (conditional) */}
        {agencyMetrics && (
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>{t("creatorDashboard.agencyStats")}</span>
              <span>🏢</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <StatCard
                title={t("creatorDashboard.totalGuests")}
                icon="👥"
                color="from-indigo-600 to-indigo-800"
              >
                <p className="text-4xl font-bold">
                  {agencyMetrics.totalSubCreators}
                </p>
              </StatCard>
              <StatCard
                title={t("creatorDashboard.guestRevenue")}
                icon="💸"
                color="from-teal-600 to-teal-800"
              >
                <p className="text-4xl font-bold">
                  {agencyMetrics.commissionEarned.toLocaleString()}
                </p>
                <p className="text-sm text-gray-300 mt-1">{t("creatorDashboard.earnedCoins")}</p>
              </StatCard>
            </div>
          </div>
        )}

        {/* Call to Action */}
        <div className="mt-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-8 text-center">
          <h3 className="text-3xl font-bold mb-4">{t("creatorDashboard.keepGrowing")} 🚀</h3>
          <p className="text-lg mb-6">
            {t("creatorDashboard.keepStreaming")}
          </p>
          <Link
            href="/live/start"
            className="inline-block bg-white text-purple-600 font-bold px-8 py-3 rounded-lg hover:bg-gray-100 transition"
          >
            {t("creatorDashboard.startLive")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// Earnings Card Component
function EarningsCard({ title, amount, icon, color, unitLabel }) {
  return (
    <div
      className={`bg-gradient-to-br ${color} rounded-2xl p-6 shadow-xl border border-white/10`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white/90">{title}</h3>
        <span className="text-4xl">{icon}</span>
      </div>
      <p className="text-5xl font-bold">{amount.toLocaleString()}</p>
      <p className="text-sm text-white/70 mt-2">{unitLabel}</p>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, icon, color, children }) {
  return (
    <div
      className={`bg-gradient-to-br ${color} rounded-2xl p-6 shadow-xl border border-white/10`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white/90">{title}</h3>
        <span className="text-4xl">{icon}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}
