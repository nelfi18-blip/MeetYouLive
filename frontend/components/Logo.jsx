export default function Logo({ size = "md" }) {
  const scales = { sm: 0.75, md: 1, lg: 1.5 };
  const scale = scales[size] ?? 1;
  const S = (n) => `${n * scale}px`;
  const R = (n) => `${n * scale}rem`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: R(0.45),
      }}
    >
      {/* Icon cluster */}
      <div
        style={{
          position: "relative",
          width: S(84),
          height: S(84),
        }}
      >
        {/* Outer glow ring */}
        <div
          style={{
            position: "absolute",
            inset: S(-8),
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,15,138,0.3) 0%, rgba(122,43,255,0.2) 50%, transparent 70%)",
            animation: "logo-pulse 3s ease-in-out infinite",
            filter: "blur(6px)",
          }}
        />

        {/* Main circle */}
        <div
          style={{
            position: "absolute",
            inset: S(6),
            borderRadius: "50%",
            background: "linear-gradient(135deg, #FF0F8A 0%, #FF4FD8 40%, #7A2BFF 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 30px rgba(255,15,138,0.6), 0 0 60px rgba(122,43,255,0.35)`,
          }}
        >
          {/* Camera / lens SVG */}
          <svg
            width={S(30)}
            height={S(30)}
            viewBox="0 0 24 24"
            fill="white"
            aria-label="Cámara de video"
            role="img"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}
          >
            <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
        </div>

        {/* Left heart */}
        <div
          style={{
            position: "absolute",
            top: S(0),
            left: S(-4),
            fontSize: S(18),
            lineHeight: 1,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "0s",
            filter: "drop-shadow(0 0 6px rgba(255,15,138,0.9))",
          }}
        >
          ❤️
        </div>

        {/* Right heart */}
        <div
          style={{
            position: "absolute",
            top: S(0),
            right: S(-4),
            fontSize: S(16),
            lineHeight: 1,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "0.5s",
            filter: "drop-shadow(0 0 6px rgba(255,79,216,0.9))",
          }}
        >
          ❤️
        </div>

        {/* Top sparkle */}
        <div
          style={{
            position: "absolute",
            top: S(-6),
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: S(13),
            lineHeight: 1,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "0.3s",
          }}
        >
          ✨
        </div>

        {/* Bottom-right sparkle */}
        <div
          style={{
            position: "absolute",
            bottom: S(-4),
            right: S(-5),
            fontSize: S(11),
            lineHeight: 1,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "0.9s",
          }}
        >
          ✨
        </div>

        {/* Bottom-left dot glow */}
        <div
          style={{
            position: "absolute",
            bottom: S(4),
            left: S(-2),
            width: S(8),
            height: S(8),
            borderRadius: "50%",
            background: "#FF9A1F",
            boxShadow: `0 0 ${S(8)} rgba(255,154,31,0.9)`,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "1.2s",
          }}
        />
      </div>

      {/* Brand name */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.1em", lineHeight: 1 }}>
        <span
          style={{
            fontSize: R(1.5),
            fontWeight: 800,
            color: "#F8F4FF",
            letterSpacing: "-0.04em",
          }}
        >
          MeetYou
        </span>
        <span
          style={{
            fontSize: R(1.5),
            fontWeight: 800,
            background: "linear-gradient(135deg, #FF0F8A, #FF4FD8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.04em",
            filter: "drop-shadow(0 0 8px rgba(255,15,138,0.6))",
          }}
        >
          Live
        </span>
      </div>

      <style>{`
        @keyframes logo-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.9; }
          50%       { transform: scale(1.18); opacity: 0.6; }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0);    }
          50%       { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
