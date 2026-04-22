"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 2000;

function SuccessContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const retryTimerRef = useRef(null);
  const [isChecking, setIsChecking] = useState(true);
  const [balance, setBalance] = useState(null);
  const [purchasedCoins, setPurchasedCoins] = useState(null);
  const [loadError, setLoadError] = useState("");

  const getBackendToken = () => {
    if (typeof window === "undefined") return session?.backendToken || null;
    return localStorage.getItem("token") || session?.backendToken || null;
  };

  useEffect(() => {
    console.log("[payment/success] mount", {
      hasSessionToken: !!token,
      hasAuthToken: !!getBackendToken(),
    });

    let cancelled = false;

    const resolvePaymentState = async (attempt = 1) => {
      if (cancelled) return;

      const authToken = getBackendToken();
      if (!authToken) {
        console.warn("[payment/success] balance fetch skipped: missing auth token");
        setLoadError("Inicia sesión para ver tu saldo actualizado.");
        setIsChecking(false);
        return;
      }

      try {
        const headers = { Authorization: `Bearer ${authToken}` };
        const [balanceRes, txRes] = await Promise.all([
          fetch(`${API_URL}/api/user/coins`, { headers }),
          fetch(`${API_URL}/api/coins/transactions?limit=20`, { headers }),
        ]);

        let nextBalance = null;
        let resolvedPackageCoins = null;

        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          nextBalance = Number.isFinite(balanceData?.coins) ? balanceData.coins : null;
          setBalance(nextBalance);
          console.log("[payment/success] balance fetch result", { success: true, coins: nextBalance });
        } else {
          console.warn("[payment/success] balance fetch result", { success: false, status: balanceRes.status });
        }

        if (txRes.ok) {
          const txData = await txRes.json();
          const transactions = Array.isArray(txData?.transactions) ? txData.transactions : [];
          const matchingPurchase = transactions.find(
            (tx) => tx?.type === "purchase" && tx?.metadata?.stripeSessionId === token
          );
          if (matchingPurchase) {
            resolvedPackageCoins = Math.abs(Number(matchingPurchase.amount)) || null;
            setPurchasedCoins(resolvedPackageCoins);
          }
          console.log("[payment/success] session/package resolution", {
            token: token || null,
            resolved: !!matchingPurchase,
            purchasedCoins: resolvedPackageCoins,
            attempt,
          });
        } else {
          console.warn("[payment/success] session/package resolution failed", { status: txRes.status, attempt });
        }

        const needsRetry = !!token && !resolvedPackageCoins && attempt < MAX_RETRIES;
        if (needsRetry) {
          setIsChecking(true);
          retryTimerRef.current = window.setTimeout(() => {
            resolvePaymentState(attempt + 1);
          }, RETRY_DELAY_MS);
          return;
        }

        setIsChecking(false);
      } catch (err) {
        console.error("[payment/success] load error", err);
        if (attempt < MAX_RETRIES) {
          retryTimerRef.current = window.setTimeout(() => {
            resolvePaymentState(attempt + 1);
          }, RETRY_DELAY_MS);
          return;
        }
        setLoadError("No pudimos verificar tu pago en este momento. Intenta recargar en unos segundos.");
        setIsChecking(false);
      }
    };

    resolvePaymentState();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [session?.backendToken, token]);

  const logRedirectReason = (reason) => {
    console.log("[payment/success] redirect reason", reason);
  };

  return (
    <div className="status-page">
      <div className="status-icon">{isChecking ? "⏳" : "✅"}</div>
      <h1>{isChecking ? "Confirmando tu compra…" : "Pago completado"}</h1>
      <p>
        {isChecking
          ? "Estamos verificando tu pago y actualizando tu saldo. Esto puede tardar unos segundos."
          : "Tus monedas fueron agregadas correctamente"}
      </p>

      {!isChecking && balance !== null && (
        <p className="balance-text">
          Saldo actual: <strong>{balance} MYL Coins</strong>
        </p>
      )}

      {!isChecking && purchasedCoins !== null && (
        <p className="package-text">
          Paquete comprado: <strong>{purchasedCoins} MYL Coins</strong>
        </p>
      )}

      {!isChecking && loadError && <p className="warning-text">{loadError}</p>}

      {token && (
        <p className="session-ref">
          Referencia: <code>{token.slice(0, 20)}…</code>
        </p>
      )}

      <div className="status-actions">
        <Link href="/wallet" className="btn btn-primary btn-lg" onClick={() => logRedirectReason("wallet_cta")}>
          💼 Ir a mi wallet
        </Link>
        <Link href="/dashboard" className="btn btn-secondary btn-lg" onClick={() => logRedirectReason("dashboard_cta")}>
          🏠 Volver al dashboard
        </Link>
        <Link href="/live" className="btn btn-secondary btn-lg" onClick={() => logRedirectReason("use_coins_cta")}>
          ✨ Usar mis monedas
        </Link>
        <Link href="/coins" className="btn btn-ghost btn-lg" onClick={() => logRedirectReason("buy_again_cta")}>
          ➕ Comprar más monedas
        </Link>
      </div>

      <style jsx>{`
        .status-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
          gap: 1rem;
          padding: 2rem;
        }

        .status-icon {
          font-size: 5rem;
          line-height: 1;
          margin-bottom: 0.5rem;
        }

        h1 {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
        }

        p {
          color: var(--text-muted);
          font-size: 1rem;
          max-width: 380px;
        }

        .balance-text {
          color: var(--text);
          margin-top: -0.25rem;
        }

        .package-text {
          color: var(--accent-green);
          margin-top: -0.5rem;
        }

        .warning-text {
          color: #fbbf24;
          max-width: 480px;
        }

        .session-ref {
          font-size: 0.8rem;
        }

        .session-ref code {
          font-family: monospace;
          background: var(--card);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
        }

        .status-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 0.5rem;
        }
      `}</style>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="status-loading">
            <div className="status-icon">⏳</div>
            <p>Cargando…</p>
          </div>
        }
      >
        <SuccessContent />
      </Suspense>

      <style jsx>{`
        .status-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          gap: 1rem;
          text-align: center;
          padding: 2rem;
        }

        .status-loading .status-icon {
          font-size: 3rem;
          line-height: 1;
        }

        .status-loading p {
          color: var(--text-muted);
          font-size: 1rem;
        }
      `}</style>
    </>
  );
}
