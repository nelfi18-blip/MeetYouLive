"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken } from "@/lib/token";
import { BACKEND_TOKEN_READY_EVENT } from "@/lib/pushAuthLifecycle";
import {
  getUniverseReturnPlacement,
  needsUniverseReturnConfirmation,
} from "@/lib/universeReturnPolicy";
import styles from "./UniverseReturnFloat.module.css";

const COPY = {
  es: {
    label: "Volver al universo", short: "Mundo",
    warning: "¿Regresar al universo? Si estás en una llamada o transmisión activa, salir podría interrumpirla.",
  },
  en: {
    label: "Return to the universe", short: "World",
    warning: "Return to the universe? Leaving an active call or live broadcast may interrupt it.",
  },
  pt: {
    label: "Voltar ao universo", short: "Mundo",
    warning: "Voltar ao universo? Sair de uma chamada ou transmissão ativa pode interrompê-la.",
  },
};

export default function UniverseReturnFloat() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang } = useLanguage();
  const { data: session } = useSession();
  const copy = COPY[lang] || COPY.es;
  const [hasBackendToken, setHasBackendToken] = useState(false);

  useEffect(() => {
    const check = () => setHasBackendToken(Boolean(getToken()));
    check();
    window.addEventListener(BACKEND_TOKEN_READY_EVENT, check);
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener(BACKEND_TOKEN_READY_EVENT, check);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, [pathname]);

  const placement = getUniverseReturnPlacement(pathname);
  if (!placement || !(hasBackendToken || session?.backendToken)) return null;

  const goBackToUniverse = () => {
    if (needsUniverseReturnConfirmation(pathname)
      && !window.confirm(copy.warning)) return;
    router.push("/universe");
  };

  return (
    <button type="button"
      className={`${styles.returnButton} ${styles[placement.replace("-", "")]}`}
      onClick={goBackToUniverse}
      aria-label={copy.label}
      title={copy.label}>
      <svg className={styles.planet} viewBox="0 0 48 48" width="34" height="34"
        fill="none" strokeLinecap="round" aria-hidden="true">
        <defs>
          <radialGradient id="universeReturnOcean" cx="25%" cy="15%" r="85%">
            <stop offset="0%" stopColor="#baffff"/>
            <stop offset="39%" stopColor="#23b7ee"/>
            <stop offset="100%" stopColor="#164ba9"/>
          </radialGradient>
        </defs>
        <circle cx="24" cy="24" r="19" fill="url(#universeReturnOcean)" stroke="#c6feff" strokeWidth="2" />
        <path d="M14 14 20 12 24 16 23 21 18 23 19 29 15 29 11 24 13 18Z"
          fill="#78efb9" stroke="#2e9ab1" strokeWidth=".6"/>
        <path d="m29 13 8 3 3 8-5 3-3 7-5-3 1-6-4-4 3-5Z"
          fill="#6de2aa" stroke="#269baa" strokeWidth=".6"/>
        <path d="M10 12a19 19 0 0 1 28 2" stroke="#efffff" strokeWidth="2" opacity=".73"/>
        <ellipse cx="24" cy="24" rx="24" ry="9" transform="rotate(-24 24 24)"
          stroke="#e98cff" strokeWidth="2.2" opacity=".87"/>
      </svg>
      <span className={styles.text}>{copy.short}</span>
    </button>
  );
}
