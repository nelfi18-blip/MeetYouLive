"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { clearAllAuth } from "@/lib/token";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const SETTINGS_SECTIONS = [
  {
    title: "Cuenta",
    items: [
      { label: "Perfil e información", description: "Fotos, galería, datos personales y edición.", href: "/profile", icon: "👤" },
      { label: "Seguridad", description: "Contraseña, sesión y recuperación de acceso.", href: "/reset-password", icon: "🔐" },
      { label: "Privacidad", description: "Revisa tus controles y política de privacidad.", href: "/privacy", icon: "🛡️" },
      { label: "Descubrimiento", description: "Ajusta tu presencia desde el perfil y el feed.", href: "/profile", icon: "🧭" },
    ],
  },
  {
    title: "Producto",
    items: [
      { label: "Notificaciones", description: "Push, matches, likes, lives y recompensas.", href: "/settings/notifications", icon: "🔔" },
      { label: "Coins", description: "Comprar monedas y revisar tu balance.", href: "/coins", icon: "🪙" },
      { label: "Premium", description: "Gestiona suscripción y beneficios premium.", href: "/subscription", icon: "⭐" },
      { label: "Creator Center", description: "Dashboard, earnings, wallet, gifts y retiros.", href: "/creator", icon: "🎥" },
    ],
  },
  {
    title: "Soporte y legal",
    items: [
      { label: "Ayuda", description: "Guías, normas y centro legal.", href: "/legal", icon: "❔" },
      { label: "Contacto", description: "Comunícate con el equipo de soporte.", href: "/contact", icon: "✉️" },
      { label: "Privacy", description: "Política de privacidad.", href: "/privacy", icon: "📄" },
      { label: "Terms", description: "Términos de servicio.", href: "/terms", icon: "📜" },
      { label: "Refund", description: "Política de reembolsos y pagos.", href: "/refund", icon: "↩️" },
    ],
  },
];

export default function SettingsPage() {
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleLogout = async () => {
    socket.disconnect();
    clearAllAuth();
    await signOut({ callbackUrl: "/login" });
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    if (!window.confirm("Esta acción eliminará tu cuenta permanentemente. ¿Deseas continuar?")) return;
    const token = localStorage.getItem("token");
    if (!token) {
      setDeleteError("Sesión expirada. Inicia sesión nuevamente.");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.message || "No se pudo eliminar la cuenta.");
        return;
      }
      socket.disconnect();
      clearAllAuth();
      await signOut({ callbackUrl: "/login?accountDeleted=1" });
    } catch {
      setDeleteError("No se pudo conectar con el servidor.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="settings-page">
      <header className="settings-hero">
        <p className="eyebrow">MeetYouLive</p>
        <h1>Settings</h1>
        <p>Configuración profesional organizada para cuenta, seguridad, privacidad, monetización, soporte y legal.</p>
      </header>

      <div className="settings-grid">
        {SETTINGS_SECTIONS.map((section) => (
          <section key={section.title} className="settings-card" aria-labelledby={`settings-${section.title}`}>
            <h2 id={`settings-${section.title}`}>{section.title}</h2>
            <div className="settings-list">
              {section.items.map((item) => (
                <Link key={item.label} href={item.href} className={`settings-item${item.danger ? " danger" : ""}`}>
                  <span className="settings-icon" aria-hidden="true">{item.icon}</span>
                  <span className="settings-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="settings-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="settings-card logout-card" aria-labelledby="settings-session">
          <h2 id="settings-session">Sesión</h2>
          <button type="button" className="logout-button" onClick={handleLogout}>
            <span aria-hidden="true">🚪</span>
            <span>
              <strong>Cerrar sesión</strong>
              <small>Cierra sesión y desconecta servicios en tiempo real.</small>
            </span>
          </button>
        </section>

        <section className="settings-card danger-card" aria-labelledby="settings-danger">
          <h2 id="settings-danger">Acciones de cuenta</h2>
          {deleteError && <p className="delete-error">{deleteError}</p>}
          <button type="button" className="delete-button" onClick={handleDeleteAccount} disabled={deleting}>
            <span aria-hidden="true">🗑️</span>
            <span>
              <strong>{deleting ? "Eliminando cuenta…" : "Eliminar cuenta"}</strong>
              <small>Elimina permanentemente tu cuenta y cierra la sesión.</small>
            </span>
          </button>
        </section>
      </div>

      <style jsx>{`
        .settings-page {
          min-height: 100vh;
          max-width: 1040px;
          margin: 0 auto;
          padding: 1.25rem 1rem 6rem;
          color: #fff;
        }
        .settings-hero {
          border: 1px solid rgba(224, 64, 251, 0.22);
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.22), rgba(15, 23, 42, 0.8));
          padding: 1.35rem;
          margin-bottom: 1rem;
          box-shadow: 0 20px 60px rgba(2, 6, 23, 0.38);
        }
        .eyebrow {
          margin: 0 0 0.35rem;
          color: #f0abfc;
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        h1, h2, p { margin: 0; }
        h1 {
          font-size: clamp(2rem, 7vw, 3.5rem);
          line-height: 1;
        }
        .settings-hero p:last-child {
          margin-top: 0.75rem;
          color: #cbd5e1;
          max-width: 720px;
          line-height: 1.6;
        }
        .settings-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.9rem;
        }
        .settings-card {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          background: rgba(15, 23, 42, 0.74);
          padding: 1rem;
        }
        .settings-card h2 {
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #a78bfa;
          margin-bottom: 0.75rem;
        }
        .settings-list {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .settings-item,
        .logout-button,
        .delete-button {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.045);
          color: #f8fafc;
          text-decoration: none;
          padding: 0.78rem;
          display: flex;
          align-items: center;
          gap: 0.72rem;
          text-align: left;
        }
        .settings-item:hover,
        .logout-button:hover,
        .delete-button:hover {
          border-color: rgba(224, 64, 251, 0.42);
          background: rgba(224, 64, 251, 0.1);
        }
        .settings-icon {
          width: 2.15rem;
          height: 2.15rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.08);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .settings-copy {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.18rem;
        }
        .settings-copy strong,
        .logout-button strong,
        .delete-button strong {
          font-size: 0.9rem;
        }
        .settings-copy small,
        .logout-button small,
        .delete-button small {
          color: #94a3b8;
          line-height: 1.45;
        }
        .settings-arrow {
          color: #c084fc;
          font-weight: 900;
        }
        .danger {
          border-color: rgba(248, 113, 113, 0.25);
        }
        .danger .settings-icon,
        .danger:hover {
          background: rgba(248, 113, 113, 0.1);
        }
        .logout-button,
        .delete-button {
          cursor: pointer;
          font: inherit;
        }
        .delete-button {
          border-color: rgba(248, 113, 113, 0.35);
          background: rgba(127, 29, 29, 0.24);
        }
        .delete-button:hover {
          border-color: rgba(248, 113, 113, 0.65);
          background: rgba(248, 113, 113, 0.14);
        }
        .delete-button:disabled {
          cursor: wait;
          opacity: 0.7;
        }
        .delete-error {
          margin: 0 0 0.75rem;
          color: #fecaca;
          font-size: 0.85rem;
        }
        @media (max-width: 800px) {
          .settings-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
