"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";


// Force dynamic rendering - this page requires client-side logic
export const dynamic = 'force-dynamic';


const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function CreatorEarningsDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [error, setError] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutFormData, setPayoutFormData] = useState({
    method: "stripe",
    paymentDetails: "",
  });
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState(null);
  
  // New withdrawal request states
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [withdrawalMessage, setWithdrawalMessage] = useState(null);

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

  const handleRequestPayout = async (e) => {
    e.preventDefault();
    setPayoutLoading(true);
    setPayoutMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/creator/request-payout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify(payoutFormData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Error al solicitar retiro");
      }

      setPayoutMessage({ type: "success", text: "Solicitud de retiro enviada" });
      setShowPayoutForm(false);
      setPayoutFormData({ method: "stripe", paymentDetails: "" });
      
      // Refresh dashboard and payout history
      await Promise.all([fetchDashboardData(), fetchPayoutHistory()]);
    } catch (err) {
      setPayoutMessage({ type: "error", text: err.message });
    } finally {
      setPayoutLoading(false);
    }
  };
  
  // New withdrawal request handler
  const handleRequestWithdrawal = async (e) => {
    e.preventDefault();
    setWithdrawalLoading(true);
    setWithdrawalMessage(null);

    try {
      const amountCoins = parseInt(withdrawalAmount, 10);
      if (!amountCoins || amountCoins < 1000) {
        throw new Error("El mínimo de retiro es 1000 monedas");
      }

      const res = await fetch(`${API_URL}/api/withdraw/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.backendToken}`,
        },
        body: JSON.stringify({ amountCoins }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Error al solicitar retiro");
      }

      setWithdrawalMessage({ type: "success", text: "Solicitud de retiro enviada exitosamente" });
      setShowWithdrawalForm(false);
      setWithdrawalAmount("");
      
      // Refresh dashboard data
      await fetchDashboardData();
    } catch (err) {
      setWithdrawalMessage({ type: "error", text: err.message });
    } finally {
      setWithdrawalLoading(false);
    }
  };

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
    earningsCoins = 0,
  } = dashboardData || {};

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

        {/* Payout Message */}
        {payoutMessage && (
          <div className={`mb-6 p-4 rounded-lg ${
            payoutMessage.type === "success" 
              ? "bg-green-500/20 border border-green-500" 
              : "bg-red-500/20 border border-red-500"
          }`}>
            <p>{payoutMessage.text}</p>
          </div>
        )}

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

        {/* Withdrawal Message */}
        {withdrawalMessage && (
          <div className={`mb-6 p-4 rounded-lg ${
            withdrawalMessage.type === "success" 
              ? "bg-green-500/20 border border-green-500" 
              : "bg-red-500/20 border border-red-500"
          }`}>
            <p>{withdrawalMessage.text}</p>
          </div>
        )}

        {/* Withdrawal Section */}
        <div className="mb-8 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-6 shadow-xl border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span>Disponible para retiro 💵</span>
              </h2>
              <p className="text-4xl font-bold">{earningsCoins.toLocaleString()} monedas</p>
              <p className="text-sm text-white/70 mt-1">≈ ${(earningsCoins / 10).toFixed(2)} USD</p>
            </div>
            <button
              onClick={() => setShowWithdrawalForm(!showWithdrawalForm)}
              disabled={earningsCoins < 1000}
              className={`px-6 py-3 rounded-lg font-semibold transition ${
                earningsCoins < 1000
                  ? "bg-gray-600 cursor-not-allowed opacity-50"
                  : "bg-white text-indigo-600 hover:bg-gray-100"
              }`}
            >
              {showWithdrawalForm ? "Cancelar" : "💰 Retirar ganancias"}
            </button>
          </div>

          {earningsCoins < 1000 && (
            <p className="text-sm text-yellow-300 mt-2">
              ⚠️ Mínimo para retiro: 1,000 monedas
            </p>
          )}

          {/* Withdrawal Request Form */}
          {showWithdrawalForm && (
            <form onSubmit={handleRequestWithdrawal} className="mt-6 pt-6 border-t border-white/20">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Cantidad a retirar (monedas)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    max={earningsCoins}
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    placeholder="Mínimo 1,000 monedas"
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 outline-none text-white"
                    required
                  />
                  <p className="text-xs text-white/60 mt-1">
                    Equivalente: ${((parseInt(withdrawalAmount) || 0) / 10).toFixed(2)} USD
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={withdrawalLoading}
                  className="w-full bg-white text-indigo-600 hover:bg-gray-100 font-semibold py-3 rounded-lg transition disabled:opacity-50"
                >
                  {withdrawalLoading ? "Procesando..." : "Solicitar retiro"}
                </button>
                <p className="text-xs text-white/60">
                  Tu solicitud será revisada por un administrador. Las monedas se bloquearán temporalmente hasta que se apruebe o rechace la solicitud.
                </p>
              </div>
            </form>
          )}
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
