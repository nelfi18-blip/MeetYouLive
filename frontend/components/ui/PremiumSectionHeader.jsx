"use client";

export default function PremiumSectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  align = "left",
  className = "",
}) {
  return (
    <div className={`psh ${align === "center" ? "psh-center" : ""} ${className}`.trim()}>
      <div className="psh-copy">
        {eyebrow ? <span className="psh-eyebrow">{eyebrow}</span> : null}
        <h2 className="psh-title">{title}</h2>
        {subtitle ? <p className="psh-subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="psh-action">{action}</div> : null}

      <style jsx>{`
        .psh {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.9rem;
          flex-wrap: wrap;
        }
        .psh-center {
          justify-content: center;
          text-align: center;
        }
        .psh-copy {
          max-width: 740px;
        }
        .psh-eyebrow {
          display: inline-flex;
          align-items: center;
          padding: 0.22rem 0.7rem;
          border-radius: var(--radius-pill);
          font-size: 0.66rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #f5d0fe;
          border: 1px solid rgba(224,64,251,0.38);
          background: rgba(224,64,251,0.14);
        }
        .psh-title {
          margin: 0.45rem 0 0;
          font-size: clamp(1.35rem, 3vw, 2rem);
          letter-spacing: -0.03em;
          font-weight: 800;
          color: #fff;
          line-height: 1.12;
        }
        .psh-subtitle {
          margin: 0.48rem 0 0;
          color: var(--text-muted);
          font-size: 0.9rem;
          line-height: 1.55;
        }
      `}</style>
    </div>
  );
}
