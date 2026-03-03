"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
    <div style={{ textAlign: "center", marginTop: "3rem" }}>
      <h1>💰 Comprar Monedas</h1>
      <p>Usa monedas para enviar regalos virtuales en directos.</p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", marginTop: "1.5rem" }}>
        {PACKAGES.map((pkg) => (
          <button
            key={pkg.value}
            onClick={() => buy(pkg.value)}
            disabled={loading}
            style={{ padding: "0.75rem 2rem", fontSize: "1rem", cursor: "pointer" }}
          >
            {pkg.label}
          </button>
        ))}
      </div>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/dashboard">← Volver al inicio</Link>
      </p>
    </div>
  );
}
