"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const CATEGORIES = [
  { key: "match", label: "Matches", icon: "🔥", desc: "Cuando alguien te da match" },
  { key: "like", label: "Likes", icon: "💖", desc: "Cuando alguien te da like" },
  { key: "live", label: "Directos", icon: "🚀", desc: "Cuando un creador que sigues empieza un directo" },
  { key: "reward", label: "Recompensas", icon: "🎁", desc: "Recordatorio de tu recompensa diaria" },
];

export default function NotificationSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [settings, setSettings] = useState({ enabled: true, categories: ["match", "like", "live", "reward"] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const token = session?.backendToken;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  const fetchSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/push/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const save = async (updates) => {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/push/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al guardar");
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = () => {
    const next = !settings.enabled;
    setSettings((s) => ({ ...s, enabled: next }));
    save({ enabled: next });
  };

  const toggleCategory = (key) => {
    const current = settings.categories || [];
    const next = current.includes(key)
      ? current.filter((c) => c !== key)
      : [...current, key];
    setSettings((s) => ({ ...s, categories: next }));
    save({ categories: next });
  };

  if (status === "loading" || loading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0f1a" }}>
        <p style={{ color: "#aaa" }}>Cargando…</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page">
        <header className="header">
          <button className="back-btn" onClick={() => router.back()}>← Volver</button>
          <h1>Notificaciones Push</h1>
          {saved && <span className="saved-badge">✓ Guardado</span>}
        </header>

        {error && <p className="error-msg">{error}</p>}

        {/* Master toggle */}
        <section className="card">
          <div className="row">
            <div>
              <p className="row-title">Notificaciones push</p>
              <p className="row-sub">Recibir alertas en este dispositivo</p>
            </div>
            <button
              className={`toggle ${settings.enabled ? "on" : "off"}`}
              onClick={toggleEnabled}
              disabled={saving}
              aria-label="Activar/desactivar notificaciones"
            >
              <span className="knob" />
            </button>
          </div>
        </section>

        {/* Category toggles */}
        <section className="card" style={{ opacity: settings.enabled ? 1 : 0.45 }}>
          <p className="section-title">Categorías</p>
          {CATEGORIES.map((cat) => {
            const isOn = settings.categories?.includes(cat.key);
            return (
              <div key={cat.key} className="row category-row">
                <div className="cat-info">
                  <span className="cat-icon">{cat.icon}</span>
                  <div>
                    <p className="row-title">{cat.label}</p>
                    <p className="row-sub">{cat.desc}</p>
                  </div>
                </div>
                <button
                  className={`toggle ${isOn ? "on" : "off"}`}
                  onClick={() => toggleCategory(cat.key)}
                  disabled={saving || !settings.enabled}
                  aria-label={`${isOn ? "Desactivar" : "Activar"} ${cat.label}`}
                >
                  <span className="knob" />
                </button>
              </div>
            );
          })}
        </section>

        <p className="hint">
          Los cambios se aplican automáticamente. Las notificaciones de matches tienen la máxima prioridad.
        </p>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #0f0f1a;
          color: #fff;
          padding: 20px 16px 80px;
          max-width: 480px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }
        .header h1 {
          font-size: 1.25rem;
          font-weight: 700;
          flex: 1;
          margin: 0;
        }
        .back-btn {
          background: none;
          border: none;
          color: #a78bfa;
          font-size: 0.9rem;
          cursor: pointer;
          padding: 4px 0;
          white-space: nowrap;
        }
        .saved-badge {
          font-size: 0.8rem;
          color: #4ade80;
          font-weight: 600;
        }
        .error-msg {
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.4);
          border-radius: 8px;
          padding: 10px 14px;
          color: #fca5a5;
          font-size: 0.85rem;
          margin-bottom: 16px;
        }
        .card {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 16px;
          transition: opacity 0.2s;
        }
        .section-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 0 0 12px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .category-row {
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .category-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .category-row:first-of-type {
          padding-top: 0;
        }
        .cat-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cat-icon {
          font-size: 1.4rem;
          flex-shrink: 0;
        }
        .row-title {
          margin: 0 0 2px;
          font-size: 0.95rem;
          font-weight: 600;
        }
        .row-sub {
          margin: 0;
          font-size: 0.78rem;
          color: #888;
        }
        /* Toggle switch */
        .toggle {
          position: relative;
          width: 48px;
          height: 28px;
          border-radius: 14px;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.2s;
          padding: 0;
        }
        .toggle.on {
          background: linear-gradient(90deg, #7c3aed, #a855f7);
        }
        .toggle.off {
          background: #333;
        }
        .toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .knob {
          position: absolute;
          top: 3px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #fff;
          transition: left 0.2s;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .toggle.on .knob {
          left: 22px;
        }
        .toggle.off .knob {
          left: 3px;
        }
        .hint {
          font-size: 0.75rem;
          color: #555;
          text-align: center;
          margin-top: 8px;
          line-height: 1.5;
        }
      `}</style>
    </main>
  );
}
