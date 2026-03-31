export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
];

/**
 * Detect the browser's preferred language and normalise it to one of the
 * supported UI language codes.  Falls back to "en" when no match is found.
 */
export function detectBrowserLanguage() {
  if (typeof window === "undefined") return "en";
  const raw = (navigator.language || "en").toLowerCase().split("-")[0];
  const supported = SUPPORTED_LANGUAGES.map((l) => l.code);
  return supported.includes(raw) ? raw : "en";
}
