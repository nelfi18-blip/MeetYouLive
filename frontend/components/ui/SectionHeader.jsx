"use client";

export default function SectionHeader({ title, subtitle, action, className = "" }) {
  return (
    <div className={`section-header ${className}`}>
      <div className="section-header-copy">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div className="section-header-action">{action}</div> : null}

      <style jsx>{`
        .section-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .section-header-copy h2 {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: -0.01em;
          color: #f8f5ff;
        }
        .section-header-copy p {
          margin: 0.28rem 0 0;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
