"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import Logo from "@/components/Logo";

const ADVANTAGES = [
  { id: "free-registration", text: "Registro gratis." },
  { id: "google-start", text: "Inicio rápido con Google." },
  { id: "stripe-payments", text: "Pagos seguros con Stripe." },
  { id: "moderated-community", text: "Comunidad moderada." },
  { id: "safe-platform", text: "Plataforma segura." },
];

const STEPS = [
  {
    title: "Paso 1",
    description: "Crea tu cuenta con Google o correo.",
  },
  {
    title: "Paso 2",
    description: "Completa tu perfil y descubre personas.",
  },
  {
    title: "Paso 3",
    description: "Haz Match, conversa, transmite en vivo y disfruta de todas las funciones.",
  },
];

export default function LandingPage() {
  const [authError, setAuthError] = useState("");

  const handleGoogleSignIn = async () => {
    setAuthError("");

    try {
      await signIn("google", {
        callbackUrl: "/dashboard",
      });
    } catch {
      setAuthError("No pudimos completar el inicio de sesión. Inténtalo de nuevo.");
    }
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
              {authError && <p className="auth-error">{authError}</p>}
              <div className="login-prompt">
                <span>¿Ya tienes una cuenta?</span>
                <Link href="/login" className="login-link">
                  Iniciar sesión
                </Link>
              </div>
            </div>
            <ul className="advantage-list">
              {ADVANTAGES.map((advantage) => (
                <li key={advantage.id}>{advantage.text}</li>
              ))}
            </ul>
          </div>

          <aside className="hero-card" aria-labelledby="hero-card-title">
            <div className="live-pill">● En vivo</div>
            <h2 id="hero-card-title">Todo claro desde el inicio</h2>
            <p>Match, chat, directos, videollamadas, coins y regalos virtuales en una comunidad moderada.</p>
            <div className="stats-grid">
              <span>Match</span>
              <span>Chat</span>
              <span>Lives</span>
              <span>Coins</span>
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
              <span>{step.title}</span>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="features" aria-labelledby="features-title">
        <p className="eyebrow">Ventajas para nuevos usuarios</p>
        <h2 id="features-title">Una plataforma simple, rápida y segura para empezar hoy.</h2>
        <div className="feature-grid">
          {ADVANTAGES.map((advantage) => (
            <article key={advantage.id} className="feature-card">
              <h3>{advantage.text}</h3>
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
        <div className="trust-actions">
          <button type="button" className="primary-button large" onClick={handleGoogleSignIn}>
            Continuar con Google
          </button>
          <Link href="/login" className="ghost-button large">
            Iniciar sesión
          </Link>
        </div>
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
        .trust-actions {
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
          gap: 0.9rem;
          max-width: 430px;
          margin-bottom: 1.4rem;
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 1rem;
          background: rgba(255,255,255,0.07);
          box-shadow: var(--shadow);
        }
        .main-cta {
          width: 100%;
          min-height: 58px;
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-pill);
          background: rgba(34,211,238,0.09);
        }
        .auth-error {
          margin: 0;
          color: var(--error);
          font-size: 0.9rem;
          font-weight: 800;
          text-align: center;
        }
        .login-prompt {
          display: grid;
          gap: 0.25rem;
          color: var(--text-muted);
          text-align: center;
          line-height: 1.45;
        }
        .advantage-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.7rem;
          max-width: 660px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .advantage-list li {
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 0.85rem 0.95rem;
          color: var(--text);
          font-weight: 800;
          background: rgba(255,255,255,0.05);
        }
        .primary-button:hover,
        .ghost-button:hover {
          transform: translateY(-2px);
          border-color: var(--border-glow);
        }
        .hero-card,
        .step-card,
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
        .features,
        .how-it-works {
          display: grid;
          gap: 1rem;
        }
        .features h2,
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
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 0.5rem;
        }
        .feature-card {
          border-radius: 22px;
          padding: 1.15rem;
        }
        .feature-card h3 {
          margin: 0;
          font-size: 1.05rem;
        }
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
          .steps-grid,
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
          .trust-actions {
            width: 100%;
          }
          .primary-button,
          .ghost-button {
            flex: 1;
            min-height: 52px;
          }
          .signup-card {
            max-width: none;
          }
          .advantage-list {
            grid-template-columns: 1fr;
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
