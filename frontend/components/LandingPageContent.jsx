"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import Logo from "@/components/Logo";

const ADVANTAGES = [
  { id: "free-registration", text: "Registro gratuito" },
  { id: "google-start", text: "Inicio rápido con Google" },
  { id: "stripe-payments", text: "Pagos seguros con Stripe" },
  { id: "moderated-community", text: "Comunidad moderada" },
  { id: "safe-platform", text: "Plataforma protegida" },
];

const FEATURES = [
  { id: "match", icon: "💘", label: "Match" },
  { id: "chat", icon: "💬", label: "Chat" },
  { id: "live", icon: "📡", label: "Live" },
  { id: "video-calls", icon: "🎥", label: "Video Calls" },
  { id: "coins", icon: "🪙", label: "Coins" },
  { id: "gifts", icon: "🎁", label: "Regalos" },
];

const STEPS = [
  {
    icon: "⚡",
    title: "Paso 1",
    description: "Crea tu cuenta con Google o correo.",
  },
  {
    icon: "✨",
    title: "Paso 2",
    description: "Completa tu perfil y descubre personas.",
  },
  {
    icon: "🚀",
    title: "Paso 3",
    description: "Haz Match, conversa, transmite en vivo y disfruta de todas las funciones.",
  },
];

const TRUST_ITEMS = [
  { id: "stripe", icon: "🔒", text: "Pagos procesados mediante Stripe" },
  { id: "moderation", icon: "🛡️", text: "Comunidad moderada" },
  { id: "privacy", icon: "🔐", text: "Protección de datos" },
  { id: "international", icon: "🌍", text: "Plataforma disponible internacionalmente" },
];

export default function LandingPage() {
  const handleGoogleSignIn = () => {
    signIn("google", {
      callbackUrl: "/dashboard",
    });
  };

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
              Empieza gratis en menos de un minuto. Conoce personas, transmite en vivo, realiza videollamadas y
              apoya a tus creadores favoritos.
            </p>
            <div className="signup-card">
              <button type="button" className="primary-button large main-cta" onClick={handleGoogleSignIn}>
                Continuar con Google
              </button>
              <Link href="/register" className="email-link">
                Crear cuenta con correo electrónico
              </Link>
              <div className="login-prompt">
                <span>¿Ya tienes una cuenta?</span>
                <Link href="/login" className="login-link">
                  Iniciar sesión
                </Link>
              </div>
              <p className="cta-note">
                Registro gratuito.
                <br />
                Sin compromiso.
                <br />
                Solo toma un minuto.
              </p>
            </div>
            <ul className="advantage-list">
              {ADVANTAGES.map((advantage) => (
                <li key={advantage.id}>
                  <span aria-hidden="true">✓</span>
                  {advantage.text}
                </li>
              ))}
            </ul>
          </div>

          <aside className="hero-card" aria-labelledby="hero-card-title">
            <div className="live-pill">● En vivo</div>
            <h2 id="hero-card-title">Todo lo que puedes hacer</h2>
            <p>Match, chat, directos, videollamadas, coins y regalos virtuales en una comunidad moderada.</p>
            <div className="stats-grid">
              {FEATURES.map((feature) => (
                <span key={feature.id}>
                  <span className="feature-icon" aria-hidden="true">
                    {feature.icon}
                  </span>
                  {feature.label}
                </span>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="how-it-works" aria-labelledby="steps-title">
        <p className="eyebrow">¿Cómo funciona?</p>
        <h2 id="steps-title">Empieza en tres pasos simples.</h2>
        <div className="steps-grid">
          {STEPS.map((step) => (
            <article key={step.title} className="step-card">
              <div className="step-icon" aria-hidden="true">
                {step.icon}
              </div>
              <span>{step.title}</span>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="security-strip" aria-label="Confianza y seguridad">
        {TRUST_ITEMS.map((item) => (
          <div key={item.id} className="security-item">
            <span aria-hidden="true">{item.icon}</span>
            <strong>{item.text}</strong>
          </div>
        ))}
      </section>

      <section className="trust-panel">
        <div>
          <p className="eyebrow">Operador</p>
          <h2>MEETYOULIVE TECHNOLOGIES LLC</h2>
          <p>
            Operador oficial de MeetYouLive.
            <br />
            Plataforma social premium para conocer personas, transmitir en vivo y apoyar a creadores de contenido mediante
            pagos seguros.
          </p>
        </div>
        <Link href="/contact" className="ghost-button large">
          Contacto y soporte
        </Link>
      </section>

      <style jsx>{`
        .landing-page {
          display: grid;
          gap: clamp(2rem, 5vw, 3.2rem);
          padding-bottom: 2rem;
        }
        .hero {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 32px;
          padding: clamp(1rem, 2.5vw, 2rem);
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
          margin-bottom: clamp(1.2rem, 4vw, 3rem);
        }
        .nav-actions {
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
          font-size: clamp(2.25rem, 6.4vw, 5.4rem);
          line-height: 0.97;
          letter-spacing: -0.08em;
        }
        .hero-description {
          margin: 1rem 0 1.25rem;
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
          font: inherit;
          font-weight: 900;
          border: 1px solid transparent;
          cursor: pointer;
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
        .signup-card {
          display: grid;
          gap: 0.75rem;
          max-width: 430px;
          margin-bottom: 1rem;
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 0.9rem;
          background: rgba(255,255,255,0.07);
          box-shadow: var(--shadow);
        }
        .main-cta {
          width: 100%;
          min-height: 56px;
          font-size: 1.05rem;
        }
        .email-link,
        .login-link {
          color: var(--accent-cyan);
          font-weight: 900;
          text-align: center;
          text-decoration: underline;
          text-underline-offset: 0.18em;
        }
        .email-link {
          min-height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-pill);
          background: rgba(34,211,238,0.09);
        }
        .login-prompt {
          display: grid;
          gap: 0.25rem;
          color: var(--text-muted);
          text-align: center;
          line-height: 1.45;
        }
        .cta-note {
          margin: 0;
          color: var(--text);
          font-size: 0.93rem;
          font-weight: 850;
          line-height: 1.45;
          text-align: center;
        }
        .advantage-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          max-width: 680px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .advantage-list li {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-pill);
          padding: 0.55rem 0.75rem;
          color: var(--text);
          font-weight: 800;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          gap: 0.45rem;
          line-height: 1.2;
        }
        .advantage-list li span {
          color: var(--accent-green);
          font-weight: 900;
        }
        .primary-button:hover,
        .ghost-button:hover {
          transform: translateY(-2px);
          border-color: var(--border-glow);
        }
        .hero-card,
        .step-card,
        .trust-panel {
          border: 1px solid var(--border);
          background: var(--grad-card);
          box-shadow: var(--shadow);
        }
        .hero-card {
          border-radius: 28px;
          padding: clamp(1.25rem, 3vw, 2rem);
          min-height: 340px;
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
          margin: 3rem 0 0.65rem;
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
        .stats-grid > span {
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 0.8rem;
          color: var(--text);
          font-weight: 800;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }
        .feature-icon {
          border: 0;
          border-radius: 0;
          padding: 0;
          background: transparent;
          font-size: 1.1rem;
        }
        .how-it-works {
          display: grid;
          gap: 1rem;
        }
        .how-it-works h2,
        .trust-panel h2 {
          margin: 0;
          font-size: clamp(1.8rem, 4vw, 3rem);
        }
        .steps-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 0.5rem;
        }
        .step-card {
          border-radius: 24px;
          padding: clamp(1.15rem, 3vw, 1.5rem);
        }
        .step-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          margin-bottom: 0.9rem;
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          background: rgba(34,211,238,0.1);
          font-size: 1.25rem;
        }
        .step-card span {
          display: inline-flex;
          margin-bottom: 0.8rem;
          color: var(--accent-cyan);
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .step-card p {
          margin: 0;
          color: var(--text);
          font-size: 1.05rem;
          line-height: 1.65;
        }
        .trust-panel p {
          margin: 0;
          line-height: 1.65;
        }
        .security-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.8rem;
        }
        .security-item {
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 1rem;
          background: rgba(255,255,255,0.05);
          box-shadow: var(--shadow-sm);
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }
        .security-item span {
          font-size: 1.2rem;
        }
        .security-item strong {
          color: var(--text);
          line-height: 1.35;
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
          .steps-grid,
          .security-strip,
          .trust-panel {
            grid-template-columns: 1fr;
          }
          .hero-grid {
            display: grid;
          }
          .trust-panel {
            align-items: flex-start;
            flex-direction: column;
          }
        }
        @media (max-width: 560px) {
          .hero {
            border-radius: 24px;
            padding: 0.9rem;
          }
          .hero-nav {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.75rem;
            margin-bottom: 1rem;
          }
          .nav-actions {
            width: 100%;
          }
          .primary-button,
          .ghost-button {
            flex: 1;
            min-height: 46px;
          }
          .signup-card {
            max-width: none;
            padding: 0.8rem;
          }
          .advantage-list {
            gap: 0.45rem;
          }
          .advantage-list li {
            font-size: 0.9rem;
            padding: 0.48rem 0.65rem;
          }
          .hero-card {
            min-height: auto;
            padding: 1rem;
          }
          .hero-card h2 {
            margin-top: 2rem;
          }
          .stats-grid {
            grid-template-columns: 1fr;
          }
          h1 {
            font-size: clamp(2rem, 11vw, 3.2rem);
          }
          .hero-description {
            margin: 0.85rem 0 1rem;
            line-height: 1.55;
          }
          .main-cta {
            min-height: 52px;
          }
        }
      `}</style>
    </div>
  );
}
