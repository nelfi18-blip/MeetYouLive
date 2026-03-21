"use client";

import { createContext, useContext, useEffect, useState } from "react";
import es from "./translations/es";
import en from "./translations/en";

const translations = { es, en };

const LanguageContext = createContext({
  lang: "es",
  setLang: () => {},
  t: (section) => translations.es[section] || {},
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("es");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "es" || saved === "en") setLangState(saved);
  }, []);

  const setLang = (l) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  };

  const t = (section) => translations[lang]?.[section] || translations.es[section] || {};

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
