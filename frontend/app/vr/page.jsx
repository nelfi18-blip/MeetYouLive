"use client";

import Link from "next/link";

export default function VRPage() {
  return (
    <div className="vr-page">
      <div className="vr-header">
        <h1 className="vr-title">🥽 Experiencias VR</h1>
        <p className="vr-sub">Vive los directos en realidad virtual</p>
      </div>

      <div className="vr-coming card">
        <span style={{ fontSize: "4rem" }}>🥽</span>
        <h2 style={{ color: "var(--text)", marginTop: "1rem" }}>Próximamente</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: "400px", textAlign: "center" }}>
          Las experiencias de realidad virtual están en desarrollo. Pronto podrás
          disfrutar de los directos y conocer personas en entornos inmersivos.
        </p>
        <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: "1.5rem" }}>
          ← Volver al dashboard
        </Link>
      </div>

      <style jsx>{`
        .vr-page {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          max-width: 700px;
          margin: 0 auto;
        }

        .vr-header { text-align: center; }

        .vr-title {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
        }

        .vr-sub {
          color: var(--text-muted);
          margin-top: 0.5rem;
        }

        .vr-coming {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 3rem 2rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
