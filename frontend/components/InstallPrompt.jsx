"use client";

import { useEffect, useState } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{ background: "#e91e8c", color: "#fff", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span>📲 Instala MeetYouLive como app en tu dispositivo</span>
      <div>
        <button onClick={install} style={{ marginRight: "0.5rem", cursor: "pointer" }}>Instalar</button>
        <button onClick={() => setVisible(false)} style={{ cursor: "pointer" }}>✕</button>
      </div>
    </div>
  );
}
