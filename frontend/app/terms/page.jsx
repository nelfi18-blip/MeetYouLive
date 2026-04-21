"use client";

import Link from "next/link";

export default function TermsPage() {
  const lastUpdated = "21 de abril de 2026";

  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <Link href="/dashboard" className="back-link">← Volver</Link>
          <h1 className="legal-title">Términos de Servicio</h1>
          <p className="legal-date">Última actualización: {lastUpdated}</p>
        </div>

        <div className="legal-content">
          <section>
            <h2>1. Aceptación de los términos</h2>
            <p>
              Al acceder y utilizar MeetYouLive (&ldquo;la Plataforma&rdquo;), aceptas quedar vinculado por
              estos Términos de Servicio. Si no estás de acuerdo con alguna de las condiciones, debes
              dejar de usar la Plataforma inmediatamente.
            </p>
          </section>

          <section>
            <h2>2. Descripción del servicio</h2>
            <p>
              MeetYouLive es una plataforma de entretenimiento en vivo que permite a los usuarios
              conectar con creadores de contenido a través de streams en directo, mensajes, regalos
              virtuales y llamadas privadas. La Plataforma ofrece monedas virtuales (MYL Coins y
              Sparks) que pueden adquirirse con dinero real para acceder a contenido y funciones
              premium.
            </p>
          </section>

          <section>
            <h2>3. Elegibilidad</h2>
            <p>
              Debes tener al menos 18 años para registrarte y utilizar MeetYouLive. Al crear una
              cuenta, confirmas que tienes la edad mínima requerida y que la información que
              proporcionas es veraz y exacta.
            </p>
          </section>

          <section>
            <h2>4. Monedas virtuales y pagos</h2>
            <p>
              Las MYL Coins y Sparks son monedas virtuales sin valor monetario real fuera de la
              Plataforma. Su adquisición se realiza mediante pago con tarjeta de crédito/débito a
              través de Stripe. Los precios se muestran en la página de compra y pueden estar sujetos
              a impuestos según tu ubicación.
            </p>
            <p>
              Las monedas virtuales no son reembolsables salvo en los casos descritos en nuestra{" "}
              <Link href="/refunds">Política de Reembolsos</Link>. Las monedas no usadas no
              caducan mientras tu cuenta esté activa.
            </p>
          </section>

          <section>
            <h2>5. Suscripción premium</h2>
            <p>
              La suscripción Premium es un servicio de renovación automática mensual. Al suscribirte,
              autorizas a MeetYouLive a cargar el importe correspondiente cada mes hasta que canceles
              la suscripción. Puedes cancelar en cualquier momento desde tu perfil; la cancelación
              tendrá efecto al final del período de facturación en curso.
            </p>
          </section>

          <section>
            <h2>6. Conducta del usuario</h2>
            <p>Queda estrictamente prohibido:</p>
            <ul>
              <li>Publicar contenido ilegal, obsceno, difamatorio o que incite al odio.</li>
              <li>Acosar, amenazar o suplantar la identidad de otros usuarios.</li>
              <li>Usar la Plataforma para actividades fraudulentas o de spam.</li>
              <li>Compartir contenido de terceros sin autorización (violación de derechos de autor).</li>
              <li>Intentar acceder sin autorización a sistemas o cuentas ajenas.</li>
            </ul>
            <p>
              El incumplimiento puede resultar en la suspensión o eliminación permanente de tu cuenta,
              sin derecho a reembolso de monedas o suscripción vigentes.
            </p>
          </section>

          <section>
            <h2>7. Contenido del usuario</h2>
            <p>
              Eres responsable de todo el contenido que publiques. Al publicar contenido en la
              Plataforma, nos otorgas una licencia no exclusiva, mundial, libre de regalías y
              sublicenciable para usar, reproducir, distribuir y mostrar dicho contenido dentro del
              servicio.
            </p>
          </section>

          <section>
            <h2>8. Ganancias para creadores</h2>
            <p>
              Los creadores aprobados pueden solicitar el retiro de sus ganancias en monedas cuando
              alcancen el mínimo establecido. MeetYouLive retiene un porcentaje de las ganancias como
              comisión de plataforma, detallado en el panel de creador. Los pagos se procesan
              manualmente dentro de un plazo de 30 días hábiles tras la solicitud.
            </p>
          </section>

          <section>
            <h2>9. Limitación de responsabilidad</h2>
            <p>
              La Plataforma se ofrece &ldquo;tal cual&rdquo; y &ldquo;según disponibilidad&rdquo;. MeetYouLive no
              garantiza la disponibilidad ininterrumpida del servicio y no será responsable de daños
              indirectos, incidentales o consecuentes derivados del uso de la Plataforma.
            </p>
          </section>

          <section>
            <h2>10. Modificaciones</h2>
            <p>
              Podemos actualizar estos términos en cualquier momento. Te notificaremos los cambios
              materiales a través de la Plataforma o por correo electrónico. El uso continuado del
              servicio tras la notificación implica la aceptación de los nuevos términos.
            </p>
          </section>

          <section>
            <h2>11. Contacto</h2>
            <p>
              Para cualquier consulta sobre estos términos, escríbenos a{" "}
              <a href="mailto:support@meetyoulive.net">support@meetyoulive.net</a>.
            </p>
          </section>
        </div>

        <div className="legal-footer">
          <Link href="/privacy">Política de Privacidad</Link>
          <span>·</span>
          <Link href="/refunds">Política de Reembolsos</Link>
          <span>·</span>
          <Link href="/dashboard">Volver a la app</Link>
        </div>
      </div>

      <style jsx>{`
        .legal-page {
          min-height: 100vh;
          padding: 2rem 1rem 4rem;
        }

        .legal-container {
          max-width: 720px;
          margin: 0 auto;
        }

        .legal-header {
          margin-bottom: 2.5rem;
        }

        .back-link {
          display: inline-block;
          font-size: 0.875rem;
          color: var(--text-muted);
          text-decoration: none;
          margin-bottom: 1rem;
          transition: color 0.15s;
        }

        .back-link:hover { color: var(--text); }

        .legal-title {
          font-size: 2rem;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 0.35rem;
          letter-spacing: -0.02em;
        }

        .legal-date {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin: 0;
        }

        .legal-content {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .legal-content :global(section) {
          border-top: 1px solid var(--border);
          padding-top: 1.5rem;
        }

        .legal-content :global(h2) {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 0.75rem;
        }

        .legal-content :global(p) {
          font-size: 0.9rem;
          color: var(--text-muted);
          line-height: 1.7;
          margin: 0 0 0.75rem;
        }

        .legal-content :global(p:last-child) {
          margin-bottom: 0;
        }

        .legal-content :global(ul) {
          padding-left: 1.5rem;
          margin: 0.5rem 0 0.75rem;
        }

        .legal-content :global(li) {
          font-size: 0.9rem;
          color: var(--text-muted);
          line-height: 1.65;
          margin-bottom: 0.3rem;
        }

        .legal-content :global(a) {
          color: var(--accent-3);
          text-decoration: none;
        }

        .legal-content :global(a:hover) {
          text-decoration: underline;
        }

        .legal-footer {
          margin-top: 3rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          font-size: 0.82rem;
          color: var(--text-muted);
        }

        .legal-footer :global(a) {
          color: var(--accent-3);
          text-decoration: none;
        }

        .legal-footer :global(a:hover) {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
