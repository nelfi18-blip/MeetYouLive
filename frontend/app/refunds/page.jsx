"use client";

import Link from "next/link";

export default function RefundsPage() {
  const lastUpdated = "21 de abril de 2026";

  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <Link href="/dashboard" className="back-link">← Volver</Link>
          <h1 className="legal-title">Política de Reembolsos</h1>
          <p className="legal-date">Última actualización: {lastUpdated}</p>
        </div>

        <div className="legal-content">
          <section>
            <h2>1. Principio general</h2>
            <p>
              MeetYouLive es un servicio digital. Salvo las excepciones indicadas en esta política,
              todas las compras de monedas virtuales y suscripciones no son reembolsables una vez
              procesado el pago, de conformidad con la normativa aplicable sobre servicios digitales.
            </p>
          </section>

          <section>
            <h2>2. MYL Coins y Sparks</h2>
            <p>
              Las compras de MYL Coins y Sparks son definitivas y no reembolsables, dado que son
              bienes digitales de consumo inmediato. Sin embargo, podrás solicitar un reembolso en
              los siguientes casos excepcionales:
            </p>
            <ul>
              <li>
                <strong>Error técnico acreditado:</strong> si el sistema no acreditó correctamente
                las monedas compradas en tu cuenta tras un cargo exitoso.
              </li>
              <li>
                <strong>Cargo duplicado:</strong> si se realizó más de un cargo por la misma
                transacción.
              </li>
              <li>
                <strong>Uso fraudulento:</strong> si tu cuenta fue comprometida y se realizaron
                compras sin tu autorización (debes notificarlo en un plazo máximo de 7 días desde el
                cargo).
              </li>
            </ul>
            <p>
              Las monedas ya utilizadas (enviadas como regalos, usadas en llamadas, etc.) no son
              reembolsables en ningún caso.
            </p>
          </section>

          <section>
            <h2>3. Suscripción Premium</h2>
            <p>
              Puedes cancelar tu suscripción en cualquier momento desde tu perfil. La cancelación
              será efectiva al final del período de facturación en curso; no se emiten reembolsos
              parciales por el tiempo no utilizado del mes en curso.
            </p>
            <p>
              Excepcionalmente, si experimentas un problema técnico grave que te impida acceder a
              los beneficios de suscripción durante más de 48 horas y el equipo de soporte no puede
              resolverlo, podrás solicitar un reembolso proporcional por el tiempo afectado.
            </p>
          </section>

          <section>
            <h2>4. Contracargos (chargebacks)</h2>
            <p>
              Si presentas un contracargo ante tu banco o procesador de pagos sin haber contactado
              previamente con nuestro soporte, tu cuenta será suspendida hasta la resolución del
              caso. Si el contracargo es declarado improcedente, la suspensión será permanente.
            </p>
            <p>
              Te pedimos que antes de iniciar cualquier disputa bancaria contactes con nosotros;
              resolveremos tu caso de forma rápida y sin coste adicional.
            </p>
          </section>

          <section>
            <h2>5. Cómo solicitar un reembolso</h2>
            <p>Para solicitar un reembolso, contacta con nuestro equipo de soporte:</p>
            <ul>
              <li>
                <strong>Email:</strong>{" "}
                <a href="mailto:support@meetyoulive.net">support@meetyoulive.net</a>
              </li>
              <li>
                <strong>Información necesaria:</strong> nombre de usuario, fecha de la transacción,
                importe y motivo de la solicitud.
              </li>
              <li>
                <strong>Plazo de respuesta:</strong> respondemos en un máximo de 5 días hábiles.
              </li>
              <li>
                <strong>Plazo para solicitar:</strong> las solicitudes deben presentarse dentro de
                los 30 días siguientes al cargo.
              </li>
            </ul>
          </section>

          <section>
            <h2>6. Cierre de cuenta</h2>
            <p>
              Si decides eliminar tu cuenta, el saldo de monedas virtuales restante no será
              reembolsado. Te recomendamos usar tus monedas antes de solicitar la eliminación.
            </p>
          </section>

          <section>
            <h2>7. Modificaciones</h2>
            <p>
              Nos reservamos el derecho a modificar esta política en cualquier momento. Los cambios
              te serán comunicados con al menos 15 días de antelación a través del correo
              electrónico de tu cuenta o mediante un aviso visible en la Plataforma.
            </p>
          </section>

          <section>
            <h2>8. Contacto</h2>
            <p>
              Para cualquier duda sobre esta política, escríbenos a{" "}
              <a href="mailto:support@meetyoulive.net">support@meetyoulive.net</a>.
            </p>
          </section>
        </div>

        <div className="legal-footer">
          <Link href="/terms">Términos de Servicio</Link>
          <span>·</span>
          <Link href="/privacy">Política de Privacidad</Link>
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
