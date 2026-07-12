"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

const FEATURES = [
  {
    title: "Match",
    description: "Descubre personas compatibles y crea conexiones reales.",
  },
  {
    title: "Chat",
    description: "Conversaciones privadas para conocer mejor a cada conexión.",
  },
  {
    title: "Live Streaming",
    description: "Directos interactivos para compartir momentos en tiempo real.",
  },
  {
    title: "Video Calls",
    description: "Llamadas de video para experiencias más cercanas y seguras.",
  },
  {
    title: "Coins",
    description: "Moneda digital para acceder a experiencias y apoyar contenido.",
  },
  {
    title: "Regalos virtuales",
    description: "Envía regalos durante lives, chats y experiencias premium.",
  },
  {
    title: "Creadores de contenido",
    description: "Herramientas para que creadores construyan comunidad.",
  },
  {
    title: "Seguridad y moderación",
    description: "Reportes, revisión y normas para proteger la comunidad.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <section className="hero">
        <nav className="hero-nav" aria-label="Navegación principal">
          <Logo size="lg" />
          <div className="nav-actions">
            <Link href="/login" className="ghost-button">
              Iniciar sesión
            </Link>
            <Link href="/register" className="primary-button">
              Registrarse
            </Link>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Plataforma social premium</p>
            <h1>Conecta, transmite en vivo y apoya a tus creadores favoritos.</h1>
            <p className="hero-description">
              MeetYouLive combina match, chat, live streaming, video calls, coins y regalos virtuales en una
              experiencia pública clara, moderna y segura para conocer personas y descubrir creadores.
            </p>
            <div className="hero-actions">
              <Link href="/register" className="primary-button large">
                Crear cuenta
              </Link>
              <Link href="/login" className="ghost-button large">
                Iniciar sesión
              </Link>
            </div>
          </div>

          <div className="hero-card" aria-label="Resumen de servicios de MeetYouLive">
            <div className="live-pill">● En vivo</div>
            <h2>Experiencias interactivas</h2>
            <p>Matches, conversaciones, directos, video llamadas y regalos virtuales en una comunidad moderada.</p>
            <div className="stats-grid">
              <span>Match</span>
              <span>Chat</span>
              <span>Lives</span>
              <span>Coins</span>
            </div>
          </div>
        </div>
      </section>

      <section className="features" aria-labelledby="features-title">
        <p className="eyebrow">Qué ofrece MeetYouLive</p>
        <h2 id="features-title">Todo lo necesario para conectar y crear valor en vivo.</h2>
        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trust-panel">
        <div>
          <p className="eyebrow">Operador</p>
          <h2>MEETYOULIVE TECHNOLOGIES LLC</h2>
          <p>
            Información legal, políticas y contacto están disponibles públicamente para usuarios, revisores y
            proveedores de pago.
          </p>
        </div>
        <Link href="/contact" className="ghost-button large">
          Contacto y soporte
        </Link>
      </section>

      <style jsx>{`
        .landing-page {
          display: grid;
          gap: 4rem;
          padding-bottom: 2rem;
        }
        .hero {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 32px;
          padding: clamp(1.2rem, 3vw, 2.25rem);
          background:
            radial-gradient(circle at 80% 10%, rgba(34,211,238,0.22), transparent 34%),
            radial-gradient(circle at 16% 24%, rgba(224,64,251,0.22), transparent 30%),
            linear-gradient(145deg, rgba(255,255,255,0.08), rgba(15,8,33,0.94));
          box-shadow: var(--shadow-lg);
        }
        .hero-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: clamp(2rem, 6vw, 4.5rem);
        }
        .nav-actions,
        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.8rem;
        }
        .hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(280px, 0.72fr);
          gap: clamp(1.25rem, 4vw, 3rem);
          align-items: center;
        }
        .hero-copy {
          max-width: 720px;
        }
        .eyebrow {
          margin: 0 0 0.75rem;
          color: var(--accent-cyan);
          font-size: 0.78rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        h1 {
          margin: 0;
          max-width: 780px;
          font-size: clamp(2.5rem, 7vw, 5.8rem);
          line-height: 0.95;
          letter-spacing: -0.08em;
        }
        .hero-description {
          margin: 1.2rem 0 1.6rem;
          max-width: 660px;
          font-size: clamp(1rem, 2vw, 1.2rem);
          line-height: 1.75;
        }
        .primary-button,
        .ghost-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border-radius: var(--radius-pill);
          padding: 0.78rem 1.1rem;
          font-weight: 900;
          border: 1px solid transparent;
          transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .primary-button {
          background: var(--grad-primary);
          color: #fff;
          box-shadow: var(--shadow-accent);
        }
        .ghost-button {
          color: var(--text);
          border-color: var(--border);
          background: rgba(255,255,255,0.06);
        }
        .large {
          min-height: 50px;
          padding-inline: 1.35rem;
        }
        .primary-button:hover,
        .ghost-button:hover {
          transform: translateY(-2px);
          border-color: var(--border-glow);
        }
        .hero-card,
        .feature-card,
        .trust-panel {
          border: 1px solid var(--border);
          background: var(--grad-card);
          box-shadow: var(--shadow);
        }
        .hero-card {
          border-radius: 28px;
          padding: clamp(1.25rem, 3vw, 2rem);
          min-height: 360px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          position: relative;
        }
        .hero-card::before {
          content: "";
          position: absolute;
          inset: 1rem;
          border-radius: 22px;
          background: radial-gradient(circle at 50% 22%, rgba(224,64,251,0.34), transparent 34%);
          pointer-events: none;
        }
        .live-pill {
          position: relative;
          z-index: 1;
          align-self: flex-start;
          border: 1px solid rgba(52,211,153,0.45);
          border-radius: var(--radius-pill);
          padding: 0.45rem 0.75rem;
          color: var(--accent-green);
          font-size: 0.78rem;
          font-weight: 900;
          background: rgba(52,211,153,0.08);
        }
        .hero-card h2,
        .hero-card p,
        .stats-grid {
          position: relative;
          z-index: 1;
        }
        .hero-card h2 {
          margin: 4rem 0 0.65rem;
          font-size: clamp(1.6rem, 4vw, 2.4rem);
        }
        .hero-card p {
          margin: 0 0 1rem;
          line-height: 1.7;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.7rem;
        }
        .stats-grid span {
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 0.8rem;
          color: var(--text);
          font-weight: 800;
          background: rgba(255,255,255,0.05);
        }
        .features {
          display: grid;
          gap: 1rem;
        }
        .features h2,
        .trust-panel h2 {
          margin: 0;
          font-size: clamp(1.8rem, 4vw, 3rem);
        }
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 0.5rem;
        }
        .feature-card {
          border-radius: 22px;
          padding: 1.15rem;
        }
        .feature-card h3 {
          margin: 0 0 0.55rem;
          font-size: 1.05rem;
        }
        .feature-card p,
        .trust-panel p {
          margin: 0;
          line-height: 1.65;
        }
        .trust-panel {
          border-radius: 28px;
          padding: clamp(1.25rem, 3vw, 2rem);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.2rem;
        }
        @media (max-width: 900px) {
          .hero-grid,
          .trust-panel {
            grid-template-columns: 1fr;
          }
          .hero-grid {
            display: grid;
          }
          .feature-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .trust-panel {
            align-items: flex-start;
            flex-direction: column;
          }
        }
        @media (max-width: 560px) {
          .hero {
            border-radius: 24px;
          }
          .hero-nav {
            align-items: flex-start;
            flex-direction: column;
          }
          .nav-actions,
          .hero-actions {
            width: 100%;
          }
          .primary-button,
          .ghost-button {
            flex: 1;
          }
          .hero-card {
            min-height: 300px;
          }
          .feature-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
