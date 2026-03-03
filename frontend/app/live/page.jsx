"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function LivePage() {
  const [lives, setLives] = useState([]);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch(`${API_URL}/api/lives`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar directos");
        return res.json();
      })
      .then((data) => setLives(data))
      .catch(() => setError("No se pudo cargar la lista de directos"));
  }, []);

  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div>
      <h1>Directos en vivo</h1>
      {lives.length === 0 ? (
        <p>No hay directos activos en este momento.</p>
      ) : (
        <ul>
          {lives.map((live) => (
            <li key={live._id}>
              <button onClick={() => router.push(`/live/${live._id}`)}>
                {live.title} — {live.user?.username}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
