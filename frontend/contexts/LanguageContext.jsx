"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import esMessages from "@/messages/es.json";
import enMessages from "@/messages/en.json";
import ptMessages from "@/messages/pt.json";
import {
  DEFAULT_LANG,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGS,
  detectLanguageFromNavigator,
  normalizeLanguage,
} from "@/lib/language";

export { DEFAULT_LANG, SUPPORTED_LANGS };

const messages = { es: esMessages, en: enMessages, pt: ptMessages };

function persistLanguage(lang) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    document.cookie = `${LANGUAGE_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }
}

const LanguageContext = createContext({
  lang: DEFAULT_LANG,
  setLang: () => {},
  syncFromUser: () => {},
  t: (key) => key,
  supportedLangs: SUPPORTED_LANGS,
});

export function LanguageProvider({ children, initialLang = DEFAULT_LANG }) {
  const [lang, setLangState] = useState(() => normalizeLanguage(initialLang) || DEFAULT_LANG);

  useEffect(() => {
    // Priority: manual localStorage preference > server/cookie initial language > browser > English fallback.
    const saved = normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    const nextLang = saved || normalizeLanguage(initialLang) || detectLanguageFromNavigator(navigator);
    setLangState(nextLang);
    persistLanguage(nextLang);
  }, [initialLang]);

  // Keep the html[lang] attribute in sync whenever the language changes.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  /**
   * Change the UI language.
   * Persists the choice to localStorage so it survives page reloads.
   */
  const setLang = useCallback((newLang) => {
    const normalized = normalizeLanguage(newLang);
    if (!normalized) return;
    setLangState(normalized);
    persistLanguage(normalized);
  }, []);

  /**
   * Called after user data is loaded from the backend.
   * The backend `preferredLanguage` takes priority over the browser
   * detection that ran on mount (requirement: saved > browser > default).
   */
  const syncFromUser = useCallback((preferredLanguage) => {
    const normalized = normalizeLanguage(preferredLanguage);
    if (normalized) {
      setLangState(normalized);
      persistLanguage(normalized);
    }
  }, []);

  /**
   * Translate a dot-notation key, e.g. t("nav.home").
   * Falls back to the default language, then to the key itself.
   */
  const t = useCallback(
    (key) => {
      const keys = key.split(".");
      const resolve = (dict) => {
        let val = dict;
        for (const k of keys) {
          if (val == null) return undefined;
          val = val[k];
        }
        return val;
      };
      return resolve(messages[lang]) ?? resolve(messages[DEFAULT_LANG]) ?? key;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, syncFromUser, t, supportedLangs: SUPPORTED_LANGS }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
