"use client";

import Link from "next/link";

export default function PrivacyPage() {
  const lastUpdated = "21 de abril de 2026";

  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <Link href="/dashboard" className="back-link">← Volver</Link>
          <h1 className="legal-title">Política de Privacidad</h1>
          <p className="legal-date">Última actualización: {lastUpdated}</p>
        </div>

        <div className="legal-content">
          <section>
            <h2>1. Responsable del tratamiento</h2>
            <p>
              MeetYouLive (&ldquo;nosotros&rdquo; o &ldquo;la Plataforma&rdquo;) es el responsable del tratamiento de los
              datos personales que recopilamos a través del sitio web y la aplicación. Para cualquier
              consulta sobre privacidad, contáctanos en{" "}
              <a href="mailto:privacy@meetyoulive.net">privacy@meetyoulive.net</a>.
            </p>
          </section>

          <section>
            <h2>2. Datos que recopilamos</h2>
            <p>Recopilamos los siguientes tipos de datos:</p>
            <ul>
              <li>
                <strong>Datos de registro:</strong> nombre de usuario, dirección de correo
                electrónico, contraseña (almacenada cifrada) y, opcionalmente, foto de perfil.
              </li>
              <li>
                <strong>Datos de uso:</strong> interacciones en la Plataforma (likes, matches,
                mensajes, regalos enviados, streams vistos), páginas visitadas y tiempo de sesión.
              </li>
              <li>
                <strong>Datos de pago:</strong> MeetYouLive no almacena datos de tarjeta de crédito.
                Los pagos se procesan íntegramente a través de Stripe, que gestiona y protege la
                información financiera según sus propias políticas de seguridad.
              </li>
              <li>
                <strong>Datos técnicos:</strong> dirección IP, tipo de dispositivo, sistema
                operativo y navegador, para seguridad y mejora del servicio.
              </li>
            </ul>
          </section>

          <section>
            <h2>3. Finalidad del tratamiento</h2>
            <p>Usamos tus datos para:</p>
            <ul>
              <li>Operar y mejorar la Plataforma.</li>
              <li>Gestionar tu cuenta y el acceso a funciones premium.</li>
              <li>Procesar pagos y gestionar el saldo de monedas virtuales.</li>
              <li>Enviarte notificaciones del servicio (nunca marketing no solicitado sin tu consentimiento).</li>
              <li>Detectar y prevenir fraudes, abusos y actividades ilegales.</li>
              <li>Cumplir con obligaciones legales y regulatorias.</li>
            </ul>
          </section>

          <section>
            <h2>4. Base legal</h2>
            <p>
              El tratamiento de tus datos se basa en: (a) la ejecución del contrato contigo para
              prestarte el servicio; (b) tu consentimiento cuando sea necesario; (c) nuestro interés
              legítimo en la seguridad y mejora del servicio; (d) el cumplimiento de obligaciones
              legales.
            </p>
          </section>

          <section>
            <h2>5. Compartición de datos</h2>
            <p>
              No vendemos tus datos personales. Podemos compartirlos con:
            </p>
            <ul>
              <li>
                <strong>Proveedores de servicio:</strong> Stripe (pagos), MongoDB Atlas (base de
                datos), Agora (transmisión en vivo), Firebase (notificaciones push), Render y Vercel
                (infraestructura). Todos operan bajo acuerdos de procesamiento de datos y estándares
                de seguridad adecuados.
              </li>
              <li>
                <strong>Autoridades legales:</strong> cuando sea requerido por ley o para proteger
                los derechos, la propiedad o la seguridad de MeetYouLive o de sus usuarios.
              </li>
            </ul>
          </section>

          <section>
            <h2>6. Retención de datos</h2>
            <p>
              Conservamos tus datos mientras tu cuenta esté activa. Si eliminas tu cuenta,
              procederemos a eliminar o anonimizar tus datos personales en un plazo de 30 días,
              salvo que la ley nos exija conservarlos por un período mayor (p. ej., registros de
              transacciones financieras durante 5 años).
            </p>
          </section>

          <section>
            <h2>7. Tus derechos</h2>
            <p>
              Tienes derecho a acceder, rectificar, suprimir, limitar el tratamiento y portar tus
              datos. También puedes oponerte al tratamiento basado en interés legítimo. Para ejercer
              cualquier derecho, escríbenos a{" "}
              <a href="mailto:privacy@meetyoulive.net">privacy@meetyoulive.net</a>. Responderemos en
              un plazo máximo de 30 días.
            </p>
          </section>

          <section>
            <h2>8. Cookies</h2>
            <p>
              Usamos cookies de sesión esenciales para el funcionamiento del servicio. No usamos
              cookies de seguimiento de terceros con fines publicitarios sin tu consentimiento
              explícito.
            </p>
          </section>

          <section>
            <h2>9. Seguridad</h2>
            <p>
              Implementamos medidas técnicas y organizativas razonables para proteger tus datos,
              incluyendo cifrado en tránsito (HTTPS/TLS), contraseñas almacenadas con hash bcrypt
              y control de acceso por roles. No obstante, ningún sistema es 100% seguro; si
              detectas alguna vulnerabilidad, notifícanos de inmediato.
            </p>
          </section>

          <section>
            <h2>10. Cambios en esta política</h2>
            <p>
              Podemos actualizar esta política periódicamente. Te notificaremos los cambios
              materiales con al menos 15 días de antelación a través del correo electrónico
              asociado a tu cuenta o mediante un aviso visible en la Plataforma.
            </p>
          </section>

          <section>
            <h2>11. Contacto</h2>
            <p>
              Para cualquier pregunta sobre privacidad o protección de datos, contáctanos en{" "}
              <a href="mailto:privacy@meetyoulive.net">privacy@meetyoulive.net</a>.
            </p>
          </section>
        </div>

        <div className="legal-footer">
          <Link href="/terms">Términos de Servicio</Link>
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
          margin-bottom: 0.35rem;
        }

        .legal-content :global(strong) {
          color: var(--text);
          font-weight: 700;
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
