"use client";

const TONE = {
  orange: {
    border: "rgba(251,146,60,0.34)",
    glow: "0 0 36px rgba(251,146,60,0.18)",
    value: "#fdba74",
    iconBg: "rgba(251,146,60,0.14)",
  },
  purple: {
    border: "rgba(139,92,246,0.35)",
    glow: "0 0 36px rgba(139,92,246,0.2)",
    value: "#c4b5fd",
    iconBg: "rgba(139,92,246,0.16)",
  },
  green: {
    border: "rgba(52,211,153,0.33)",
    glow: "0 0 36px rgba(52,211,153,0.17)",
    value: "#86efac",
    iconBg: "rgba(52,211,153,0.14)",
  },
};

export default function FuturisticBalanceCard({
  title,
  value,
  description,
  icon,
  tone = "orange",
  action,
  className = "",
}) {
  const style = TONE[tone] || TONE.orange;

  return (
    <div className={`fbc ${className}`.trim()}>
      <div className="fbc-top">
        <span className="fbc-icon">{icon}</span>
        <span className="fbc-title">{title}</span>
      </div>
      <div className="fbc-value">{value}</div>
      {description ? <p className="fbc-desc">{description}</p> : null}
      {action ? <div className="fbc-action">{action}</div> : null}

      <style jsx>{`
        .fbc {
          position: relative;
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid ${style.border};
          background:
            linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 40%),
            linear-gradient(155deg, rgba(18,10,40,0.95) 0%, rgba(10,6,26,0.94) 100%);
          padding: 1.2rem;
          box-shadow: var(--shadow), ${style.glow};
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          min-height: 190px;
        }
        .fbc::after {
          content: "";
          position: absolute;
          top: -48px;
          right: -48px;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background: radial-gradient(circle, ${style.iconBg}, transparent 72%);
          pointer-events: none;
        }
        .fbc-top {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          position: relative;
          z-index: 1;
        }
        .fbc-icon {
          width: 2rem;
          height: 2rem;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: ${style.iconBg};
          color: ${style.value};
          border: 1px solid ${style.border};
        }
        .fbc-title {
          font-size: 0.74rem;
          color: var(--text-muted);
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .fbc-value {
          font-size: clamp(1.7rem, 4vw, 2.35rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.03em;
          color: ${style.value};
          position: relative;
          z-index: 1;
        }
        .fbc-desc {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.82rem;
          line-height: 1.5;
          position: relative;
          z-index: 1;
        }
        .fbc-action {
          margin-top: auto;
          position: relative;
          z-index: 1;
        }
      `}</style>
    </div>
  );
}
