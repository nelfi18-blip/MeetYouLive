/**
 * StatCard – dashboard metric tile.
 *
 * Props:
 *   icon     – React element (SVG)
 *   label    – metric label string
 *   value    – metric value (string | number)
 *   color    – one of: indigo | pink | cyan | orange | purple | red | green
 *   href     – optional link target; if provided, renders as <a>
 */
import Link from "next/link";

const COLOR_MAP = {
  indigo: { bg: "rgba(129,140,248,0.08)", border: "rgba(129,140,248,0.22)", glow: "rgba(129,140,248,0.35)", icon: "#818cf8" },
  pink:   { bg: "rgba(244,114,182,0.08)", border: "rgba(244,114,182,0.22)", glow: "rgba(244,114,182,0.35)", icon: "#f472b6" },
  cyan:   { bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.22)",  glow: "rgba(34,211,238,0.35)",  icon: "#22d3ee" },
  orange: { bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.22)",  glow: "rgba(251,146,60,0.35)",  icon: "#fb923c" },
  purple: { bg: "rgba(224,64,251,0.08)",  border: "rgba(224,64,251,0.22)",  glow: "rgba(224,64,251,0.35)",  icon: "#e040fb" },
  red:    { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.22)", glow: "rgba(248,113,113,0.35)", icon: "#f87171" },
  green:  { bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.22)",  glow: "rgba(52,211,153,0.35)",  icon: "#34d399" },
};

export default function StatCard({ icon, label, value, color = "indigo", href }) {
  const c = COLOR_MAP[color] || COLOR_MAP.indigo;

  const inner = (
    <>
      <div className="sc-icon-wrap">
        {icon}
      </div>
      <div className="sc-body">
        <div className="sc-value">{value ?? "–"}</div>
        <div className="sc-label">{label}</div>
      </div>

      <style jsx>{`
        .sc-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: ${c.bg};
          border: 1px solid ${c.border};
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${c.icon};
          flex-shrink: 0;
          transition: box-shadow 0.2s ease;
        }
        .sc-icon-wrap :global(svg) {
          width: 20px;
          height: 20px;
        }
        .sc-body { flex: 1; }
        .sc-value {
          font-size: 1.45rem;
          font-weight: 800;
          color: #F4F0FF;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }
        .sc-label {
          font-size: 0.75rem;
          color: #9585b8;
          font-weight: 500;
          margin-top: 0.2rem;
        }
      `}</style>
    </>
  );

  const sharedClass = "stat-card";

  if (href) {
    return (
      <>
        <Link href={href} className={sharedClass} style={{ "--c-bg": c.bg, "--c-border": c.border, "--c-glow": c.glow }}>
          {inner}
        </Link>
        <CardStyles />
      </>
    );
  }

  return (
    <>
      <div className={sharedClass} style={{ "--c-bg": c.bg, "--c-border": c.border, "--c-glow": c.glow }}>
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
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.2rem 1.35rem;
        background: rgba(15,8,32,0.7);
        border: 1px solid var(--c-border, rgba(255,255,255,0.1));
        border-radius: 22px;
        transition: transform 0.35s cubic-bezier(0.4,0,0.2,1),
                    box-shadow 0.35s cubic-bezier(0.4,0,0.2,1),
                    border-color 0.2s ease;
        cursor: default;
        text-decoration: none;
        color: inherit;
      }
      a.stat-card { cursor: pointer; }
      a.stat-card:hover {
        transform: translateY(-3px);
        border-color: var(--c-border);
        box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 20px var(--c-glow, transparent);
      }
      a.stat-card:hover .sc-icon-wrap {
        box-shadow: 0 0 14px var(--c-glow, transparent);
      }
    `}</style>
  );
}
