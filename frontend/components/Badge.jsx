"use client";

/**
 * Reusable Badge component.
 *
 * Props:
 *  - variant: "live" | "creator" | "match" | "verified" | "premium" | "custom"
 *  - children: badge label
 *  - pulse: boolean – adds pulsing glow animation (for "live")
 *  - style: extra inline styles
 *  - className: extra class names
 */
export default function Badge({ variant = "custom", children, pulse = false, style = {}, className = "" }) {
  return (
    <>
      <span className={`badge badge-${variant}${pulse ? " badge-pulse" : ""}${className ? ` ${className}` : ""}`} style={style}>
        {variant === "live" && <span className="badge-dot" />}
        {children}
      </span>
      <style jsx>{`
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.6rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 0.22rem 0.6rem;
          border-radius: 999px;
          white-space: nowrap;
          text-transform: uppercase;
        }

        /* EN VIVO */
        .badge-live {
          background: linear-gradient(135deg, #ff0f8a, #e040fb);
          color: #fff;
          border: 1px solid rgba(255, 15, 138, 0.4);
          box-shadow: 0 2px 10px rgba(255, 15, 138, 0.4);
        }

        /* CREATOR */
        .badge-creator {
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.15), rgba(16, 185, 129, 0.1));
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.3);
        }

        /* MATCH */
        .badge-match {
          background: linear-gradient(135deg, #ff2d78, #e040fb);
          color: #fff;
          border: 1px solid rgba(255, 45, 120, 0.4);
          box-shadow: 0 2px 10px rgba(255, 45, 120, 0.4);
        }

        /* VERIFIED */
        .badge-verified {
          background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(59, 130, 246, 0.1));
          color: #60a5fa;
          border: 1px solid rgba(96, 165, 250, 0.3);
        }

        /* PREMIUM */
        .badge-premium {
          background: linear-gradient(135deg, rgba(251, 146, 60, 0.15), rgba(245, 101, 28, 0.1));
          color: #fb923c;
          border: 1px solid rgba(251, 146, 60, 0.3);
        }

        /* CUSTOM */
        .badge-custom {
          background: rgba(139, 92, 246, 0.12);
          color: #a78bfa;
          border: 1px solid rgba(139, 92, 246, 0.25);
        }

        /* Animated dot */
        .badge-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #fff;
          animation: badge-dot-blink 1.2s ease-in-out infinite;
          flex-shrink: 0;
        }

        @keyframes badge-dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Pulsing glow */
        .badge-pulse {
          animation: badge-glow-pulse 2s ease-in-out infinite;
        }

        @keyframes badge-glow-pulse {
          0%, 100% { box-shadow: 0 2px 8px rgba(255, 15, 138, 0.45); }
          50% { box-shadow: 0 2px 18px rgba(255, 15, 138, 0.8); }
        }
      `}</style>
    </>
  );
}
