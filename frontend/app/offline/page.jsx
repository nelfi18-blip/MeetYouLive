"use client";

export default function OfflinePage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "64px",
          marginBottom: "1.5rem",
          filter: "grayscale(100%)",
        }}
      >
        📡
      </div>
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          marginBottom: "0.75rem",
          background: "linear-gradient(135deg, #e040fb 0%, #7c3aed 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        Sin conexión a internet
      </h1>
      <p
        style={{
          fontSize: "1rem",
          color: "var(--text-muted)",
          marginBottom: "2rem",
          maxWidth: "400px",
        }}
      >
        No pudimos conectar con MeetYouLive. Por favor, verifica tu conexión
        a internet e intenta nuevamente.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "0.75rem 2rem",
          fontSize: "1rem",
          fontWeight: 600,
          borderRadius: "12px",
          border: "none",
          background: "linear-gradient(135deg, #e040fb 0%, #7c3aed 100%)",
          color: "#ffffff",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(224,64,251,0.3)",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(224,64,251,0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(224,64,251,0.3)";
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
