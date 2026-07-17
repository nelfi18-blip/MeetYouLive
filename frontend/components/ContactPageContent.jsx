"use client";

import Link from "next/link";
import { useState } from "react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleContactSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`MeetYouLive support: ${formData.get("topic") || "Support"}`);
    const body = encodeURIComponent(
      [
        `Name: ${formData.get("name") || ""}`,
        `Email: ${formData.get("email") || ""}`,
        `Topic: ${formData.get("topic") || ""}`,
        "",
        formData.get("message") || "",
      ].join("\n")
    );

    setSubmitted(true);
    window.location.href = `mailto:support@meetyoulive.net?subject=${subject}&body=${body}`;
  }

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
          <p>Estimated response time: 24–48 business hours.</p>
          <p>Urgent safety reports are reviewed as soon as possible.</p>
        </article>
      </section>

      <section className="contact-panel">
        <div>
          <p className="eyebrow">Contact form</p>
          <h2>Need help?</h2>
          <p>
            Send account, billing, safety, creator or compliance requests to our support team. Include your account
            email, transaction ID if applicable, and a clear description of your request.
          </p>
        </div>
        <form onSubmit={handleContactSubmit}>
          <label>
            Name
            <input name="name" autoComplete="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Topic
            <select name="topic" defaultValue="Support">
              <option>Support</option>
              <option>Billing</option>
              <option>Safety</option>
              <option>Creator</option>
              <option>Legal / Compliance</option>
            </select>
          </label>
          <label>
            Message
            <textarea name="message" rows="5" required />
          </label>
          <button className="primary-button" type="submit">
            Send request
          </button>
          {submitted && (
            <p className="form-note" role="status">
              If your email app did not open, email support@meetyoulive.net directly with the details above.
            </p>
          )}
        </form>
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
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(280px, 1.1fr);
          gap: 1.25rem;
        }
        form,
        label {
          display: grid;
          gap: 0.45rem;
        }
        form {
          gap: 0.75rem;
        }
        label {
          color: var(--text);
          font-size: 0.9rem;
          font-weight: 800;
        }
        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: rgba(255,255,255,0.06);
          color: var(--text);
          font: inherit;
          padding: 0.8rem 0.9rem;
        }
        textarea {
          resize: vertical;
        }
        .form-note {
          color: var(--text-muted);
          font-size: 0.86rem;
        }
        .primary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          min-height: 48px;
          border-radius: var(--radius-pill);
          padding: 0.8rem 1.25rem;
          color: #fff;
          background: var(--grad-primary);
          box-shadow: var(--shadow-accent);
          white-space: nowrap;
          cursor: pointer;
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
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
