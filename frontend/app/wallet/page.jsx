"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import FuturisticCard from "@/components/ui/FuturisticCard";
import FuturisticBalanceCard from "@/components/ui/FuturisticBalanceCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import TransactionListCard from "@/components/ui/TransactionListCard";
import NeonBadge from "@/components/ui/NeonBadge";
import {
  ActivityIcon,
  AlertIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CoinIcon,
  EmptyStateIcon,
  HistoryIcon,
  SparkIcon,
  VideoIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function timeLeft(iso) {
  if (!iso) return "";
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return "Expirado";
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

const COIN_TX_LABELS = {
  purchase: { label: "Compra", tone: "green" },
  gift_sent: { label: "Regalo enviado", tone: "pink" },
  gift_received: { label: "Regalo recibido", tone: "green" },
  private_call: { label: "Llamada privada", tone: "pink" },
  call_started: { label: "Llamada iniciada", tone: "pink" },
  call_earned: { label: "Llamada recibida", tone: "green" },
  room_entry: { label: "Entrada a sala", tone: "purple" },
  content_unlock: { label: "Contenido desbloqueado", tone: "purple" },
  content_earned: { label: "Contenido exclusivo", tone: "green" },
  refund: { label: "Reembolso", tone: "green" },
  daily_reward: { label: "Recompensa diaria", tone: "cyan" },
  referral_reward: { label: "Recompensa referido", tone: "cyan" },
  agency_earned: { label: "Comisión agencia", tone: "green" },
  admin_adjustment: { label: "Ajuste admin", tone: "purple" },
};

const SPARK_TX_LABELS = {
  purchase: { label: "Compra", tone: "green" },
  boost_used: { label: "Boost activado", tone: "pink" },
  pass_purchase: { label: "Pase adquirido", tone: "purple" },
  match_boost: { label: "Match boost", tone: "purple" },
  speed_dating: { label: "Speed dating", tone: "purple" },
  room_entry: { label: "Entrada a sala", tone: "pink" },
  admin_adjustment: { label: "Ajuste admin", tone: "purple" },
};

export default function WalletPage() {
  const { data: session } = useSession();
  const [coins, setCoins] = useState(null);
  const [sparks, setSparks] = useState(null);
  const [earningsCoins, setEarningsCoins] = useState(null);
  const [activePasses, setActivePasses] = useState([]);
  const [recentCoinTx, setRecentCoinTx] = useState([]);
  const [recentSparkTx, setRecentSparkTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const localToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const token = localToken || session?.backendToken || null;

    if (!token) {
      setLoading(false);
      setError("Inicia sesión para ver tu wallet.");
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
          setError("No pudimos cargar tu saldo en este momento.");
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
        setError("No fue posible conectar con el servidor. Inténtalo de nuevo.");
      })
      .finally(() => setLoading(false));
  }, [session?.backendToken]);

  if (loading) {
    return (
      <div className="wallet-loading" role="status" aria-live="polite">
        <span className="spinner" />
        <span>Sincronizando tu wallet premium…</span>
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
          eyebrow="Mi Wallet"
          title="Control total de tus monedas y actividad"
          subtitle="Gestiona saldo, compras y movimientos con una vista clara de tu valor dentro de MeetYouLive."
          action={
            <div className="hero-actions">
              <Link href="/coins" className="btn btn-primary btn-sm">Comprar más</Link>
              <Link href="/coins" className="btn btn-secondary btn-sm">Ver historial</Link>
            </div>
          }
        />

        <div className="balance-grid">
          <FuturisticBalanceCard
            title="MYL Coins"
            value={coins ?? "—"}
            icon={<CoinIcon size={16} />}
            tone="orange"
            description="Saldo para regalos, llamadas privadas y desbloqueos premium."
            action={<Link href="/coins" className="cta-link">Usar mis monedas <ArrowRightIcon size={14} /></Link>}
          />
          <FuturisticBalanceCard
            title="Sparks"
            value={sparks ?? "—"}
            icon={<SparkIcon size={16} />}
            tone="purple"
            description="Moneda social para boosts, pases y visibilidad adicional."
            action={<Link href="/sparks" className="cta-link">Comprar Sparks <ArrowRightIcon size={14} /></Link>}
          />
          {earningsCoins !== null && earningsCoins > 0 ? (
            <FuturisticBalanceCard
              title="Ganancias creator"
              value={earningsCoins}
              icon={<ActivityIcon size={16} />}
              tone="green"
              description="Coins obtenidos por regalos, llamadas y contenido exclusivo."
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
          title="Access Passes activos"
          subtitle="Tus accesos premium disponibles ahora mismo."
          action={<Link href="/passes" className="section-link">Ver todos →</Link>}
        />

        {activePasses.length === 0 ? (
          <div className="empty-line">
            <span className="empty-icon"><EmptyStateIcon size={15} /></span>
            <span>No tienes pases activos por ahora.</span>
            <Link href="/passes" className="inline-action">Explorar pases</Link>
          </div>
        ) : (
          <div className="pass-list">
            {activePasses.map((pass) => {
              const name = PASS_INFO[pass.type] || pass.type;
              return (
                <div key={pass._id} className="pass-row">
                  <div className="pass-main">
                    <span className="pass-icon"><VideoIcon size={15} /></span>
                    <div>
                      <strong>{name}</strong>
                      <p>Expira en {timeLeft(pass.expiresAt)} · {formatDate(pass.expiresAt)}</p>
                    </div>
                  </div>
                  <NeonBadge tone="green"><CheckCircleIcon size={11} /> Activo</NeonBadge>
                </div>
              );
            })}
          </div>
        )}
      </FuturisticCard>

      <div className="tx-grid">
        <TransactionListCard
          title="Últimos movimientos de Coins"
          subtitle="Entradas y consumos recientes."
          items={recentCoinTx}
          loading={false}
          emptyText="Todavía no hay transacciones de coins."
          labels={COIN_TX_LABELS}
          symbol="Coins"
          historyHref="/coins"
          actionLabel="Ir a Coins"
        />

        <TransactionListCard
          title="Últimos movimientos de Sparks"
          subtitle="Actividad social y compras recientes."
          items={recentSparkTx}
          loading={false}
          emptyText="Todavía no hay transacciones de sparks."
          labels={SPARK_TX_LABELS}
          symbol="Sparks"
          historyHref="/sparks"
          actionLabel="Ir a Sparks"
        />
      </div>

      <div className="quick-actions">
        <Link href="/coins" className="qa-link"><CoinIcon size={16} /> Comprar MYL Coins</Link>
        <Link href="/wallet" className="qa-link"><HistoryIcon size={16} /> Ver historial</Link>
        <Link href="/dashboard" className="qa-link qa-muted"><WalletIcon size={16} /> Volver al dashboard</Link>
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
