export const SUPPORTED_LANGS = ["es", "en", "pt"];
export const DEFAULT_LANG = "en";
export const LANGUAGE_STORAGE_KEY = "preferredLanguage";
export const LANGUAGE_COOKIE = "preferredLanguage";
export const LANGUAGE_HEADER = "x-meetyoulive-language";

export function normalizeLanguage(value) {
  if (!value || typeof value !== "string") return null;
  const lang = value.split("-")[0].trim().toLowerCase();
  return SUPPORTED_LANGS.includes(lang) ? lang : null;
}

export function detectLanguageFromAcceptLanguage(acceptLanguage) {
  if (!acceptLanguage || typeof acceptLanguage !== "string") return DEFAULT_LANG;

  const supported = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag, ...params] = entry.trim().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
      return {
        lang: normalizeLanguage(tag),
        q: Number.isFinite(q) ? q : 0,
      };
    })
    .filter((entry) => entry.lang && entry.q > 0);

  const preferred = supported
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.q - a.q || a.index - b.index)[0];

  return preferred?.lang || DEFAULT_LANG;
}

export function detectLanguageFromNavigator(navigatorLike) {
  const languages = [
    ...(Array.isArray(navigatorLike?.languages) ? navigatorLike.languages : []),
    navigatorLike?.language,
  ];
  for (const language of languages) {
    const normalized = normalizeLanguage(language);
    if (normalized) return normalized;
  }
  return DEFAULT_LANG;
}

export function resolveInitialLanguage({ storedLanguage, acceptLanguage } = {}) {
  return (
    normalizeLanguage(storedLanguage) ||
    detectLanguageFromAcceptLanguage(acceptLanguage) ||
    DEFAULT_LANG
  );
}
