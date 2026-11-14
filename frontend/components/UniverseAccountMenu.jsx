"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getToken } from "@/lib/token";
import { BACKEND_TOKEN_READY_EVENT } from "@/lib/pushAuthLifecycle";
import { getUniverseAccountLinks } from "@/lib/universeAccountNavigation";
import styles from "./ExploreCarousel3D.module.css";

const LABELS = {
  es: {
    menu: "Menú", open: "Abrir menú de MeetYouLive", close: "Cerrar menú",
    home: "Mi inicio", profile: "Mi perfil", chats: "Chats y mensajes",
    notifications: "Notificaciones", wallet: "Mi billetera", coins: "Monedas y recargas", settings: "Configuración",
    request: "Solicitar ser creador", requestPending: "Ver mi solicitud",
    requestReview: "Revisar solicitud", creator: "Panel creador",
    goLive: "Transmitir en vivo", agency: "Mi agencia", admin: "Administración",
  },
  en: {
    menu: "Menu", open: "Open MeetYouLive menu", close: "Close menu",
    home: "My home", profile: "My profile", chats: "Chats and messages",
    notifications: "Notifications", wallet: "My wallet", coins: "Coins and top-ups", settings: "Settings",
    request: "Apply to be a creator", requestPending: "View my application",
    requestReview: "Review application", creator: "Creator dashboard",
    goLive: "Go live", agency: "My agency", admin: "Administration",
  },
  pt: {
    menu: "Menu", open: "Abrir menu do MeetYouLive", close: "Fechar menu",
    home: "Meu início", profile: "Meu perfil", chats: "Chats e mensagens",
    notifications: "Notificações", wallet: "Minha carteira", coins: "Moedas e recargas", settings: "Configurações",
    request: "Solicitar ser criador", requestPending: "Ver minha solicitação",
    requestReview: "Revisar solicitação", creator: "Painel criador",
    goLive: "Transmitir ao vivo", agency: "Minha agência", admin: "Administração",
  },
};

export default function UniverseAccountMenu({ lang = "es" }) {
  const { data: session } = useSession();
  const labels = LABELS[lang] || LABELS.es;
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState({
    profile: null, authenticated: false, admin: false,
  });
  const menuRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const admin = document.cookie.split(";").some((entry) =>
        entry.trim().startsWith("admin-session="));
      if (admin) {
        if (!disposed) setIdentity({ profile: null, authenticated: false, admin: true });
        return;
      }

      // Both email/password and Google OAuth keep their established flow.
      const token = getToken() || session?.backendToken;
      if (!token) {
        if (!disposed) setIdentity({ profile: null, authenticated: false, admin: false });
        return;
      }

      // Never elevate privileges on a decoded token or unverified status.
      // The existing backend /api/user/me is authoritative.
      if (!process.env.NEXT_PUBLIC_API_URL) {
        if (!disposed) setIdentity({ profile: null, authenticated: true, admin: false });
        return;
      }
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (disposed) return;
        setIdentity({
          profile: response.ok ? await response.json() : null,
          authenticated: response.status !== 401 && response.status !== 403,
          admin: false,
        });
      } catch {
        if (!disposed) setIdentity({ profile: null, authenticated: true, admin: false });
      }
    };
    void refresh();
    const onAuth = () => { void refresh(); };
    window.addEventListener(BACKEND_TOKEN_READY_EVENT, onAuth);
    window.addEventListener("focus", onAuth);
    return () => {
      disposed = true;
      window.removeEventListener(BACKEND_TOKEN_READY_EVENT, onAuth);
      window.removeEventListener("focus", onAuth);
    };
  }, [session?.backendToken]);

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = getUniverseAccountLinks(identity.profile, identity);
  return (
    <div className={styles.accountMenu} ref={menuRef}>
      <button ref={toggleRef} type="button"
        className={styles.accountMenuToggle}
        aria-label={open ? labels.close : labels.open}
        title={labels.menu}
        aria-expanded={open}
        aria-controls="universe-account-links"
        onClick={() => setOpen((wasOpen) => !wasOpen)}>
        <svg viewBox="0 0 24 24" width="23" height="23"
          fill="none" stroke="currentColor" strokeWidth="2.3"
          strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <nav id="universe-account-links" className={styles.accountMenuPanel}
          aria-label={labels.menu}>
          {links.map((item) => (
            <Link key={item.id} href={item.href}
              className={styles.accountMenuLink}
              data-primary={item.id === "chats" ? "yes" : "no"}
              data-coins={item.id === "coins" ? "yes" : "no"}
              onClick={() => setOpen(false)}>
              {item.id === "chats" && (
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                  <path d="M8 9h8M8 13h5" />
                </svg>
              )}
              {item.id === "coins" && (
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
                  stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true">
                  <ellipse cx="12" cy="5.5" rx="7" ry="3" />
                  <path d="M5 5.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 10.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
                </svg>
              )}
              {labels[item.id] || item.id}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
