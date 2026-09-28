// Single shared source of truth for MeetYouLive's non-GPS country
// auto-preselection (IP-based country_code/country_name lookup with a
// device-locale fallback). Extracted from the approved CreatorRequestForm.jsx
// implementation so onboarding, profile, and creator-request all reuse the
// exact same logic and data instead of maintaining separate copies — this is
// the only geolocation-adjacent detection system in the app.
//
// IMPORTANT: this module never touches navigator.geolocation (GPS). GPS
// stays strictly behind each page's existing manual "use my location"
// button; detectCountryNonGPS() below only ever reads IP-based geolocation
// (via GEOLOCATION_API_URL) or the browser's language/locale.

export const GEOLOCATION_API_URL =
  process.env.NEXT_PUBLIC_GEOLOCATION_API_URL || "https://ipapi.co/json/";

export const COUNTRY_DETECTION_TIMEOUT_MS = 2500;

export const COUNTRIES = [
  "Afganistán", "Albania", "Alemania", "Andorra", "Angola", "Arabia Saudita", "Argelia", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaiyán", "Bahamas", "Bangladés", "Barbados", "Baréin", "Bélgica", "Belice", "Benín", "Bielorrusia",
  "Birmania", "Bolivia", "Bosnia y Herzegovina", "Botsuana", "Brasil", "Brunéi", "Bulgaria", "Burkina Faso", "Burundi", "Bután",
  "Cabo Verde", "Camboya", "Camerún", "Canadá", "Catar", "Chad", "Chile", "China", "Chipre", "Colombia",
  "Comoras", "Corea del Norte", "Corea del Sur", "Costa de Marfil", "Costa Rica", "Croacia", "Cuba", "Dinamarca", "Dominica", "Ecuador",
  "Egipto", "El Salvador", "Emiratos Árabes Unidos", "Eritrea", "Eslovaquia", "Eslovenia", "España", "Estados Unidos", "Estonia", "Esuatini",
  "Etiopía", "Filipinas", "Finlandia", "Fiyi", "Francia", "Gabón", "Gambia", "Georgia", "Ghana", "Grecia",
  "Guatemala", "Guinea", "Guinea-Bisáu", "Guinea Ecuatorial", "Guyana", "Haití", "Honduras", "Hungría", "India", "Indonesia",
  "Irak", "Irán", "Irlanda", "Islandia", "Islas Marshall", "Islas Salomón", "Israel", "Italia", "Jamaica", "Japón",
  "Jordania", "Kazajistán", "Kenia", "Kirguistán", "Kiribati", "Kuwait", "Laos", "Lesoto", "Letonia", "Líbano",
  "Liberia", "Libia", "Liechtenstein", "Lituania", "Luxemburgo", "Macedonia del Norte", "Madagascar", "Malasia", "Malaui", "Maldivas",
  "Malí", "Malta", "Marruecos", "Mauricio", "Mauritania", "México", "Micronesia", "Moldavia", "Mónaco", "Mongolia",
  "Montenegro", "Mozambique", "Namibia", "Nauru", "Nepal", "Nicaragua", "Níger", "Nigeria", "Noruega", "Nueva Zelanda",
  "Omán", "Países Bajos", "Pakistán", "Palaos", "Panamá", "Papúa Nueva Guinea", "Paraguay", "Perú", "Polonia", "Portugal",
  "Reino Unido", "República Centroafricana", "República Checa", "República del Congo", "República Democrática del Congo", "República Dominicana", "Ruanda", "Rumanía", "Rusia", "Samoa",
  "San Cristóbal y Nieves", "San Marino", "San Vicente y las Granadinas", "Santa Lucía", "Santo Tomé y Príncipe", "Senegal", "Serbia", "Seychelles", "Sierra Leona", "Singapur",
  "Siria", "Somalia", "Sri Lanka", "Sudáfrica", "Sudán", "Sudán del Sur", "Suecia", "Suiza", "Surinam", "Tailandia",
  "Tanzania", "Tayikistán", "Timor Oriental", "Togo", "Tonga", "Trinidad y Tobago", "Túnez", "Turkmenistán", "Turquía", "Tuvalu",
  "Ucrania", "Uganda", "Uruguay", "Uzbekistán", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Yibuti", "Zambia", "Zimbabue",
];

export const COUNTRY_ALIASES = {
  "united states": "Estados Unidos",
  "united kingdom": "Reino Unido",
  "czechia": "República Checa",
  "south korea": "Corea del Sur",
  "north korea": "Corea del Norte",
  "ivory coast": "Costa de Marfil",
  "russian federation": "Rusia",
  "uae": "Emiratos Árabes Unidos",
  "turkiye": "Turquía",
};

// Canonical country value stored/sent to the backend stays in Spanish (see
// COUNTRIES above) so we never break existing saved data. This map only
// links each canonical value to its ISO 3166-1 alpha-2 code so a visible
// label can be translated to the active MeetYouLive language (ES/EN/PT)
// without touching the underlying value.
export const COUNTRY_ISO_CODES = {
  "Afganistán": "AF", "Albania": "AL", "Alemania": "DE", "Andorra": "AD", "Angola": "AO",
  "Arabia Saudita": "SA", "Argelia": "DZ", "Argentina": "AR", "Armenia": "AM", "Australia": "AU",
  "Austria": "AT", "Azerbaiyán": "AZ", "Bahamas": "BS", "Bangladés": "BD", "Barbados": "BB",
  "Baréin": "BH", "Bélgica": "BE", "Belice": "BZ", "Benín": "BJ", "Bielorrusia": "BY",
  "Birmania": "MM", "Bolivia": "BO", "Bosnia y Herzegovina": "BA", "Botsuana": "BW", "Brasil": "BR",
  "Brunéi": "BN", "Bulgaria": "BG", "Burkina Faso": "BF", "Burundi": "BI", "Bután": "BT",
  "Cabo Verde": "CV", "Camboya": "KH", "Camerún": "CM", "Canadá": "CA", "Catar": "QA",
  "Chad": "TD", "Chile": "CL", "China": "CN", "Chipre": "CY", "Colombia": "CO",
  "Comoras": "KM", "Corea del Norte": "KP", "Corea del Sur": "KR", "Costa de Marfil": "CI", "Costa Rica": "CR",
  "Croacia": "HR", "Cuba": "CU", "Dinamarca": "DK", "Dominica": "DM", "Ecuador": "EC",
  "Egipto": "EG", "El Salvador": "SV", "Emiratos Árabes Unidos": "AE", "Eritrea": "ER", "Eslovaquia": "SK",
  "Eslovenia": "SI", "España": "ES", "Estados Unidos": "US", "Estonia": "EE", "Esuatini": "SZ",
  "Etiopía": "ET", "Filipinas": "PH", "Finlandia": "FI", "Fiyi": "FJ", "Francia": "FR",
  "Gabón": "GA", "Gambia": "GM", "Georgia": "GE", "Ghana": "GH", "Grecia": "GR",
  "Guatemala": "GT", "Guinea": "GN", "Guinea-Bisáu": "GW", "Guinea Ecuatorial": "GQ", "Guyana": "GY",
  "Haití": "HT", "Honduras": "HN", "Hungría": "HU", "India": "IN", "Indonesia": "ID",
  "Irak": "IQ", "Irán": "IR", "Irlanda": "IE", "Islandia": "IS", "Islas Marshall": "MH",
  "Islas Salomón": "SB", "Israel": "IL", "Italia": "IT", "Jamaica": "JM", "Japón": "JP",
  "Jordania": "JO", "Kazajistán": "KZ", "Kenia": "KE", "Kirguistán": "KG", "Kiribati": "KI",
  "Kuwait": "KW", "Laos": "LA", "Lesoto": "LS", "Letonia": "LV", "Líbano": "LB",
  "Liberia": "LR", "Libia": "LY", "Liechtenstein": "LI", "Lituania": "LT", "Luxemburgo": "LU",
  "Macedonia del Norte": "MK", "Madagascar": "MG", "Malasia": "MY", "Malaui": "MW", "Maldivas": "MV",
  "Malí": "ML", "Malta": "MT", "Marruecos": "MA", "Mauricio": "MU", "Mauritania": "MR",
  "México": "MX", "Micronesia": "FM", "Moldavia": "MD", "Mónaco": "MC", "Mongolia": "MN",
  "Montenegro": "ME", "Mozambique": "MZ", "Namibia": "NA", "Nauru": "NR", "Nepal": "NP",
  "Nicaragua": "NI", "Níger": "NE", "Nigeria": "NG", "Noruega": "NO", "Nueva Zelanda": "NZ",
  "Omán": "OM", "Países Bajos": "NL", "Pakistán": "PK", "Palaos": "PW", "Panamá": "PA",
  "Papúa Nueva Guinea": "PG", "Paraguay": "PY", "Perú": "PE", "Polonia": "PL", "Portugal": "PT",
  "Reino Unido": "GB", "República Centroafricana": "CF", "República Checa": "CZ", "República del Congo": "CG", "República Democrática del Congo": "CD",
  "República Dominicana": "DO", "Ruanda": "RW", "Rumanía": "RO", "Rusia": "RU", "Samoa": "WS",
  "San Cristóbal y Nieves": "KN", "San Marino": "SM", "San Vicente y las Granadinas": "VC", "Santa Lucía": "LC", "Santo Tomé y Príncipe": "ST",
  "Senegal": "SN", "Serbia": "RS", "Seychelles": "SC", "Sierra Leona": "SL", "Singapur": "SG",
  "Siria": "SY", "Somalia": "SO", "Sri Lanka": "LK", "Sudáfrica": "ZA", "Sudán": "SD",
  "Sudán del Sur": "SS", "Suecia": "SE", "Suiza": "CH", "Surinam": "SR", "Tailandia": "TH",
  "Tanzania": "TZ", "Tayikistán": "TJ", "Timor Oriental": "TL", "Togo": "TG", "Tonga": "TO",
  "Trinidad y Tobago": "TT", "Túnez": "TN", "Turkmenistán": "TM", "Turquía": "TR", "Tuvalu": "TV",
  "Ucrania": "UA", "Uganda": "UG", "Uruguay": "UY", "Uzbekistán": "UZ", "Vanuatu": "VU",
  "Venezuela": "VE", "Vietnam": "VN", "Yemen": "YE", "Yibuti": "DJ", "Zambia": "ZM",
  "Zimbabue": "ZW",
};

// MeetYouLive currently supports es/en/pt in the UI; any other active
// language falls back to Spanish region names (same as the canonical value).
export const COUNTRY_DISPLAY_LOCALE = { es: "es", en: "en", pt: "pt" };

export const normalizeText = (value) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Resolves any free-text/IP/locale country guess to the canonical Spanish
 * value used across the app (COUNTRIES), so the stored/submitted value never
 * changes shape regardless of where it was detected or typed.
 */
export function resolveCountryOption(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  const aliased = COUNTRY_ALIASES[normalized];
  if (aliased) return aliased;

  const exact = COUNTRIES.find((country) => normalizeText(country) === normalized);
  if (exact) return exact;

  return String(value || "").trim();
}

function resolveCountryFromCode(countryCode) {
  if (!countryCode) return "";
  try {
    const displayNames = new Intl.DisplayNames(["es"], { type: "region" });
    return resolveCountryOption(displayNames.of(countryCode.toUpperCase()) || "");
  } catch {
    return "";
  }
}

function fallbackLocaleCountry() {
  try {
    const locale = typeof navigator !== "undefined" ? navigator.language || "" : "";
    const countryCode = locale.includes("-") ? locale.split("-")[1] : "";
    return resolveCountryFromCode(countryCode);
  } catch {
    return "";
  }
}

/**
 * Attempts to resolve the user's country WITHOUT ever using
 * navigator.geolocation (GPS). Tries an IP-based lookup first (bounded by
 * COUNTRY_DETECTION_TIMEOUT_MS), then falls back to the device locale.
 *
 * Returns "" when nothing could be resolved. Callers must only apply the
 * result when the user doesn't already have a saved/selected country, and
 * must never overwrite an existing value or a manual selection.
 */
export async function detectCountryNonGPS() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COUNTRY_DETECTION_TIMEOUT_MS);
    const safeGeoApiUrl = GEOLOCATION_API_URL.startsWith("https://")
      ? GEOLOCATION_API_URL
      : "https://ipapi.co/json/";
    const res = await fetch(safeGeoApiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const ipCountry =
        resolveCountryFromCode(data?.country_code) ||
        resolveCountryOption(data?.country_name || "");

      if (ipCountry) return ipCountry;
    }
  } catch (detectErr) {
    console.warn("Country auto-detection failed:", detectErr);
    // fallback below
  }

  return fallbackLocaleCountry();
}
