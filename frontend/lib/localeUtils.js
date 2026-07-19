import { DEFAULT_LANG, LANGUAGE_STORAGE_KEY, detectLanguageFromNavigator, normalizeLanguage } from "./language.js";

/**
 * Get the user's locale for date/time formatting
 * Supports en, es, pt based on browser or user preferences
 */
export function getUserLocale() {
  // Try to get from localStorage (user preference)
  const savedLocale = typeof window !== "undefined" ? normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)) : null;
  if (savedLocale) {
    return savedLocale;
  }

  // Fall back to browser language
  if (typeof navigator !== "undefined") {
    return detectLanguageFromNavigator(navigator);
  }

  // Default to English for unsupported or unknown locales.
  return DEFAULT_LANG;
}

/**
 * Get the full locale code for date formatting (e.g., "es-ES", "en-US", "pt-BR")
 */
export function getFullLocale() {
  const locale = getUserLocale();
  const localeMap = {
    en: "en-US",
    es: "es-ES",
    pt: "pt-BR",
  };
  return localeMap[locale] || "en-US";
}

/**
 * Format time using user's locale
 * @param {Date|string} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted time string
 */
export function formatTime(date, options = { hour: "2-digit", minute: "2-digit" }) {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleTimeString(getFullLocale(), options);
}

/**
 * Format date using user's locale
 * @param {Date|string} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDate(date, options = { day: "numeric", month: "short" }) {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleDateString(getFullLocale(), options);
}
