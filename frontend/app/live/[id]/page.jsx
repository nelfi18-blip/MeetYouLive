"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const LIVE_PROVIDER_KEY = process.env.NEXT_PUBLIC_LIVE_PROVIDER_KEY;

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

  if (error) return <p style={{ color: "red" }}>{error}</p>;
  if (!live) return <p>Cargando directo…</p>;

  const playerUrl = `https://wl.cinectar.com/player/${LIVE_PROVIDER_KEY}/${live.streamKey}`;

  return (
    <div>
      <h1>{live.title}</h1>
      {live.description && <p>{live.description}</p>}
      <iframe
        src={playerUrl}
        width="854"
        height="480"
        allow="autoplay; fullscreen"
        allowFullScreen
        title={live.title}
        style={{ display: "block", border: "none" }}
      />
    </div>
  );
}
