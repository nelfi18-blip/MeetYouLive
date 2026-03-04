import { useState } from "react";
import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

const PACKAGES = [
  { value: 100, label: "100 monedas — $0.99" },
  { value: 500, label: "500 monedas — $4.49" },
  { value: 1000, label: "1000 monedas — $7.99" },
];

export default function BuyCoinsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buy = async (pkg) => {
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/payments/coins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Error al iniciar el pago");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="coins-page">
      <h1>💰 Comprar Monedas</h1>
      <p className="subtitle">Usa monedas para enviar regalos virtuales en directos.</p>
      {error && <div className="error-msg">{error}</div>}
      <div className="package-list">
        {PACKAGES.map((pkg) => (
          <button
            key={pkg.value}
            className="package-btn"
            onClick={() => buy(pkg.value)}
            disabled={loading}
          >
            {pkg.label}
          </button>
        ))}
      </div>
      <Link className="back-link" to="/dashboard">← Volver al inicio</Link>
    </div>
  );
}
