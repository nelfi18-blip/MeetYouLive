"use client";

const TONE_STYLES = {
  pink: {
    bg: "rgba(255,45,120,0.16)",
    border: "rgba(255,45,120,0.45)",
    text: "#ff9cc8",
    glow: "0 0 16px rgba(255,45,120,0.28)",
  },
  purple: {
    bg: "rgba(139,92,246,0.16)",
    border: "rgba(139,92,246,0.42)",
    text: "#c4b5fd",
    glow: "0 0 16px rgba(139,92,246,0.28)",
  },
  cyan: {
    bg: "rgba(34,211,238,0.14)",
    border: "rgba(34,211,238,0.4)",
    text: "#a5f3fc",
    glow: "0 0 16px rgba(34,211,238,0.26)",
  },
  green: {
    bg: "rgba(52,211,153,0.14)",
    border: "rgba(52,211,153,0.36)",
    text: "#86efac",
    glow: "0 0 16px rgba(52,211,153,0.24)",
  },
};

export default function NeonBadge({ children, tone = "pink", className = "" }) {
  const style = TONE_STYLES[tone] || TONE_STYLES.pink;

  return (
    <span className={`neon-badge ${className}`.trim()}>
      {children}
      <style jsx>{`
        .neon-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.32rem;
          padding: 0.25rem 0.7rem;
          border-radius: var(--radius-pill);
          border: 1px solid ${style.border};
          background: ${style.bg};
          color: ${style.text};
          box-shadow: ${style.glow};
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
        }
      `}</style>
    </span>
  );
}
