"use client";

import { useRouter } from "next/navigation";

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="unauthorized-container">
      <div className="unauthorized-card">
        <div className="unauthorized-icon">🚫</div>
        <h1 className="unauthorized-title">Acceso Denegado</h1>
        <p className="unauthorized-message">
          No tienes permiso para acceder a esta sección.
        </p>
        <button 
          className="unauthorized-button"
          onClick={() => router.push("/admin")}
        >
          Volver al Dashboard
        </button>
      </div>

      <style jsx>{`
        .unauthorized-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          padding: 2rem;
        }

        .unauthorized-card {
          background: #161b27;
          border: 1px solid #1e2535;
          border-radius: 16px;
          padding: 3rem 2rem;
          text-align: center;
          max-width: 400px;
          width: 100%;
        }

        .unauthorized-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.8;
        }

        .unauthorized-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #e2e8f0;
          margin-bottom: 1rem;
        }

        .unauthorized-message {
          font-size: 1rem;
          color: #94a3b8;
          margin-bottom: 2rem;
          line-height: 1.6;
        }

        .unauthorized-button {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          font-family: inherit;
        }

        .unauthorized-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(124, 58, 237, 0.3);
        }

        .unauthorized-button:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
