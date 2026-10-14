"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { LEGAL_POLICIES } from "@/lib/legalPolicies";
import { isBottomNavRoute } from "@/lib/bottomNavRoutes";

const FOOTER_LINKS = [
  "about",
  "howItWorks",
  "security",
  "communityGuidelines",
  "privacy",
  "terms",
  "acceptableUse",
  "lawEnforcement",
  "cookies",
  "paymentsRefunds",
  "contentPolicy",
  "creatorPolicy",
  "helpCenter",
  "contact",
];
const LEGAL_POLICY_BY_KEY = new Map(LEGAL_POLICIES.map((policy) => [policy.key, policy]));

export default function PublicFooterWrapper() {
  const pathname = usePathname();
  const { t } = useLanguage();

  // Immersive live room (/live/[id]): the corporate footer must not eat
  // space in this full-screen mobile experience. Legal links stay reachable
  // from every other route (e.g. /legal) as before. Scoped to the
  // room page only — /live/start keeps its footer unchanged.
  if (pathname?.startsWith("/live/") && pathname !== "/live/start") {
    return null;
  }

  // Authenticated internal surfaces covered by BottomNav (dashboard, feed,
  // explore, profile, etc.) are continuous-use app screens, not public/legal
  // pages, so the corporate footer (and any compact variant) must not render
  // at all here — no footer, no wrapper, no placeholder spacing. BottomNav
  // spacing is already reserved independently by MainContentWrapper.
  if (isBottomNavRoute(pathname)) {
    return null;
  }

  return (
    <footer className="public-footer" aria-label="Legal and support">
      <div className="public-footer-inner">
        <strong>MeetYouLive</strong>
        <nav aria-label="Legal and support">
          {FOOTER_LINKS.map((policyKey) => {
            const policy = LEGAL_POLICY_BY_KEY.get(policyKey);
            if (!policy) return null;

            return (
              <Link key={policy.key} href={policy.href}>
                {t(`legal.policies.${policy.key}.shortTitle`)}
              </Link>
            );
          })}
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
