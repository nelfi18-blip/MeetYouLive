"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const QUICK_ACTIONS = [
  { href: "/live", icon: "", label: "Directos", desc: "Ver streams en vivo" },
  { href: "/explore", icon: "", label: "Explorar", desc: "Descubrir creadores" },
  { href: "/coins", icon: "", label: "Monedas", desc: "Comprar y regalar" },
  { href: "/profile", icon: "", label: "Mi perfil", desc: "Editar tu cuenta" },
];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState(null);
  const [lives, setLives] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      window.location.href = "/login";
      return;
    }

    if (session?.backendToken) {
      localStorage.setItem("token", session.backendToken);
    }

    const token = localStorage.getItem("token");

    if (!token) {
      setError("La sesión de Google está activa, pero falta el token del backend.");
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/user/me`, { headers })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem("token");
          throw new Error("No se pudo cargar el perfil");
        }
        return res.json();
      })
      .then((data) => setUser(data))
      .catch((err) => setError(err.message));

    fetch(`${API_URL}/api/user/coins`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCoins(data);
      })
      .catch(() => {});

    fetch(`${API_URL}/api/lives`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLives(Array.isArray(data) ? data.slice(0, 4) : []))
      .catch(() => {});
  }, [session, status]);

  if (status === "loading") {
    return <div>Cargando…</div>;
  }

  if (error) {
    return (
      <div>
        <p>⚠️ {error}</p>
        <p>El login de Google sí entró, pero el backend no entregó el token interno.</p>
        <Link href="/login">Volver al inicio</Link>
      </div>
    );
  }

  if (!user) {
    return <div>Cargando…</div>;
  }

  const displayName = user.username || user.name || "Usuario";
  const initial = displayName[0].toUpperCase();

  return (
    <div>
      <div>
        {session?.user?.image ? (
          <Image src={session.user.image} alt={displayName} width={48} height={48} />
        ) : (
          <span>{initial}</span>
        )}

        <h1>¡Hola, {displayName}!</h1>
        <p>{user.email}</p>
      </div>

      <div>
        <div>
          <strong>{coins?.coins ?? "—"}</strong>
          <p>Monedas</p>
        </div>

        <div>
          <strong>{coins?.earningsCoins ?? "—"}</strong>
          <p>Ganancias</p>
        </div>

        <Link href="/coins">+ Recargar</Link>
      </div>

      <h2>Accesos rápidos</h2>
      <div>
        {QUICK_ACTIONS.map((a) => (
          <Link key={a.href} href={a.href}>
            <div>{a.icon}</div>
            <h3>{a.label}</h3>
            <p>{a.desc}</p>
          </Link>
        ))}
      </div>

      <h2>En vivo ahora</h2>
      {lives.length === 0 ? (
        <div>
          <p>No hay directos activos en este momento.</p>
          <Link href="/explore">Explorar creadores</Link>
        </div>
      ) : (
        <div>
          {lives.map((live) => (
            <div key={live._id || live.id || live.title}>
              <span>LIVE</span>
              <h3>{live.title}</h3>
              <p>@{live.user?.username || "anónimo"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
