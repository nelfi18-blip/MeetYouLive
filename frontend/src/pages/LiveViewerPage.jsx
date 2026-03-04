import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;
const LIVE_PROVIDER_KEY = import.meta.env.VITE_LIVE_PROVIDER_KEY;

export default function LiveViewerPage() {
  const { id } = useParams();
  const [live, setLive] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar el directo");
        return res.json();
      })
      .then((data) => {
        const found = data.find((l) => l._id === id);
        if (!found) {
          setError("Directo no encontrado o ya finalizado");
        } else {
          setLive(found);
        }
      })
      .catch(() => setError("No se pudo cargar el directo"));
  }, [id]);

  if (error) return <div className="loading-screen">{error}</div>;
  if (!live) return <div className="loading-screen">Cargando directo…</div>;

  const playerUrl = `https://wl.cinectar.com/player/${LIVE_PROVIDER_KEY}/${live.streamKey}`;

  return (
    <div className="viewer-page">
      <a className="back-link" href="/live">← Volver a directos</a>
      <h1>{live.title}</h1>
      {live.description && <p className="description">{live.description}</p>}
      <div className="player-wrap">
        <iframe
          src={playerUrl}
          allow="autoplay; fullscreen"
          allowFullScreen
          title={live.title}
        />
      </div>
    </div>
  );
}
