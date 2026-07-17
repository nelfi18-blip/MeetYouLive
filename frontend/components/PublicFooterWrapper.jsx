"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PUBLIC_FOOTER_ROUTES = new Set([
  "/",
  "/about",
  "/how-it-works",
  "/legal",
  "/privacy",
  "/terms",
  "/cookies",
  "/refund",
  "/refunds",
  "/payments-refunds",
  "/contact",
  "/acceptable-use",
  "/community-guidelines",
  "/content-policy",
  "/creator-policy",
  "/dmca",
  "/help-center",
  "/security",
  "/safety-moderation",
]);

const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/community-guidelines", label: "Community Guidelines" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/refund", label: "Refund Policy" },
  { href: "/content-policy", label: "Content Policy" },
  { href: "/creator-policy", label: "Creator Policy" },
  { href: "/help-center", label: "Help Center" },
  { href: "/contact", label: "Contact" },
];

export default function PublicFooterWrapper() {
  const pathname = usePathname();

  if (!pathname || !PUBLIC_FOOTER_ROUTES.has(pathname)) return null;

  return (
    <footer className="public-footer" aria-label="Public links">
      <div className="public-footer-inner">
        <strong>MeetYouLive</strong>
        <nav aria-label="Legal and support">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
        <span>© {new Date().getFullYear()} MEETYOULIVE TECHNOLOGIES LLC</span>
      </div>

      <style jsx>{`
        .public-footer {
          width: 100%;
          padding: 0 1.5rem 2rem;
        }
        .public-footer-inner {
          max-width: 1200px;
          margin: 0 auto;
          border: 1px solid var(--border);
          border-radius: 24px;
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 1rem 1.15rem;
          box-shadow: var(--shadow-sm);
        }
        strong {
          color: var(--text);
          letter-spacing: -0.03em;
        }
        nav {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.85rem 1rem;
          font-size: 0.9rem;
          max-width: 760px;
        }
        nav :global(a) {
          color: var(--accent-cyan);
          font-weight: 800;
        }
        nav :global(a:hover) {
          text-decoration: underline;
        }
        span {
          font-size: 0.8rem;
          text-align: right;
        }
        @media (max-width: 760px) {
          .public-footer {
            padding-inline: 1rem;
          }
          .public-footer-inner {
            align-items: flex-start;
            flex-direction: column;
          }
          nav {
            justify-content: flex-start;
          }
          span {
            text-align: left;
          }
        }
      `}</style>
    </footer>
  );
}
