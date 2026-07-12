"use client";

import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="contact-page">
      <section className="contact-hero">
        <p className="eyebrow">Contact</p>
        <h1>Contact MEETYOULIVE TECHNOLOGIES LLC</h1>
        <p>
          Our public support information is available for users, partners and payment providers reviewing
          MeetYouLive.
        </p>
      </section>

      <section className="contact-grid" aria-label="Contact information">
        <article className="contact-card">
          <h2>Company</h2>
          <p>MEETYOULIVE TECHNOLOGIES LLC</p>
        </article>
        <article className="contact-card">
          <h2>Support email</h2>
          <p>
            <a href="mailto:support@meetyoulive.net">support@meetyoulive.net</a>
          </p>
        </article>
        <article className="contact-card">
          <h2>Support hours</h2>
          <p>Monday to Friday, 9:00 AM – 6:00 PM (ET).</p>
          <p>Urgent safety reports are reviewed as soon as possible.</p>
        </article>
      </section>

      <section className="contact-panel">
        <div>
          <p className="eyebrow">Contact form</p>
          <h2>Need help?</h2>
          <p>
            Email support with your account email, transaction ID if applicable, and a clear description of your
            request. A public contact form may be added later without changing payment or authentication logic.
          </p>
        </div>
        <a className="primary-button" href="mailto:support@meetyoulive.net">
          Email support
        </a>
      </section>

      <section className="policy-links" aria-label="Public policies">
        <h2>Public policies</h2>
        <div>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/refund">Refund Policy</Link>
        </div>
      </section>

      <style jsx>{`
        .contact-page {
          display: grid;
          gap: 1.4rem;
          max-width: 980px;
          margin: 0 auto;
        }
        .contact-hero,
        .contact-card,
        .contact-panel,
        .policy-links {
          border: 1px solid var(--border);
          border-radius: 26px;
          background: var(--grad-card);
          box-shadow: var(--shadow);
        }
        .contact-hero {
          padding: clamp(1.4rem, 4vw, 2.4rem);
        }
        .eyebrow {
          margin: 0 0 0.65rem;
          color: var(--accent-cyan);
          font-size: 0.78rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        h1,
        h2 {
          margin: 0 0 0.75rem;
        }
        h1 {
          font-size: clamp(2.1rem, 5vw, 3.5rem);
        }
        p {
          margin: 0;
          line-height: 1.7;
        }
        .contact-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }
        .contact-card,
        .contact-panel,
        .policy-links {
          padding: 1.2rem;
        }
        .contact-card h2 {
          font-size: 1rem;
        }
        a {
          color: var(--accent-cyan);
          font-weight: 800;
        }
        .contact-panel {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .primary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
          border-radius: var(--radius-pill);
          padding: 0.8rem 1.25rem;
          color: #fff;
          background: var(--grad-primary);
          box-shadow: var(--shadow-accent);
          white-space: nowrap;
        }
        .policy-links div {
          display: flex;
          flex-wrap: wrap;
          gap: 0.85rem 1.2rem;
        }
        @media (max-width: 780px) {
          .contact-grid {
            grid-template-columns: 1fr;
          }
          .contact-panel {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
