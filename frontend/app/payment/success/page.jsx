"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const WEBHOOK_DELAY_MS = 3000;

function SuccessContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentReference = searchParams.get("session_id") || searchParams.get("token");
  const [balance, setBalance] = useState(null);

  const getBackendToken = () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") || session?.backendToken || null;
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const authToken = getBackendToken();

      if (authToken) {
        const headers = { Authorization: `Bearer ${authToken}` };
        try {
          const balanceRes = await fetch(`${API_URL}/api/user/coins`, { headers });
          if (balanceRes.ok) {
            const balanceData = await balanceRes.json();
            const nextBalance = Number.isFinite(balanceData?.coins) ? balanceData.coins : null;
            if (!cancelled) setBalance(nextBalance);
          }
        } catch (error) {
          console.warn("[payment/success] coin balance refetch failed", error);
          // Continue to dashboard even if refetch fails.
        }
      }

      if (!cancelled) router.replace("/dashboard");
    }, WEBHOOK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router, session?.backendToken, paymentReference]);

  return (
    <div className="status-page">
      <div className="status-icon">✅</div>
      <h1>Pago exitoso</h1>
      <p>Tus monedas han sido añadidas</p>
      <p>Redirigiendo al dashboard…</p>

      {balance !== null && (
        <p className="balance-text">
          Saldo actual: <strong>{balance} MYL Coins</strong>
        </p>
      )}

      {paymentReference && (
        <p className="session-ref">
          Referencia: <code>{paymentReference.slice(0, 20)}…</code>
        </p>
      )}

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

        .session-ref {
          font-size: 0.8rem;
        }

        .session-ref code {
          font-family: monospace;
          background: var(--card);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
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
