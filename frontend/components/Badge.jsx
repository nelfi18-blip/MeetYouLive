/**
 * Badge – reusable status/label pill.
 *
 * Variants:
 *   live      – animated red "EN VIVO" pulse
 *   creator   – green "CREATOR" label
 *   match     – pink "Match!" label
 *   verified  – cyan verified check
 *   premium   – purple premium star
 *   custom    – pass `bg`, `color`, `border` via style prop
 */
export default function Badge({ variant = "custom", label, style, className = "" }) {
  return (
    <>
      <span className={`badge-root badge-${variant} ${className}`} style={style}>
        {variant === "live" && <span className="badge-dot" />}
        {variant === "verified" && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.29 7.05L12 2 3.71 7.05 2 16.05l7.29 5.05h5.42L22 16.05 20.29 7.05zm-8.29 9.2L7.5 11.75l1.41-1.41 3.09 3.09 6.09-6.09 1.41 1.42-7.5 7.49z"/>
          </svg>
        )}
        {variant === "premium" && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        )}
        <span className="badge-label">
          {label ?? defaultLabel(variant)}
        </span>
      </span>

      <style jsx>{`
        .badge-root {
          display: inline-flex;
          align-items: center;
          gap: 0.28rem;
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          padding: 0.22rem 0.6rem;
          border-radius: 999px;
          white-space: nowrap;
          line-height: 1;
        }

        /* live – animated red glow */
        .badge-live {
          background: linear-gradient(135deg, #ff0f8a, #e040fb);
          color: #fff;
          border: 1px solid rgba(255,15,138,0.4);
          animation: badge-live-pulse 2s ease-in-out infinite;
        }
        @keyframes badge-live-pulse {
          0%, 100% { box-shadow: 0 0 6px rgba(255,15,138,0.5); }
          50%       { box-shadow: 0 0 16px rgba(255,15,138,0.85); }
        }
        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #fff;
          flex-shrink: 0;
          animation: badge-dot-blink 1.2s ease-in-out infinite;
        }
        @keyframes badge-dot-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }

        /* creator */
        .badge-creator {
          background: rgba(52,211,153,0.12);
          color: #34d399;
          border: 1px solid rgba(52,211,153,0.3);
        }

        /* match */
        .badge-match {
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          color: #fff;
          border: 1px solid rgba(255,45,120,0.4);
        }

        /* verified */
        .badge-verified {
          background: rgba(96,165,250,0.1);
          color: #60a5fa;
          border: 1px solid rgba(96,165,250,0.25);
        }

        /* premium */
        .badge-premium {
          background: rgba(224,64,251,0.12);
          color: #e040fb;
          border: 1px solid rgba(224,64,251,0.3);
        }

        /* custom – styles passed via prop */
        .badge-custom {
          background: rgba(255,255,255,0.06);
          color: var(--text-muted, #9585b8);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .badge-label { line-height: 1; }
      `}</style>
    </>
  );
}

function defaultLabel(variant) {
  switch (variant) {
    case "live":     return "EN VIVO";
    case "creator":  return "CREATOR";
    case "match":    return "Match!";
    case "verified": return "Verificado";
    case "premium":  return "Premium";
    default:         return "";
  }
}
