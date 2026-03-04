import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

export default function LivePage() {
  const [lives, setLives] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar directos");
        return res.json();
      })
      .then((data) => setLives(data))
      .catch(() => setError("No se pudo cargar la lista de directos"));
  }, []);

  if (error) return <div className="loading-screen">{error}</div>;

  return (
    <div className="page">
      <a className="back-link" href="/dashboard">← Volver</a>
      <h1 style={{ marginBottom: "1.5rem" }}>🎥 Directos en vivo</h1>
      {lives.length === 0 ? (
        <div className="empty-state">
          <p>No hay directos activos en este momento.</p>
        </div>
      ) : (
        <div className="lives-grid">
          {lives.map((live) => (
            <button
              className="live-card"
              key={live._id}
              onClick={() => navigate(`/live/${live._id}`)}
            >
              <span className="live-badge">en vivo</span>
              <h3>{live.title}</h3>
              {live.user?.username && (
                <p>👤 {live.user.username}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
