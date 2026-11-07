import { resolveCountryFromCode, resolveCountryOption } from "./countryDetection.js";

export function normalizeGpsPlace(data) {
  if (data?.found !== true) return null;
  const country = resolveCountryFromCode(data.countryCode) || resolveCountryOption(data.country);
  if (!country) return null;
  const clean = (value) => typeof value === "string" ? value.trim().slice(0, 80) : "";
  return { country, city: clean(data.city), region: clean(data.region) };
}
