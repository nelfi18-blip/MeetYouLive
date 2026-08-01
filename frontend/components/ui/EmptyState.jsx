"use client";

export default function EmptyState({
  icon = "✨",
  kicker,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
}) {
  return (
    <div className={`shared-empty-state${compact ? " compact" : ""}`}>
      <div className="shared-empty-icon" aria-hidden="true">{icon}</div>
      {kicker && <span className="shared-empty-kicker">{kicker}</span>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {(action || secondaryAction) && (
        <div className="shared-empty-actions">
          {action}
          {secondaryAction}
        </div>
      )}

      <style jsx>{`
        .shared-empty-state {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          min-height: 220px;
          padding: 2.5rem 1.25rem;
          border: 1px dashed rgba(139,92,246,0.28);
          border-radius: var(--radius);
          background:
            radial-gradient(circle at 50% 0%, rgba(224,64,251,0.14), transparent 35%),
            rgba(15,8,32,0.48);
          color: var(--text);
          text-align: center;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .shared-empty-state.compact {
          min-height: 150px;
          padding: 1.75rem 1rem;
        }
        .shared-empty-icon {
          display: grid;
          place-items: center;
          width: 4rem;
          height: 4rem;
          border-radius: 1.35rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: linear-gradient(135deg, rgba(224,64,251,0.16), rgba(34,211,238,0.1));
          font-size: 2rem;
          box-shadow: 0 0 28px rgba(224,64,251,0.14);
        }
        .shared-empty-kicker {
          color: var(--accent-cyan);
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        h3 {
          margin: 0;
          max-width: 32rem;
          font-size: clamp(1.15rem, 3vw, 1.55rem);
          font-weight: 950;
          letter-spacing: -0.03em;
        }
        p {
          margin: 0;
          max-width: 38rem;
          color: var(--text-muted);
          font-size: 0.92rem;
          line-height: 1.6;
        }
        .shared-empty-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 0.7rem;
          margin-top: 0.25rem;
        }
      `}</style>
    </div>
  );
}
