"use client";

import Link from "next/link";

export default function IconTile({ href, icon, title, subtitle, disabled = false, className = "" }) {
  const content = (
    <>
      <span className="it-icon">{icon}</span>
      <span className="it-body">
        <span className="it-title">{title}</span>
        {subtitle ? <span className="it-subtitle">{subtitle}</span> : null}
      </span>
      <span className="it-arrow" aria-hidden="true">→</span>
    </>
  );

  if (disabled) {
    return (
      <div className={`itile is-disabled ${className}`.trim()}>
        {content}
        <TileStyles />
      </div>
    );
  }

  return (
    <>
      <Link href={href} className={`itile ${className}`.trim()}>
        {content}
      </Link>
      <TileStyles />
    </>
  );
}

function TileStyles() {
  return (
    <style jsx global>{`
      .itile {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        border-radius: var(--radius);
        border: 1px solid rgba(139, 92, 246, 0.26);
        background: rgba(12, 8, 30, 0.82);
        padding: 1rem;
        text-decoration: none;
        color: inherit;
        transition: transform var(--transition-slow), border-color var(--transition), box-shadow var(--transition-slow), background var(--transition);
      }
      .itile:hover {
        transform: translateY(-3px);
        border-color: rgba(224, 64, 251, 0.48);
        box-shadow: 0 0 24px rgba(224, 64, 251, 0.22);
        background: rgba(18, 10, 40, 0.9);
      }
      .itile.is-disabled {
        opacity: 0.6;
        pointer-events: none;
      }
      .itile.is-disabled .it-arrow {
        opacity: 0.25;
      }
      .it-icon {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        border: 1px solid rgba(224, 64, 251, 0.3);
        background: rgba(224, 64, 251, 0.12);
        color: #e9d5ff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .it-icon :is(svg) {
        width: 20px;
        height: 20px;
      }
      .it-body {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
        flex: 1;
      }
      .it-title {
        font-size: 0.92rem;
        font-weight: 700;
        color: #fff;
        line-height: 1.2;
      }
      .it-subtitle {
        font-size: 0.75rem;
        color: var(--text-muted);
        line-height: 1.4;
      }
      .it-arrow {
        color: #c4b5fd;
        font-size: 0.95rem;
        font-weight: 800;
        transition: transform var(--transition), opacity var(--transition);
      }
      .itile:hover .it-arrow {
        transform: translateX(2px);
      }
    `}</style>
  );
}
