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

  if (error) return <div className="loading-screen">{error}</div>;
  if (!user) return <div className="loading-screen">Cargando…</div>;

  return (
    <div className="page">
      <div className="top-bar">
        <h1>👋 {user.username || user.name}</h1>
        <div className="coins-badge">
          {coins !== null && (
            <>
              <span>💰 <strong>{coins.coins}</strong> monedas</span>
              <span>🎁 <strong>{coins.earningsCoins}</strong> ganancias</span>
            </>
          )}
          <button className="btn btn-sm" onClick={logout}>Cerrar sesión</button>
        </div>
      </div>
      <p className="section-title">📋 Menú principal</p>
      <div className="nav-grid">
        <Link className="nav-card" to="/live">
          <span className="icon">🎥</span>
          Directos
        </Link>
        <Link className="nav-card" to="/coins">
          <span className="icon">💰</span>
          Comprar monedas
        </Link>
      </div>
    </div>
  );
}
