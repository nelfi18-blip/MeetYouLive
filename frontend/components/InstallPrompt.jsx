"use client";

import { useEffect, useState } from "react";

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

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
    <div className="install-banner">
      <span className="install-copy">
        <img src="/logo.svg" alt="MeetYouLive" width="26" height="26" className="install-logo" />
        <span>
          Instala MeetYouLive y accede a tu experiencia premium en un solo toque.
        </span>
      </span>
      <div className="install-actions">
        <button onClick={install} className="install-btn">Instalar</button>
        <button onClick={() => setVisible(false)} className="close-btn" aria-label="Cerrar aviso de instalación">
          <CloseIcon />
        </button>
      </div>

      <style jsx>{`
        .install-banner {
          position: sticky;
          top: 0;
          z-index: 260;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.65rem 1rem;
          background: rgba(15,8,33,0.94);
          border-bottom: 1px solid rgba(224,64,251,0.3);
          box-shadow: 0 10px 24px rgba(4,2,12,0.5);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .install-copy {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: #f8fafc;
          font-size: 0.82rem;
          line-height: 1.4;
        }
        .install-logo {
          filter: drop-shadow(0 0 8px rgba(224,64,251,0.45));
          flex-shrink: 0;
        }
        .install-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          flex-shrink: 0;
        }
        .install-btn {
          border: 1px solid transparent;
          border-radius: 10px;
          background: linear-gradient(135deg, #ff2d78 0%, #c040ff 100%);
          color: #fff;
          font-weight: 700;
          font-size: 0.78rem;
          padding: 0.42rem 0.8rem;
          cursor: pointer;
          transition: transform var(--transition), filter var(--transition);
        }
        .install-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.07);
        }
        .close-btn {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          border: 1px solid rgba(148,163,184,0.28);
          background: rgba(255,255,255,0.04);
          color: #cbd5e1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all var(--transition);
        }
        .close-btn:hover {
          color: #f8fafc;
          border-color: rgba(224,64,251,0.42);
          background: rgba(224,64,251,0.16);
        }
      `}</style>
    </div>
  );
}
