"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import esMessages from "@/messages/es.json";
import enMessages from "@/messages/en.json";
import ptMessages from "@/messages/pt.json";

export const SUPPORTED_LANGS = ["es", "en", "pt"];
export const DEFAULT_LANG = "es";
const STORAGE_KEY = "preferredLanguage";

const messages = { es: esMessages, en: enMessages, pt: ptMessages };

function readStoredLanguage() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLanguage(lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
  }
}

function syncDocumentLanguage(lang) {
  try {
    document.documentElement.lang = lang;
  } catch {
  }
}

/**
 * Detect the browser's preferred language, returning a supported lang code or the default.
 */
function detectBrowserLang() {
  if (typeof navigator === "undefined") return DEFAULT_LANG;
  const browserLang = (navigator.language || "").split("-")[0].toLowerCase();
  return SUPPORTED_LANGS.includes(browserLang) ? browserLang : DEFAULT_LANG;
}

const LanguageContext = createContext({
  lang: DEFAULT_LANG,
  setLang: () => {},
  syncFromUser: () => {},
  t: (key) => key,
  supportedLangs: SUPPORTED_LANGS,
});

export function LanguageProvider({ children }) {
  // Start with the default lang to avoid SSR hydration mismatch.
  // The actual language is resolved on the client inside the first useEffect.
  const [lang, setLangState] = useState(DEFAULT_LANG);

  useEffect(() => {
    // Priority: localStorage (cached user preference) > browser > default
    const saved = readStoredLanguage();
    if (saved && SUPPORTED_LANGS.includes(saved)) {
      setLangState(saved);
      syncDocumentLanguage(saved);
    } else {
      const detected = detectBrowserLang();
      setLangState(detected);
      syncDocumentLanguage(detected);
    }
  }, []);

  // Keep the html[lang] attribute in sync whenever the language changes.
  useEffect(() => {
    syncDocumentLanguage(lang);
  }, [lang]);

  /**
   * Change the UI language.
   * Persists the choice to localStorage so it survives page reloads.
   */
  const setLang = useCallback((newLang) => {
    if (!SUPPORTED_LANGS.includes(newLang)) return;
    setLangState(newLang);
    writeStoredLanguage(newLang);
  }, []);

  /**
   * Called after user data is loaded from the backend.
   * The backend `preferredLanguage` takes priority over the browser
   * detection that ran on mount (requirement: saved > browser > default).
   */
  const syncFromUser = useCallback((preferredLanguage) => {
    if (preferredLanguage && SUPPORTED_LANGS.includes(preferredLanguage)) {
      setLangState(preferredLanguage);
      writeStoredLanguage(preferredLanguage);
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
