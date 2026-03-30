"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const POLL_INTERVAL = 5000; // poll every 5 seconds

export default function IncomingCallNotification() {
  const router = useRouter();
  const [call, setCall] = useState(null);
  const [responding, setResponding] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/api/calls/incoming`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setCall(data.call || null);
      } catch {
        // silently ignore network errors in the background poll
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  const respond = async (action) => {
    if (!call || responding) return;
    const token = localStorage.getItem("token");
    setResponding(true);
    try {
      const res = await fetch(`${API_URL}/api/calls/${call._id}/respond`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      if (res.ok && action === "accept") {
        router.push(`/call/${call._id}`);
      }
      setCall(null);
    } catch {
      setCall(null);
    } finally {
      setResponding(false);
    }
  };

  if (!call) return null;

  const callerName = call.caller?.username || call.caller?.name || "Alguien";
  const callerInitial = callerName[0].toUpperCase();
  const isPaid = call.type === "paid_creator";

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="incoming-call-pulse" />
        <div className="incoming-call-avatar">
          {call.caller?.avatar ? (
            <img src={call.caller.avatar} alt={callerName} className="incoming-call-avatar-img" />
          ) : (
            callerInitial
          )}
        </div>
        <div className="incoming-call-info">
          <p className="incoming-call-label">📹 Llamada entrante</p>
          <p className="incoming-call-name">{callerName}</p>
          {isPaid && (
            <p className="incoming-call-paid">
              💰 Llamada de pago · {call.callCoins} monedas
            </p>
          )}
        </div>
        <div className="incoming-call-actions">
          <button
            className="incoming-call-btn accept"
            onClick={() => respond("accept")}
            disabled={responding}
            aria-label="Aceptar llamada"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            Aceptar
          </button>
          <button
            className="incoming-call-btn reject"
            onClick={() => respond("reject")}
            disabled={responding}
            aria-label="Rechazar llamada"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Rechazar
          </button>
        </div>
      </div>

      <style jsx>{`
        .incoming-call-overlay {
          position: fixed;
          bottom: 80px;
          right: 1.5rem;
          z-index: 1000;
          animation: slide-in 0.3s cubic-bezier(0.4,0,0.2,1);
        }

        @keyframes slide-in {
          from { opacity: 0; transform: translateY(24px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .incoming-call-card {
          position: relative;
          background: rgba(12, 5, 25, 0.97);
          border: 1px solid rgba(255, 45, 120, 0.5);
          border-radius: var(--radius);
          padding: 1.25rem 1.5rem;
          min-width: 280px;
          max-width: 340px;
          box-shadow: var(--shadow), 0 0 40px rgba(255, 45, 120, 0.3);
          backdrop-filter: blur(24px);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          align-items: center;
        }

        .incoming-call-pulse {
          position: absolute;
          inset: 0;
          border-radius: var(--radius);
          background: rgba(255, 45, 120, 0.04);
          animation: pulse-bg 2s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes pulse-bg {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1; }
        }

        .incoming-call-avatar {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: var(--grad-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 800;
          font-size: 1.4rem;
          overflow: hidden;
          box-shadow: 0 0 0 3px rgba(255, 45, 120, 0.4), 0 0 20px rgba(255, 45, 120, 0.3);
          animation: ring-pulse 1.5s ease-in-out infinite;
        }

        @keyframes ring-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(255, 45, 120, 0.4), 0 0 20px rgba(255, 45, 120, 0.3); }
          50%       { box-shadow: 0 0 0 6px rgba(255, 45, 120, 0.2), 0 0 30px rgba(255, 45, 120, 0.5); }
        }

        .incoming-call-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }

        .incoming-call-info {
          text-align: center;
        }

        .incoming-call-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
          margin: 0 0 0.25rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .incoming-call-name {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text);
          margin: 0;
        }

        .incoming-call-paid {
          font-size: 0.75rem;
          color: var(--accent-orange);
          margin: 0.25rem 0 0;
          font-weight: 600;
        }

        .incoming-call-actions {
          display: flex;
          gap: 0.75rem;
          width: 100%;
        }

        .incoming-call-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.65rem 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all var(--transition);
        }

        .incoming-call-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .incoming-call-btn.accept {
          background: var(--grad-warm);
          color: #fff;
          box-shadow: 0 2px 12px rgba(255, 45, 120, 0.4);
        }

        .incoming-call-btn.accept:hover:not(:disabled) {
          box-shadow: 0 4px 20px rgba(255, 45, 120, 0.6);
          transform: translateY(-1px);
        }

        .incoming-call-btn.reject {
          background: rgba(248, 113, 113, 0.1);
          color: var(--error);
          border: 1px solid rgba(248, 113, 113, 0.3);
        }

        .incoming-call-btn.reject:hover:not(:disabled) {
          background: rgba(248, 113, 113, 0.2);
        }
      `}</style>
    </div>
  );
}
