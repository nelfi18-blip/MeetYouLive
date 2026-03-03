import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/me`, { headers })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem("token");
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((data) => { if (data) setUser(data); })
      .catch(() => setError("No se pudo cargar el perfil"));

    fetch(`${API_URL}/api/user/coins`, { headers })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setCoins(data); })
      .catch(() => {});
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  if (error) return <p style={{ color: "red" }}>{error}</p>;
  if (!user) return <p>Cargando...</p>;

  return (
    <div>
      <h1>Bienvenido, {user.username || user.name}</h1>
      <p>Email: {user.email}</p>
      {coins !== null && (
        <p>
          💰 Monedas: <strong>{coins.coins}</strong> &nbsp;|&nbsp;
          🎁 Ganancias: <strong>{coins.earningsCoins}</strong>
        </p>
      )}
      <nav style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link to="/live">🎥 Directos</Link>
        <Link to="/coins">💰 Comprar monedas</Link>
      </nav>
      <button onClick={logout} style={{ marginTop: "1.5rem" }}>Cerrar sesión</button>
    </div>
  );
}
