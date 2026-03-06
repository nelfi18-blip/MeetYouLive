export default function Logo({ size = "md" }) {
  const scales = { sm: 0.75, md: 1, lg: 1.4 };
  const scale = scales[size] ?? 1;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: `${0.5 * scale}rem`,
      }}
    >
      {/* Icon cluster: hearts + camera + stars */}
      <div
        style={{
          position: "relative",
          width: `${72 * scale}px`,
          height: `${72 * scale}px`,
        }}
      >
        {/* Glow ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(233,30,140,0.35) 0%, transparent 70%)",
            animation: "logo-pulse 3s ease-in-out infinite",
          }}
        />

        {/* Main icon circle */}
        <div
          style={{
            position: "absolute",
            inset: `${8 * scale}px`,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #e91e8c, #9c27b0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 24px rgba(233,30,140,0.5)",
          }}
        >
          {/* Camera SVG */}
          <svg
            width={`${28 * scale}`}
            height={`${28 * scale}`}
            viewBox="0 0 24 24"
            fill="white"
            aria-label="Cámara de video"
            role="img"
          >
            <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
        </div>

        {/* Left heart */}
        <div
          style={{
            position: "absolute",
            top: `${2 * scale}px`,
            left: `${-2 * scale}px`,
            fontSize: `${14 * scale}px`,
            lineHeight: 1,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "0s",
          }}
        >
          ❤️
        </div>

        {/* Right heart */}
        <div
          style={{
            position: "absolute",
            top: `${2 * scale}px`,
            right: `${-2 * scale}px`,
            fontSize: `${14 * scale}px`,
            lineHeight: 1,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "0.6s",
          }}
        >
          ❤️
        </div>

        {/* Top star */}
        <div
          style={{
            position: "absolute",
            top: `${-4 * scale}px`,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: `${11 * scale}px`,
            lineHeight: 1,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "0.3s",
          }}
        >
          ✨
        </div>

        {/* Bottom-right star */}
        <div
          style={{
            position: "absolute",
            bottom: `${-2 * scale}px`,
            right: `${-4 * scale}px`,
            fontSize: `${10 * scale}px`,
            lineHeight: 1,
            animation: "logo-float 2.8s ease-in-out infinite",
            animationDelay: "0.9s",
          }}
        >
          ✨
        </div>
      </div>

      {/* Brand name */}
      <span
        style={{
          fontSize: `${1.4 * scale}rem`,
          fontWeight: 800,
          background: "linear-gradient(135deg, #e91e8c, #ff4db8, #ce93d8)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        MeetYouLive
      </span>

      <style>{`
        @keyframes logo-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
