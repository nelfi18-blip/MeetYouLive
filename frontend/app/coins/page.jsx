"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import UrgencyBanner from "@/components/UrgencyBanner";
import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import PurchasePackageCard from "@/components/ui/PurchasePackageCard";
import TransactionListCard from "@/components/ui/TransactionListCard";
import NeonBadge from "@/components/ui/NeonBadge";
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

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const PACKAGES = [
  {
    value: 100,
    label: "Starter Pack",
    coins: "100",
    price: "$4.99",
    priceNote: "pago único",
    desc: "Perfecto para empezar a enviar regalos y desbloquear primeras experiencias.",
    perCoin: "$0.0499",
    badge: "Acceso inicial",
    badgeTone: "purple",
    benefit: "Entrada rápida",
  },
  {
    value: 250,
    label: "Popular Pack",
    coins: "250",
    price: "$9.99",
    priceNote: "pago único",
    desc: "El equilibrio ideal entre precio y alcance para uso frecuente.",
    perCoin: "$0.0399",
    highlight: true,
    badge: "Más popular",
    badgeTone: "pink",
    benefit: "Mejor ritmo",
  },
  {
    value: 700,
    label: "Elite Pack",
    coins: "700",
    price: "$19.99",
    priceNote: "pago único",
    desc: "Máximo valor para usuarios que quieren acceso continuo a experiencias premium.",
    perCoin: "$0.0285",
    badge: "Mejor valor",
    badgeTone: "green",
    benefit: "Ahorro superior",
  },
];

const TX_TYPE_LABELS = {
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

const COIN_USES = [
  {
    title: "Regalos premium",
    desc: "Impulsa conexiones enviando regalos con mayor visibilidad en directo.",
    icon: <GiftIcon size={17} />,
  },
  {
    title: "Llamadas privadas",
    desc: "Accede a sesiones exclusivas 1:1 con creators verificados.",
    icon: <VideoIcon size={17} />,
  },
  {
    title: "Contenido exclusivo",
    desc: "Desbloquea contenido premium y experiencias limitadas por creator.",
    icon: <LockIcon size={17} />,
  },
];

export default function BuyCoinsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState(null);
  const [sparks, setSparks] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);

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
    setLoading(true);
    try {
      const token = localStorage.getItem("token") || session?.backendToken;
      const res = await fetch(`${API_URL}/api/payments/coins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al iniciar el pago");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("No se pudo conectar con el servidor");
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
          eyebrow="Monetización oficial"
          title="MYL Coins: acceso directo a experiencias premium"
          subtitle="Invierte en conexiones reales con una moneda clara, segura y diseñada para regalos, llamadas privadas y contenido exclusivo."
        />

        <div className="hero-balance-grid">
          <div className="hero-balance-pill">
            <span className="hero-pill-icon"><CoinIcon size={16} /></span>
            <span className="hero-pill-label">Saldo actual</span>
            <strong className="hero-pill-value">{balance ?? "—"} Coins</strong>
          </div>
          <Link href="/wallet" className="hero-balance-pill is-link">
            <span className="hero-pill-icon"><WalletIcon size={16} /></span>
            <span className="hero-pill-label">Wallet completa</span>
            <strong className="hero-pill-value">Ver saldo e historial</strong>
          </Link>
          {sparks !== null && (
            <Link href="/sparks" className="hero-balance-pill is-link is-sparks">
              <span className="hero-pill-icon"><SparkIcon size={16} /></span>
              <span className="hero-pill-label">Sparks disponibles</span>
              <strong className="hero-pill-value">{sparks}</strong>
            </Link>
          )}
        </div>

        <div className="hero-cta-row">
          <a href="#packages" className="btn btn-primary btn-lg">
            Comprar coins ahora <ArrowRightIcon size={16} />
          </a>
          <Link href="/wallet" className="btn btn-secondary btn-lg">
            Ver mi wallet <HistoryIcon size={16} />
          </Link>
        </div>
      </FuturisticCard>

      {error ? <div className="banner-error">{error}</div> : null}

      <section id="packages" className="coin-section">
        <PremiumSectionHeader
          eyebrow="Paquetes oficiales"
          title="Elige tu paquete MYL Coins"
          subtitle="Todos los pagos se procesan con Stripe y redirección segura."
        />
        <div className="packages-grid">
          {PACKAGES.map((pkg) => (
            <PurchasePackageCard key={pkg.value} pkg={pkg} onBuy={buy} loading={loading} />
          ))}
        </div>
      </section>

      <FuturisticCard className="trust-card" accent="cyan" hover={false}>
        <PremiumSectionHeader
          eyebrow="Valor real"
          title="¿Qué puedes hacer con tus MYL Coins?"
          subtitle="Las monedas se convierten en acceso premium dentro de la experiencia en vivo."
        />

        <div className="uses-grid">
          {COIN_USES.map((use) => (
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
          <NeonBadge tone="green"><ShieldIcon size={12} /> Pago seguro</NeonBadge>
          <NeonBadge tone="purple"><CardIcon size={12} /> Stripe integrado</NeonBadge>
          <NeonBadge tone="cyan"><TrendUpIcon size={12} /> Monetización transparente</NeonBadge>
        </div>
      </FuturisticCard>

      <TransactionListCard
        title="Historial de Coins"
        subtitle="Seguimiento claro de compras y consumos recientes."
        items={transactions}
        loading={txLoading}
        emptyText="Aún no tienes movimientos. Tu historial aparecerá después de tu primera compra o uso."
        labels={TX_TYPE_LABELS}
        symbol="Coins"
        historyHref="/wallet"
        actionLabel="Ver wallet completo"
      />

      <div className="support-actions">
        <Link href="/wallet" className="support-link">
          <WalletIcon size={16} /> Ver saldo e historial completo
        </Link>
        <Link href="/dashboard" className="support-link support-link-muted">
          <ArrowRightIcon size={16} /> Volver al dashboard
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
          .hero-card,
          .trust-card {
            padding: 1rem;
          }
          .hero-balance-grid,
          .packages-grid,
          .uses-grid,
          .support-actions {
            grid-template-columns: 1fr;
          }
          .hero-cta-row {
            flex-direction: column;
          }
          .hero-cta-row :global(.btn) {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
