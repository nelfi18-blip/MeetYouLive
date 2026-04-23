"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/token";
import FuturisticCard from "@/components/ui/FuturisticCard";
import PremiumSectionHeader from "@/components/ui/PremiumSectionHeader";
import CreatorHeroCard from "@/components/creator/CreatorHeroCard";
import EarningsStatCard from "@/components/creator/EarningsStatCard";
import MonetizationHistoryCard from "@/components/creator/MonetizationHistoryCard";
import CreatorProgressCard from "@/components/creator/CreatorProgressCard";
import CreatorQuickActions from "@/components/creator/CreatorQuickActions";
import {
  ActivityIcon,
  AlertIcon,
  CardIcon,
  CheckCircleIcon,
  CoinIcon,
  GiftIcon,
  VideoIcon,
  WalletIcon,
} from "@/components/ui/MonetizationIcons";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const DEFAULT_MIN_PAYOUT_COINS = 100;

function formatCoins(value) {
  return Number(value || 0).toLocaleString("es-ES");
}

function getStatusConfig(isCreator, status) {
  if (!isCreator) {
    return {
      title: "Activa tu panel de creador",
      subtitle: "Solicita acceso para desbloquear monetización, historial de ingresos y herramientas premium.",
      cta: { href: "/creator-request", label: "Solicitar acceso" },
      helperTitle: "Aún no eres creador",
      helperCopy: "Completa tu solicitud para comenzar a monetizar en MeetYouLive.",
    };
  }

  if (status === "pending") {
    return {
      title: "Solicitud en revisión",
      subtitle: "Nuestro equipo está revisando tu acceso de creador. Te notificaremos pronto.",
      cta: { href: "/creator-request", label: "Completar perfil" },
      helperTitle: "Tu solicitud está en revisión",
      helperCopy: "Mientras tanto, puedes mejorar tu perfil y preparar tu contenido.",
    };
  }

  if (status === "rejected") {
    return {
      title: "Tu solicitud necesita ajustes",
      subtitle: "Revisa tu perfil de creador y vuelve a enviar la solicitud con la información actualizada.",
      cta: { href: "/creator-request", label: "Actualizar solicitud" },
      helperTitle: "Solicitud rechazada",
      helperCopy: "Puedes volver a aplicar cuando tengas el perfil actualizado.",
    };
  }

  if (status === "suspended") {
    return {
      title: "Cuenta de creador suspendida",
      subtitle: "El acceso a monetización está temporalmente limitado. Revisa tu perfil para más detalles.",
      cta: { href: "/profile", label: "Ver perfil" },
      helperTitle: "Estado suspendido",
      helperCopy: "No hay acciones de monetización disponibles mientras la cuenta esté suspendida.",
    };
  }

  return {
    title: "Tus ganancias en tiempo real",
    subtitle: "Controla ingresos, progreso y actividad de monetización desde un solo lugar.",
    cta: { href: "/live/start", label: "Ir en vivo", icon: "live" },
    helperTitle: "Ya puedes monetizar tu contenido",
    helperCopy: "Tu panel se actualiza con tus regalos, retiros y progreso como creador.",
  };
}

export default function CreatorPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");

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
        if (!res.ok) throw new Error("No pudimos cargar tu perfil");

        const userData = await res.json();
        setUser(userData);

        const isApprovedCreator = userData?.role === "creator" && userData?.creatorStatus === "approved";
        if (!isApprovedCreator) return null;

        const [dashboardRes, earningsRes] = await Promise.all([
          fetch(`${API_URL}/api/creator/dashboard`, { headers }),
          fetch(`${API_URL}/api/creator/earnings`, { headers }),
        ]);

        if (dashboardRes.ok) setDashboard(await dashboardRes.json());
        if (earningsRes.ok) setEarnings(await earningsRes.json());

        return null;
      })
      .catch((err) => setError(err.message || "No se pudo cargar el panel de creador"))
      .finally(() => setLoading(false));
  }, [router]);

  const creatorStatus = user?.role === "creator" ? user?.creatorStatus || "none" : "none";
  const isCreator = user?.role === "creator";
  const isApproved = isCreator && creatorStatus === "approved";

  const statusConfig = getStatusConfig(isCreator, creatorStatus);
  const displayName = user?.creatorProfile?.displayName || user?.username || user?.name || "Creador";
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

  const statsCards = useMemo(() => {
    if (!isApproved) return [];

    const cards = [
      {
        key: "available",
        label: "Disponible para retiro",
        value: formatCoins(availableForPayout),
        unit: "monedas",
        icon: <WalletIcon size={14} />,
        accent: "green",
        helper: "Balance listo para solicitar retiro.",
      },
      {
        key: "total",
        label: "Total generado",
        value: formatCoins(dashboard?.totalEarnedLifetime ?? earnings?.totalEarnedLifetime ?? 0),
        unit: "monedas",
        icon: <CoinIcon size={14} />,
        accent: "purple",
        helper: "Ingresos acumulados de tu actividad monetizada.",
      },
      {
        key: "pending",
        label: "Pendiente de retiro",
        value: formatCoins(dashboard?.pendingPayoutCoins ?? earnings?.pendingPayoutCoins ?? 0),
        unit: "monedas",
        icon: <WalletIcon size={14} />,
        accent: "cyan",
        helper: "Fondos en proceso de pago.",
      },
      {
        key: "withdrawn",
        label: "Retirado",
        value: formatCoins(dashboard?.withdrawnCoins ?? earnings?.withdrawnCoins ?? 0),
        unit: "monedas",
        icon: <CardIcon size={14} />,
        accent: "pink",
      },
      {
        key: "gifts",
        label: "Regalos recibidos",
        value: formatCoins(dashboard?.totalGifts ?? earnings?.totalGiftCount ?? 0),
        icon: <GiftIcon size={14} />,
        accent: "orange",
      },
      {
        key: "calls",
        label: "Ganancias por llamadas",
        value: formatCoins(dashboard?.totalCallEarnings ?? 0),
        unit: "monedas",
        icon: <ActivityIcon size={14} />,
        accent: "cyan",
        helper: "Ganancias por llamadas privadas.",
      },
      {
        key: "lives",
        label: "Directos realizados",
        value: formatCoins(dashboard?.totalLives ?? 0),
        icon: <VideoIcon size={14} />,
        accent: "purple",
        helper: "Directos publicados como creador.",
      },
    ];

    return cards;
  }, [dashboard, earnings, isApproved, availableForPayout]);

  const handleRequestPayout = async () => {
    const token = localStorage.getItem("token");
    if (!token || !isApproved) return;

    setPayoutLoading(true);
    setPayoutError("");
    setPayoutSuccess("");

    try {
      const response = await fetch(`${API_URL}/api/creator/payout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      const payoutFallbackId =
        data.payout?._id ||
        globalThis.crypto?.randomUUID?.() ||
        `payout-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (!response.ok) throw new Error(data.message || "No pudimos procesar el retiro");

      setPayoutSuccess(data.message || "Solicitud enviada correctamente.");
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
              label: "Solicitud de retiro",
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
      setPayoutError(err.message || "No pudimos procesar el retiro");
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
          <section>
            <PremiumSectionHeader
              title="Resumen de ganancias"
              subtitle="Visualiza tu dinero y actividad de monetización en segundos."
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

          <section id="monetization-history">
            <MonetizationHistoryCard items={earnings?.recentMonetizationActivity || []} />
          </section>

          <CreatorProgressCard
            creatorLevel={creatorLevel}
            consistencyDays={dashboard?.consistencyDays || 0}
          />

          <FuturisticCard className="quick-actions-card" accent="purple" hover={false}>
            <PremiumSectionHeader
              title="Acciones rápidas"
              subtitle="Activa las acciones que más impactan tu monetización."
            />
            <CreatorQuickActions
              canMonetize
              profileHref={profileHref}
              onRequestPayout={handleRequestPayout}
              payoutDisabled={isPayoutDisabled}
            />
            {hasPendingPayout ? (
              <p className="quick-note">
                Ya tienes una solicitud de retiro en proceso ({formatCoins(dashboard?.pendingPayout?.amountCoins ?? 0)} monedas).
              </p>
            ) : availableForPayout < minPayoutCoins ? (
              <p className="quick-note">
                Necesitas al menos {minPayoutCoins} monedas para solicitar retiro.
              </p>
            ) : null}
          </FuturisticCard>
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
        .state-card {
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
        @media (min-width: 760px) {
          .stats-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
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
