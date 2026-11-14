"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
    menuTitle: "Accesos de MeetYouLive", more: "Desliza para ver más",
    loginHint: "En la vista previa, las páginas personales piden iniciar sesión.",
    sections: { communication: "Comunicación", account: "Mi cuenta", money: "Monedas y beneficios", creator: "Creadores", help: "Ayuda" },
    gifts: "Regalos recibidos", vip: "VIP y beneficios", help: "Centro de ayuda",
    notifications: "Notificaciones", wallet: "Mi billetera", coins: "Monedas y recargas", settings: "Configuración",
    request: "Solicitar ser creador", requestPending: "Ver mi solicitud",
    requestReview: "Revisar solicitud", creator: "Panel creador",
    goLive: "Transmitir en vivo", agency: "Mi agencia", admin: "Administración",
  },
  en: {
    menu: "Menu", open: "Open MeetYouLive menu", close: "Close menu",
    home: "My home", profile: "My profile", chats: "Chats and messages",
    menuTitle: "MeetYouLive shortcuts", more: "Scroll for more",
    loginHint: "In this preview, personal pages require signing in.",
    sections: { communication: "Communication", account: "My account", money: "Coins and benefits", creator: "Creators", help: "Help" },
    gifts: "Received gifts", vip: "VIP and benefits", help: "Help center",
    notifications: "Notifications", wallet: "My wallet", coins: "Coins and top-ups", settings: "Settings",
    request: "Apply to be a creator", requestPending: "View my application",
    requestReview: "Review application", creator: "Creator dashboard",
    goLive: "Go live", agency: "My agency", admin: "Administration",
  },
  pt: {
    menu: "Menu", open: "Abrir menu do MeetYouLive", close: "Fechar menu",
    home: "Meu início", profile: "Meu perfil", chats: "Chats e mensagens",
    menuTitle: "Acessos MeetYouLive", more: "Role para ver mais",
    loginHint: "Nesta prévia, páginas pessoais exigem iniciar sessão.",
    sections: { communication: "Comunicação", account: "Minha conta", money: "Moedas e benefícios", creator: "Criadores", help: "Ajuda" },
    gifts: "Presentes recebidos", vip: "VIP e benefícios", help: "Central de ajuda",
    notifications: "Notificações", wallet: "Minha carteira", coins: "Moedas e recargas", settings: "Configurações",
    request: "Solicitar ser criador", requestPending: "Ver minha solicitação",
    requestReview: "Revisar solicitação", creator: "Painel criador",
    goLive: "Transmitir ao vivo", agency: "Minha agência", admin: "Administração",
  },
};

function MenuLinkIcon({ id }) {
  let icon;
  switch (id) {
    case "chats": icon = <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></>; break;
    case "notifications": icon = <><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10" /><path d="M10 21h4" /></>; break;
    case "profile": icon = <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>; break;
    case "home": icon = <><path d="m3 10 9-7 9 7v11H3Z" /><path d="M9 21v-7h6v7" /></>; break;
    case "settings": icon = <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" /></>; break;
    case "wallet": icon = <><rect x="3" y="6" width="18" height="15" rx="3" /><path d="M3 9V5a2 2 0 0 1 2-2h13M15 13h6v5h-6a2.5 2.5 0 0 1 0-5Z" /></>; break;
    case "coins": icon = <><ellipse cx="12" cy="5.5" rx="7" ry="3" /><path d="M5 5.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 10.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>; break;
    case "gifts": icon = <><rect x="3" y="10" width="18" height="11" rx="2" /><path d="M2 7h20v4H2zM12 7v14M12 7C7 7 6 3 8.5 3 11 3 12 7 12 7Zm0 0c5 0 6-4 3.5-4C13 3 12 7 12 7Z" /></>; break;
    case "vip": icon = <><path d="m3 8 4 4 5-8 5 8 4-4-2 12H5L3 8Z" /><path d="M5 20h14" /></>; break;
    case "creator": case "request": case "requestPending": case "requestReview": icon = <><path d="M5 20V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v13M3 20h18M8 11h8M8 15h5" /></>; break;
    case "goLive": icon = <><circle cx="12" cy="12" r="2" /><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16m16-16a11 11 0 0 1 0 16" /></>; break;
    case "help": icon = <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3v.5" /></>; break;
    default: icon = <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>;
  }
  return <svg className={styles.accountMenuIcon} viewBox="0 0 24 24" width="19" height="19"
    fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">{icon}</svg>;
}

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
        <span className={styles.accountMenuToggleText}>{labels.menu}</span>
      </button>
      {open && (
        <nav id="universe-account-links" className={styles.accountMenuPanel}
          aria-label={labels.menu}>
          <div className={styles.accountMenuHeading}>
            <strong>{labels.menuTitle}</strong>
            <span>{labels.more} ↓</span>
          </div>
          {!identity.authenticated && !identity.admin && (
            <p className={styles.accountMenuNote}>{labels.loginHint}</p>
          )}
          {links.map((item, index) => (
            <Fragment key={item.id}>
              {(index === 0 || links[index - 1]?.group !== item.group) && (
                <p className={styles.accountMenuGroup}>{labels.sections[item.group] || item.group}</p>
              )}
              <Link href={item.href}
                className={styles.accountMenuLink}
                data-primary={item.id === "chats" ? "yes" : "no"}
                data-coins={item.id === "coins" ? "yes" : "no"}
                onClick={() => setOpen(false)}>
                <MenuLinkIcon id={item.id} />
                <span>{labels[item.id] || item.id}</span>
              </Link>
            </Fragment>
          ))}
        </nav>
      )}
    </div>
  );
}
