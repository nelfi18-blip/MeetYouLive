"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

export default function HomePage() {
  return (
    <div className="home-bg">
      {/* Decorative blobs */}
      <div className="home-blob home-blob-1" />
      <div className="home-blob home-blob-2" />

      <div className="home-hero">
        <Logo size="lg" href="/" />

        <h1 className="home-headline">
          Conecta, transmite y vive<br />
          <span className="home-highlight">en directo</span>
        </h1>

        <p className="home-sub">
          La plataforma de streaming en vivo donde creadores y audiencias
          se encuentran en tiempo real.
        </p>

        <div className="home-cta">
          <Link href="/register" className="btn btn-primary btn-lg">
            Crear cuenta gratis
          </Link>
          <Link href="/login" className="btn btn-outline btn-lg">
            Iniciar sesión
          </Link>
        </div>

        <div className="home-features">
          <div className="home-feature">
            <span className="home-feature-icon">🎥</span>
            <span>Streaming en vivo</span>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon">💬</span>
            <span>Chat en tiempo real</span>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon">🎁</span>
            <span>Regalos y monedas</span>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon">🔍</span>
            <span>Explora canales</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .home-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        .home-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          pointer-events: none;
          opacity: 0.2;
        }

        .home-blob-1 {
          width: 600px;
          height: 600px;
          background: var(--accent);
          top: -250px;
          right: -200px;
        }

        .home-blob-2 {
          width: 500px;
          height: 500px;
          background: #3d1a78;
          bottom: -200px;
          left: -150px;
        }

        .home-hero {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 1.75rem;
          max-width: 640px;
          width: 100%;
        }

        .home-headline {
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 800;
          color: var(--text);
          line-height: 1.15;
          letter-spacing: -0.03em;
        }

        .home-highlight {
          color: var(--accent);
        }

        .home-sub {
          font-size: 1.05rem;
          color: var(--text-muted);
          max-width: 480px;
          line-height: 1.7;
        }

        .home-cta {
          display: flex;
          gap: 0.875rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .btn-outline {
          background: transparent;
          color: var(--text);
          border: 1px solid var(--border);
        }

        .btn-outline:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-dim);
        }

        .home-features {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 0.5rem;
        }

        .home-feature {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 0.4rem 0.9rem;
          font-size: 0.85rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .home-feature-icon {
          font-size: 1rem;
        }

        @media (max-width: 480px) {
          .home-cta { flex-direction: column; width: 100%; }
          .home-cta a { width: 100%; text-align: center; }
        }
      `}</style>
    </div>
  );
}
