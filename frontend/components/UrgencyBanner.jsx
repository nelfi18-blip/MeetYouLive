"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const URGENCY_MESSAGES = [
  { icon: "🔥", text: "3 personas vieron tu perfil", cta: "Desbloquear ahora" },
  { icon: "👀", text: "Alguien te dio like", cta: "Ver quién fue" },
  { icon: "💖", text: "Tienes matches esperando", cta: "Desbloquear ahora" },
  { icon: "⚡", text: "Tu perfil está en tendencia", cta: "Aprovechar ahora" },
  { icon: "💎", text: "5 personas te enviaron un Super Crush", cta: "Ver ahora" },
];

const ROTATE_INTERVAL_MS = 5000;

export default function UrgencyBanner({ className = "" }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % URGENCY_MESSAGES.length);
        setVisible(true);
      }, 350);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const msg = URGENCY_MESSAGES[index];

  return (
    <div className={`urgency-banner${className ? ` ${className}` : ""}`} role="status" aria-live="polite">
      <div className={`urgency-inner${visible ? " ub-visible" : " ub-hidden"}`}>
        <span className="ub-icon">{msg.icon}</span>
        <span className="ub-text">{msg.text}</span>
        <Link href="/coins" className="ub-cta">
          {msg.cta} →
        </Link>
      </div>

      <style jsx>{`
        .urgency-banner {
          background: linear-gradient(135deg, rgba(255,45,120,0.1) 0%, rgba(224,64,251,0.1) 100%);
          border: 1px solid rgba(255,45,120,0.3);
          border-radius: var(--radius-sm);
          padding: 0.65rem 1rem;
          display: flex;
          align-items: center;
        }

        .urgency-inner {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          width: 100%;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .ub-visible { opacity: 1; transform: translateY(0); }
        .ub-hidden  { opacity: 0; transform: translateY(-4px); }

        .ub-icon {
          font-size: 1.1rem;
          flex-shrink: 0;
          animation: ub-pulse 2s ease-in-out infinite;
        }

        @keyframes ub-pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.18); }
        }

        .ub-text {
          flex: 1;
          font-size: 0.83rem;
          font-weight: 600;
          color: rgba(255,255,255,0.82);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ub-cta {
          flex-shrink: 0;
          font-size: 0.78rem;
          font-weight: 800;
          color: #ff2d78;
          text-decoration: none;
          white-space: nowrap;
          padding: 0.28rem 0.75rem;
          border-radius: var(--radius-pill);
          background: rgba(255,45,120,0.12);
          border: 1px solid rgba(255,45,120,0.3);
          transition: all 0.2s;
          animation: cta-glow 2.5s ease-in-out infinite;
        }

        @keyframes cta-glow {
          0%, 100% { box-shadow: 0 0 0 rgba(255,45,120,0); }
          50%       { box-shadow: 0 0 12px rgba(255,45,120,0.4); }
        }

        .ub-cta:hover {
          background: rgba(255,45,120,0.22);
          box-shadow: 0 0 18px rgba(255,45,120,0.45);
          color: #ff6ba8;
        }
      `}</style>
    </div>
  );
}
