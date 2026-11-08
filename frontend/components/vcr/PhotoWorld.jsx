"use client";

import Link from "next/link";
import { io } from "socket.io-client";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken, setToken } from "@/lib/token";
import { getPrimaryProfileImage } from "@/lib/imageHelpers";
import { createVcrPresence } from "@/lib/vcr/presence";
import { createPhotoWorldAdapter } from "@/lib/vcr/photoWorldAdapter";
import { VCR_COUNTRIES } from "@/lib/vcr/countries";
import { getPhotoScene } from "@/lib/vcr/photoWorldScenes";
import styles from "./PhotoWorld.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const ZONES = ["central", "neon", "coast", "park"];

export default function PhotoWorld() {
  const { t } = useLanguage();
  const { data: session, status: authStatus } = useSession();
  const [activeToken, setActiveToken] = useState(null);
  const worldRef = useRef(null);
  const presenceRef = useRef(null);
  const [country, setCountry] = useState("us");
  const [zone, setZone] = useState("central");
  const [presence, setPresence] = useState("solo");
  const [ready, setReady] = useState(false);
  const [instance, setInstance] = useState(null);
  const [peers, setPeers] = useState([]);
  const [peerPhotos, setPeerPhotos] = useState({});
  const [myPhoto, setMyPhoto] = useState(null);
  const [sharePhoto, setSharePhoto] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [safety, setSafety] = useState("");
  const [authError, setAuthError] = useState(false);
  const scene = getPhotoScene(country);

  // Reuse the existing backend JWT handoff for both local and Google logins.
  useEffect(() => {
    const token = getToken() || session?.backendToken;
    if (token) {
      if (!getToken()) setToken(token);
      setActiveToken(token); setAuthError(false);
      return;
    }
    if (authStatus === "loading") return;
    if (authStatus !== "authenticated" || !session?.googleEmail) {
      setAuthError(true);
      return;
    }
    let active = true;
    fetch("/api/auth/backend-token", { method: "POST", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (active && result?.token) { setToken(result.token); setActiveToken(result.token); setAuthError(false); }
        else if (active) setAuthError(true);
      })
      .catch(() => { if (active) setAuthError(true); });
    return () => { active = false; };
  }, [session?.backendToken, session?.googleEmail, authStatus]);

  useEffect(() => {
    const token = activeToken;
    if (!token) return;
    let active = true;
    const adapter = createPhotoWorldAdapter({ onZoneChange: (value) => { if (active) setZone(value); } });
    worldRef.current = adapter;
    const socket = io(`${API_URL || window.location.origin}/vcr`, {
      autoConnect: false,
      auth: (callback) => callback({ token: getToken() }),
      transports: ["websocket", "polling"],
    });
    presenceRef.current = createVcrPresence({
      socket, world: adapter,
      onState: (value) => { if (active) setPresence(value); },
      onPeers: (members) => { if (active) setPeers(members); },
      onInstance: (value) => { if (active) setInstance(value); },
    });
    setReady(true);
    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((profile) => { if (active && profile) setMyPhoto(getPrimaryProfileImage(profile)); })
      .catch(() => {});
    return () => {
      active = false;
      presenceRef.current?.close(); presenceRef.current = null;
      worldRef.current = null;
    };
  }, [activeToken]);

  // Resolve photos ONLY for currently visible, unblocked, server-authorized
  // members who opted into showing their public picture in this World session.
  // No photo URLs travel over the WebSocket. Discard stale responses after travel,
  // blocking, disconnect or leaving the shared World.
  useEffect(() => {
    if (presence !== "online") { setPeerPhotos({}); return; }
    const allowed = peers.filter((peer) => peer.photoConsent === true &&
      /^[a-f\d]{24}$/i.test(String(peer.userId || ""))).slice(0, 16);
    if (!allowed.length) { setPeerPhotos({}); return; }
    const controller = new AbortController();
    let active = true;
    const token = getToken();
    Promise.all(allowed.map(async (peer) => {
      try {
        const response = await fetch(`${API_URL}/api/user/${encodeURIComponent(peer.userId)}/public`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) return [peer.userId, null];
        const profile = await response.json();
        return [peer.userId, getPrimaryProfileImage(profile)];
      } catch { return [peer.userId, null]; }
    })).then((entries) => { if (active) setPeerPhotos(Object.fromEntries(entries.filter(([,url]) => Boolean(url)))); });
    return () => { active = false; controller.abort(); };
  }, [peers, presence]);

  const visit = (id) => {
    if (id === country || !VCR_COUNTRIES.some((place) => place.id === id)) return;
    setPeerPhotos({}); setPeers([]); setCountry(id); setZone("central"); setImageError(false);
    presenceRef.current?.changeCountry(id);
  };
  const goTo = (id) => {
    if (!ZONES.includes(id)) return;
    presenceRef.current?.travel(id, () => setZone(id));
  };
  const leave = () => {
    presenceRef.current?.leave();
    setSharePhoto(false); setPeers([]); setPeerPhotos({});
  };
  const moderate = async (userId, action) => {
    const reason = action === "report" ? window.prompt(t("vcrWorld.reportReason"))?.trim().slice(0, 500) : null;
    if (action === "report" && !reason) return;
    if (!window.confirm(t(`vcrWorld.${action}Confirm`))) return;
    setSafety("");
    try {
      const token = getToken();
      if (!token) throw new Error("Missing session");
      const endpoint = action === "block" ? `users/${encodeURIComponent(userId)}/block` : "report";
      const response = await fetch(`${API_URL}/api/moderation/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(action === "report" ? { body: JSON.stringify({ targetType: "user", targetId: userId, reason }) } : {}),
      });
      if (!response.ok) throw new Error("Moderation unavailable");
      if (action === "block") {
        setPeers((existing) => existing.filter((peer) => peer.userId !== userId));
        setPeerPhotos((existing) => { const next = { ...existing }; delete next[userId]; return next; });
      }
      setSafety(t("vcrWorld.safetySuccess"));
    } catch { setSafety(t("vcrWorld.safetyError")); }
  };

  const onlineOrConnecting = ["online", "connecting", "reconnecting"].includes(presence);
  return (
    <section className={styles.root} aria-label={t("worldPhoto.title")}>
      <div className={styles.stage}>
        {!imageError ? (
          <img key={country} src={scene.imageUrl} alt={t("worldPhoto.sceneAlt").replace("{city}", scene.city)}
            className={styles.backdrop} onError={() => setImageError(true)}/>
        ) : <p className={styles.imageFallback}>{t("worldPhoto.imageUnavailable")}</p>}
        <div className={styles.sceneOverlay}>
          <span className={styles.sceneBadge}>{t("worldPhoto.realPhoto")}</span>
          <div className={styles.destination}>
            <span className={styles.city}>{scene.city}</span>
            <span>{t("vcrWorld.countries." + country)}</span>
          </div>
          <p className={styles.photoNotice}>{t("worldPhoto.notLive")}</p>
        </div>
        <div className={styles.sceneSocial}>
          {presence === "online" && peers.length > 0 ? (
            <div className={styles.people}>
              {peers.slice(0, 16).map((peer) => (
                <div key={peer.userId} className={styles.person}>
                  <div className={styles.personPhoto}>
                    {peer.photoConsent && peerPhotos[peer.userId]
                      ? <img src={peerPhotos[peer.userId]} alt="" loading="lazy"/>
                      : <span aria-hidden="true">{(peer.name || "?").slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <Link href={`/profile/${encodeURIComponent(peer.userId)}`} className={styles.personName}>
                    {peer.name || t("vcrWorld.visitor")}
                  </Link>
                  <div className={styles.personActions}>
                    <button onClick={() => moderate(peer.userId, "block")} type="button">{t("vcrWorld.block")}</button>
                    <button onClick={() => moderate(peer.userId, "report")} type="button">{t("vcrWorld.report")}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyPeople}>{presence === "online"
              ? t("worldPhoto.noOtherVisitors")
              : t("worldPhoto.exploreSolo")}</p>
          )}
        </div>
      </div>
      <p className={styles.credit}>
        {t("worldPhoto.creditPrefix")} <a href={scene.sourceUrl} target="_blank" rel="noreferrer">{scene.author}</a>
        {" · "}<a href={scene.licenseUrl} target="_blank" rel="noreferrer">{scene.license}</a>
        {" · "}{t("worldPhoto.cropped")}
      </p>

      <div className={styles.panel}>
        <h2>{t("vcrWorld.chooseCountry")}</h2>
        <div className={styles.countryGrid} role="group" aria-label={t("vcrWorld.chooseCountry")}>
          {VCR_COUNTRIES.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={country === entry.id}
              className={country === entry.id ? styles.countryActive : styles.countryButton}
              onClick={() => visit(entry.id)}>
              <span aria-hidden="true">{entry.emoji}</span>{t("vcrWorld.countries." + entry.id)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <h2>{t("worldPhoto.zoneTitle")}</h2>
        <div className={styles.zoneGrid}>
          {ZONES.map((id) => <button type="button" key={id} aria-pressed={zone === id}
            className={zone === id ? styles.zoneActive : styles.zoneButton}
            onClick={() => goTo(id)}>{t("vcrWorld.zones." + id)}</button>)}
        </div>
        <p className={styles.note}>{t("worldPhoto.zoneHelp")}</p>
      </div>

      <div className={styles.panel}>
        <h2>{t("worldPhoto.identityTitle")}</h2>
        <div className={styles.identityRow}>
          {myPhoto
            ? <img className={styles.selfPhoto} src={myPhoto} alt={t("worldPhoto.myPhoto")}/>
            : <span className={styles.selfPlaceholder} aria-hidden="true">◉</span>}
          <p>{myPhoto ? t("worldPhoto.identityActual") : t("worldPhoto.noProfilePhoto")}</p>
        </div>
        <label className={styles.consent}>
          <input type="checkbox" checked={sharePhoto} disabled={onlineOrConnecting || !myPhoto}
            onChange={(event) => setSharePhoto(event.target.checked)}/>
          <span>{t("worldPhoto.photoConsent")}</span>
        </label>
        <p className={styles.note}>{t("worldPhoto.notAiYet")}</p>
        <p className={styles.connection} role="status">{t("vcrWorld.connection." + presence)}</p>
        {authError && <p role="alert">{t("worldPhoto.noSession")}</p>}
        {onlineOrConnecting
          ? <button type="button" className={styles.leave} onClick={leave}>{t("vcrWorld.leave")}</button>
          : <button type="button" className={styles.enter} disabled={!ready || authError}
              onClick={() => presenceRef.current?.join(country, "violet", sharePhoto)}>
              {t("vcrWorld.start")}
            </button>}
        {instance && <p className={styles.note}>{t("vcrWorld.instance")}: {String(instance).slice(-8)}</p>}
        {presence === "online" && <p className={styles.note}>{t("vcrWorld.present").replace("{count}", String(peers.length))}</p>}
        {safety && <p role="status">{safety}</p>}
        <p className={styles.note}>{t("worldPhoto.serverNotice")}</p>
      </div>
    </section>
  );
}
