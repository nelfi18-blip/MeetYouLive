"use client";

/**
 * Reusable StatCard component.
 *
 * Props:
 *  - label: string – stat label
 *  - value: string | number – stat value
 *  - icon: React element – icon displayed above value
 *  - color: "pink" | "purple" | "cyan" | "orange" | "green" – accent color
 *  - href: optional link
 */
import Link from "next/link";

const COLOR_MAP = {
  pink:   { bg: "rgba(255,45,120,0.08)",   border: "rgba(255,45,120,0.2)",   glow: "rgba(255,45,120,0.25)",   icon: "#ff2d78"  },
  purple: { bg: "rgba(224,64,251,0.08)",   border: "rgba(224,64,251,0.2)",   glow: "rgba(224,64,251,0.25)",   icon: "#e040fb"  },
  indigo: { bg: "rgba(129,140,248,0.08)",  border: "rgba(129,140,248,0.2)",  glow: "rgba(129,140,248,0.25)",  icon: "#818cf8"  },
  cyan:   { bg: "rgba(96,165,250,0.08)",   border: "rgba(96,165,250,0.2)",   glow: "rgba(96,165,250,0.25)",   icon: "#60a5fa"  },
  orange: { bg: "rgba(251,146,60,0.08)",   border: "rgba(251,146,60,0.2)",   glow: "rgba(251,146,60,0.25)",   icon: "#fb923c"  },
  green:  { bg: "rgba(52,211,153,0.08)",   border: "rgba(52,211,153,0.2)",   glow: "rgba(52,211,153,0.25)",   icon: "#34d399"  },
};

export default function StatCard({ label, value, icon, color = "purple", href }) {
  const c = COLOR_MAP[color] || COLOR_MAP.purple;

  const inner = (
    <>
      <div className="stat-icon-wrap">
        {icon}
      </div>
      <div className="stat-value">{value ?? "—"}</div>
      <div className="stat-label">{label}</div>

      <style jsx>{`
        .stat-icon-wrap {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: ${c.bg};
          border: 1px solid ${c.border};
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${c.icon};
          margin-bottom: 0.75rem;
          transition: box-shadow 0.2s ease;
        }
        .stat-icon-wrap :global(svg) { width: 20px; height: 20px; }

        .stat-value {
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
          margin-top: 0.3rem;
        }
      `}</style>
    </>
  );

  const cardStyle = {
    "--c-bg": c.bg,
    "--c-border": c.border,
    "--c-glow": c.glow,
  };

  if (href) {
    return (
      <>
        <Link href={href} className="stat-card" style={cardStyle}>
          {inner}
        </Link>
        <CardStyles />
      </>
    );
  }

  return (
    <>
      <div className="stat-card" style={cardStyle}>
        {inner}
      </div>
      <CardStyles />
    </>
  );
}

function CardStyles() {
  return (
    <style jsx global>{`
      .stat-card {
        background: rgba(15, 8, 32, 0.7);
        border: 1px solid var(--c-border, var(--border));
        border-radius: var(--radius);
        padding: 1.4rem 1.5rem;
        display: flex;
        flex-direction: column;
        transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                    box-shadow 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                    border-color 0.2s ease;
        cursor: default;
        position: relative;
        overflow: hidden;
        text-decoration: none;
        color: inherit;
      }

      a.stat-card { cursor: pointer; }

      .stat-card:hover {
        transform: translateY(-3px);
        border-color: var(--c-border);
        box-shadow: var(--shadow), 0 0 24px var(--c-glow, transparent);
      }

      .stat-card::before {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--c-bg, transparent);
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .stat-card:hover::before { opacity: 1; }
    `}</style>
  );
}
