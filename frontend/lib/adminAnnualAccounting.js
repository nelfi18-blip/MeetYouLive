import { getYearOptions } from "./adminAccounting.js";

const MIN_REPORT_YEAR = 2020;
const MONTH_KEYS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function getAnnualYearOptions(currentYear) {
  const base = Math.min(2100, Math.max(MIN_REPORT_YEAR, currentYear));
  return getYearOptions(base, base - MIN_REPORT_YEAR);
}

export function getAnnualSourceStatus(source) {
  if (!source || source.status === "unavailable") return "unavailable";
  if (source.status === "partial") return "partial";
  if (source.status === "complete") return "complete";
  return "unavailable";
}

export function getAnnualCoverage(source) {
  const coverage = source?.coverage || source;
  const monthList = (key) =>
    Array.isArray(coverage?.[key])
      ? coverage[key].filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
      : null;

  return {
    status: getAnnualSourceStatus(source),
    completeMonths: monthList("completeMonths"),
    partialMonths: monthList("partialMonths"),
    missingMonths: monthList("missingMonths"),
  };
}

export function getAnnualCurrencyEntries(source) {
  if (getAnnualSourceStatus(source) === "unavailable") return [];
  const entries = source?.byCurrency;
  return entries && typeof entries === "object" && !Array.isArray(entries) ? Object.entries(entries) : [];
}

export function getAnnualMonthRows(months) {
  const byMonth = new Map(
    (Array.isArray(months) ? months : [])
      .filter((entry) => Number.isInteger(entry?.month) && entry.month >= 1 && entry.month <= 12)
      .map((entry) => [entry.month, entry])
  );

  return MONTH_KEYS.map((key, index) => {
    const month = index + 1;
    const entry = byMonth.get(month);
    const status = ["complete", "partial", "unavailable"].includes(entry?.status)
      ? entry.status
      : "unavailable";

    return {
      month,
      key,
      status,
      warnings: Array.isArray(entry?.warnings) ? entry.warnings : [],
    };
  });
}
