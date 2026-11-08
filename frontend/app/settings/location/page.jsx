"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { COUNTRIES } from "@/lib/countryDetection";
import { resolveAndroidGpsPlace } from "@/lib/androidGpsPlace";
import { getToken, setToken } from "@/lib/token";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SCOPES = ["nearby", "country", "global"];

function isValidCoordinates(user) {
  const coordinates = user?.location?.coordinates ?? user?.locationPoint?.coordinates;
  if (Array.isArray(coordinates)) {
    return coordinates.length === 2 && coordinates.every((n) => n !== null && n !== "" && Number.isFinite(Number(n)));
  }
  return coordinates && typeof coordinates === "object" &&
    Number.isFinite(Number(coordinates.lat)) && Number.isFinite(Number(coordinates.lng)) &&
    coordinates.lat != null && coordinates.lng != null;
}

function physicalLocation(user) {
  const location = user?.location && typeof user.location === "object" ? user.location : {};
  return [location.city, location.region, location.country].filter(Boolean).join(", ") ||
    user?.locationLabel || "";
}

function initialSettings(user) {
  const prefs = user?.discoveryPreferences || {};
  const distance = user?.maxDistanceKm ?? prefs.maxDistanceKm;
  return {
    scope: SCOPES.includes(user?.discoveryScope || prefs.discoveryScope)
      ? (user.discoveryScope || prefs.discoveryScope) : "global",
    country: prefs.searchCountry || "",
    city: prefs.searchCity || "",
    region: prefs.searchRegion || "",
    distance: distance > 0 ? String(distance) : "25",
  };
}

export default function DiscoveryLocationSettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const [fallbackToken, setFallbackToken] = useState(null);
  const token = getToken() || session?.backendToken || fallbackToken;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [hasGps, setHasGps] = useState(false);
  const [physical, setPhysical] = useState("");
  const [form, setForm] = useState({ scope: "global", country: "", city: "", region: "", distance: "25" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Same existing Google/backend-JWT handoff as Profile; no auth logic changes.
  useEffect(() => {
    if (status !== "authenticated" || token || !session?.googleEmail) return;
    let active = true;
    fetch("/api/auth/backend-token", { method: "POST", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.token) {
          setToken(data.token);
          setFallbackToken(data.token);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [status, token, session?.googleEmail]);

  useEffect(() => {
    if (status === "loading") return;
    if (!token) {
      if (status === "unauthenticated") router.replace("/login");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((user) => {
        setForm(initialSettings(user));
        setPhysical(physicalLocation(user));
        setHasGps(Boolean(isValidCoordinates(user)));
      })
      .catch(() => { if (!controller.signal.aborted) setError(t("settingsLocation.loadError")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, status, router, t]);

  const savePreferences = async (event) => {
    event.preventDefault();
    if (!token || saving || locating) return;
    setError("");
    setNotice("");
    if (form.scope === "country" && !form.country) {
      setError(t("settingsLocation.countryRequired"));
      return;
    }
    if (form.scope === "nearby" && !hasGps) {
      setError(t("settingsLocation.gpsRequired"));
      return;
    }
    const distance = Number(form.distance);
    if (!Number.isInteger(distance) || distance < 1 || distance > 10000) {
      setError(t("settingsLocation.distanceInvalid"));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          discoveryScope: form.scope,
          maxDistanceKm: distance,
          discoveryPreferences: {
            discoveryScope: form.scope,
            maxDistanceKm: distance,
            searchCountry: form.country,
            searchCity: form.city,
            searchRegion: form.region,
          },
        }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const saved = await response.json();
      setForm(initialSettings(saved));
      setNotice(t("settingsLocation.saved"));
    } catch {
      setError(t("settingsLocation.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const useCurrentGps = async () => {
    if (!token || locating || saving) return;
    setError("");
    setNotice("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(t("settingsLocation.gpsUnavailable"));
      return;
    }
    setLocating(true);
    try {
      // Only after this button: foreground GPS, no background tracking.
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 12000, maximumAge: 0,
        });
      });
      const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng) ||
        Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180) throw new Error("gps-unavailable");
      const place = await resolveAndroidGpsPlace(coords);
      const location = {
        country: place?.country || "", city: place?.city || "", region: place?.region || "",
        coordinates: coords,
      };
      const locationLabel = [location.city, location.region, location.country].filter(Boolean).join(", ");
      const distance = Number(form.distance);
      const maxDistanceKm = Number.isInteger(distance) && distance >= 1 && distance <= 10000 ? distance : 25;
      const response = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          location, locationLabel,
          discoveryScope: "nearby",
          maxDistanceKm,
          discoveryPreferences: { discoveryScope: "nearby", maxDistanceKm },
        }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("save-failed");
      const saved = await response.json();
      setPhysical(physicalLocation(saved));
      setHasGps(true);
      setForm((previous) => ({ ...previous, scope: "nearby", distance: String(maxDistanceKm) }));
      setNotice(place?.city ? t("settingsLocation.gpsUpdated") : t("settingsLocation.gpsCityUnavailable"));
    } catch (err) {
      setError(err?.code === 1 ? t("settingsLocation.permissionDenied") : t("settingsLocation.gpsUnavailable"));
    } finally {
      setLocating(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/settings" className={styles.back}>← {t("settingsLocation.back")}</Link>
        <h1>{t("settingsLocation.title")}</h1>
        <p>{t("settingsLocation.subtitle")}</p>
      </header>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {loading ? <p className={styles.hint}>{t("common.loading")}</p> : (
        <>
          <section className={styles.card}>
            <h2>{t("settingsLocation.actualLocation")}</h2>
            <p className={styles.location}>📍 {physical || t("settingsLocation.unknownLocation")}</p>
            <p className={styles.hint}>{t("settingsLocation.actualDescription")}</p>
            <button type="button" className={styles.primaryButton} onClick={useCurrentGps}
              disabled={locating || saving || !token}>
              {locating ? t("settingsLocation.detecting") : t("settingsLocation.currentGps")}
            </button>
          </section>

          <form onSubmit={savePreferences}>
            <section className={styles.card}>
              <h2>{t("settingsLocation.searchMode")}</h2>
              <div className={styles.scopeGrid}>
                {SCOPES.map((scope) => (
                  <button type="button" key={scope}
                    className={form.scope === scope ? styles.scopeActive : styles.scope}
                    onClick={() => { setNotice(""); setForm((previous) => ({ ...previous, scope })); }}
                    aria-pressed={form.scope === scope}>
                    {t(`settingsLocation.${scope}`)}
                  </button>
                ))}
              </div>
              <p className={styles.hint}>{t(`settingsLocation.${form.scope}Hint`)}</p>
            </section>

            {form.scope === "country" && (
              <section className={styles.card}>
                <h2>{t("settingsLocation.remoteTitle")}</h2>
                <p className={styles.hint}>{t("settingsLocation.remoteDescription")}</p>
                <label htmlFor="search-country">{t("settingsLocation.countryLabel")}</label>
                <select id="search-country" className={styles.input} value={form.country}
                  onChange={(e) => setForm((previous) => ({
                    ...previous, country: e.target.value, city: "", region: "",
                  }))}>
                  <option value="">{t("settingsLocation.chooseCountry")}</option>
                  {COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                </select>
                <label htmlFor="search-city">{t("settingsLocation.city")}</label>
                <input id="search-city" className={styles.input} maxLength={80}
                  value={form.city} disabled={!form.country}
                  onChange={(e) => setForm((previous) => ({ ...previous, city: e.target.value, region: "" }))}
                  placeholder={t("settingsLocation.cityPlaceholder")}/>
                <label htmlFor="search-region">{t("settingsLocation.region")}</label>
                <input id="search-region" className={styles.input} maxLength={80}
                  value={form.region} disabled={!form.city}
                  onChange={(e) => setForm((previous) => ({ ...previous, region: e.target.value }))}
                  placeholder={t("settingsLocation.regionPlaceholder")}/>
                <p className={styles.hint}>{t("settingsLocation.cityOptional")}</p>
              </section>
            )}

            {form.scope === "nearby" && (
              <section className={styles.card}>
                <h2>{t("settingsLocation.maxDistance")}</h2>
                <div className={styles.distanceRow}>
                  <input id="discovery-distance" className={styles.input} type="number" min="1" max="10000"
                    value={form.distance}
                    onChange={(e) => setForm((previous) => ({ ...previous, distance: e.target.value }))}/>
                  <label htmlFor="discovery-distance">km</label>
                </div>
                <p className={styles.hint}>{hasGps ? t("settingsLocation.distanceHint") : t("settingsLocation.gpsRequired")}</p>
              </section>
            )}

            <div className={styles.actions}>
              <button className={styles.primaryButton} type="submit" disabled={!token || saving || locating}>
                {saving ? t("settingsLocation.saving") : t("settingsLocation.save")}
              </button>
              <Link href="/explore" className={styles.secondaryButton}>{t("settingsLocation.openDiscovery")}</Link>
            </div>
          </form>
          <p className={styles.footerNote}>{t("settingsLocation.liveGlobal")}</p>
        </>
      )}
    </main>
  );
}
