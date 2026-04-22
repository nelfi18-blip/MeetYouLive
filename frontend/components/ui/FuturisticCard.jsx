"use client";

const ACCENT_MAP = {
  purple: "rgba(224,64,251,0.28)",
  cyan: "rgba(34,211,238,0.26)",
  pink: "rgba(244,114,182,0.28)",
  orange: "rgba(251,146,60,0.26)",
  green: "rgba(52,211,153,0.26)",
};

export default function FuturisticCard({
  children,
  className = "",
  accent = "purple",
  hover = true,
}) {
  const accentColor = ACCENT_MAP[accent] || ACCENT_MAP.purple;

  return (
    <div className={`fcard${hover ? " fcard-hover" : ""} ${className}`}>
      {children}
      <style jsx>{`
        .fcard {
          position: relative;
          overflow: hidden;
          border-radius: var(--radius);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(160deg, rgba(20, 12, 46, 0.88) 0%, rgba(10, 6, 25, 0.94) 100%);
          backdrop-filter: blur(16px) saturate(1.35);
          -webkit-backdrop-filter: blur(16px) saturate(1.35);
          box-shadow: var(--shadow), 0 0 0 1px rgba(255, 255, 255, 0.02);
          transition: transform var(--transition-slow), border-color var(--transition), box-shadow var(--transition-slow);
        }
        .fcard::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, ${accentColor}, transparent 42%);
          opacity: 0.22;
          pointer-events: none;
        }
        .fcard::after {
          content: "";
          position: absolute;
          top: -30%;
          right: -20%;
          width: 240px;
          height: 240px;
          border-radius: 50%;
          background: radial-gradient(circle, ${accentColor}, transparent 70%);
          filter: blur(24px);
          opacity: 0.4;
          pointer-events: none;
        }
        .fcard-hover:hover {
          transform: translateY(-3px);
          border-color: ${accentColor};
          box-shadow: var(--shadow), 0 0 26px ${accentColor};
        }
      `}</style>
    </div>
  );
}
