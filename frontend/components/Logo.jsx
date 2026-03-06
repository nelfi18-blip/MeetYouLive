"use client";

import Link from "next/link";

export default function Logo({ href = "/", size = "md" }) {
  const sizes = {
    sm: { icon: 28, font: "1rem" },
    md: { icon: 36, font: "1.2rem" },
    lg: { icon: 48, font: "1.6rem" },
  };
  const s = sizes[size] || sizes.md;

  return (
    <>
      <Link href={href} className="logo-link">
        <span className="logo-icon" style={{ width: s.icon, height: s.icon }}>
          ▶
        </span>
        <span className="logo-text" style={{ fontSize: s.font }}>
          MeetYouLive
        </span>
      </Link>

      <style jsx>{`
        .logo-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
          color: var(--text);
          font-weight: 800;
          letter-spacing: -0.03em;
          transition: color var(--transition);
        }

        .logo-link:hover {
          color: var(--accent);
        }

        .logo-icon {
          background: var(--accent);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 0.9em;
          flex-shrink: 0;
        }
      `}</style>
    </>
  );
}
