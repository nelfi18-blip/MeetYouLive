"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function CreatorEarningsDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [error, setError] = useState(null);

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
        throw new Error(data.message || "Error al cargar el dashboard");
      }

      setDashboardData(data);
    } catch (err) {
      console.error("Error fetching dashboard:", err);
      setError(err.message || "Error al cargar el dashboard");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      fetchDashboardData();
    }
  }, [status, router, fetchDashboardData]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando dashboard...</div>
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
            Volver al Dashboard
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
  } = dashboardData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Panel de Ganancias 💰</h1>
            <p className="text-gray-300">Seguimiento de tus ingresos y rendimiento</p>
          </div>
          <Link
            href="/dashboard"
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition"
          >
            ← Volver
          </Link>
        </div>

        {/* Section 1: Today and Total Earnings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <EarningsCard
            title="Ganado hoy"
            amount={todayEarnings}
            icon="💰"
            color="from-green-600 to-green-800"
          />
          <EarningsCard
            title="Ganado total"
            amount={totalEarnings}
            icon="🔥"
            color="from-purple-600 to-purple-800"
          />
        </div>

        {/* Section 2: Top Fan and Gifts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <StatCard
            title="Top fan"
            icon="👑"
            color="from-yellow-600 to-yellow-800"
          >
            {topSupporter ? (
              <div>
                <p className="text-2xl font-bold mb-1">{topSupporter.username}</p>
                <p className="text-lg text-gray-300">
                  {topSupporter.totalCoins.toLocaleString()} monedas
                </p>
              </div>
            ) : (
              <p className="text-gray-400">Aún no tienes fans</p>
            )}
          </StatCard>
          <StatCard
            title="Regalos recibidos"
            icon="🎁"
            color="from-pink-600 to-pink-800"
          >
            <p className="text-4xl font-bold">{totalGiftsReceived.toLocaleString()}</p>
          </StatCard>
        </div>

        {/* Section 3: Average per Live */}
        <div className="mb-8">
          <StatCard
            title="Promedio por live"
            icon="📈"
            color="from-blue-600 to-blue-800"
          >
            <p className="text-4xl font-bold mb-2">
              {avgEarningsPerLive.toLocaleString()} monedas
            </p>
            <p className="text-sm text-gray-300">
              Basado en {totalLives} transmisiones
            </p>
          </StatCard>
        </div>

        {/* Section 4: Agency Metrics (conditional) */}
        {agencyMetrics && (
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>Estadísticas de Agencia</span>
              <span>🏢</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <StatCard
                title="Total invitados"
                icon="👥"
                color="from-indigo-600 to-indigo-800"
              >
                <p className="text-4xl font-bold">
                  {agencyMetrics.totalSubCreators}
                </p>
              </StatCard>
              <StatCard
                title="Ingresos por invitados"
                icon="💸"
                color="from-teal-600 to-teal-800"
              >
                <p className="text-4xl font-bold">
                  {agencyMetrics.commissionEarned.toLocaleString()}
                </p>
                <p className="text-sm text-gray-300 mt-1">monedas ganadas</p>
              </StatCard>
            </div>
          </div>
        )}

        {/* Call to Action */}
        <div className="mt-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-8 text-center">
          <h3 className="text-3xl font-bold mb-4">¡Sigue creciendo! 🚀</h3>
          <p className="text-lg mb-6">
            Continúa haciendo transmisiones para aumentar tus ganancias
          </p>
          <Link
            href="/live/create"
            className="inline-block bg-white text-purple-600 font-bold px-8 py-3 rounded-lg hover:bg-gray-100 transition"
          >
            Iniciar transmisión en vivo
          </Link>
        </div>
      </div>
    </div>
  );
}

// Earnings Card Component
function EarningsCard({ title, amount, icon, color }) {
  return (
    <div
      className={`bg-gradient-to-br ${color} rounded-2xl p-6 shadow-xl border border-white/10`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white/90">{title}</h3>
        <span className="text-4xl">{icon}</span>
      </div>
      <p className="text-5xl font-bold">{amount.toLocaleString()}</p>
      <p className="text-sm text-white/70 mt-2">monedas</p>
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
