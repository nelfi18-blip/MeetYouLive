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
import { getWorldPanoramaStops } from "@/lib/vcr/realPanoramas";
import WorldPanorama from "./WorldPanorama";
import { validateWorldBodyReference } from "@/lib/vcr/fullBodyPhoto";
import { WORLD_CLOTHING_STYLES, chooseWorldClothingStyle } from "@/lib/vcr/stylePreferences";
import { worldPhotoLookupKey } from "@/lib/vcr/worldPhotoPresence";
import styles from "./PhotoWorld.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const WORLD_TEST_ONLY = process.env.NEXT_PUBLIC_WORLD_TEST_MODE === "isolated";
const ZONES = ["central", "neon", "coast", "park"];
const ZONE_ICONS = { central: "🧭", neon: "✨", coast: "🌊", park: "🌿" };
const ZONE_FOCUS = { central: "50% 50%", neon: "65% 42%", coast: "28% 65%", park: "73% 62%" };
const STYLE_ICONS = { original: "📷", casual: "👕", elegant: "👔", sport: "👟", urban: "🧢" };

export default function PhotoWorld({ onEnterWalk } = {}) {
  const { t } = useLanguage();
  const { data: session, status: authStatus } = useSession();
  const [activeToken, setActiveToken] = useState(null);
  const worldRef = useRef(null);
  const bodyUrlRef = useRef(null);
  const presenceRef = useRef(null);
  const stageRef = useRef(null);
  const [country, setCountry] = useState("us");
  const [zone, setZone] = useState("central");
  const [panoramaStop, setPanoramaStop] = useState(0);
  const [presence, setPresence] = useState("solo");
  const [entered, setEntered] = useState(false);
  const [showDestinations, setShowDestinations] = useState(false);
  const [ready, setReady] = useState(false);
  const [instance, setInstance] = useState(null);
  const [peers, setPeers] = useState([]);
  const [peerPhotos, setPeerPhotos] = useState({});
  const [myPhoto, setMyPhoto] = useState(null);
  const [bodyPreview, setBodyPreview] = useState(null);
  const [showBodyOnStage, setShowBodyOnStage] = useState(false);
  const [bodyError, setBodyError] = useState("");
  const [clothingStyle, setClothingStyle] = useState("original");
  const [sharePhoto, setSharePhoto] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [safety, setSafety] = useState("");
  const [authError, setAuthError] = useState(false);
  const scene = getPhotoScene(country);
  const panoramaStops = getWorldPanoramaStops(country);
  const activePanorama = entered && panoramaStops ? panoramaStops[panoramaStop] : null;
  const stepPanorama = (delta) => {
    if (!panoramaStops || presence !== "online") return;
    setPanoramaStop((current) => Math.max(0, Math.min(panoramaStops.length - 1, current + delta)));
  };

  // A successful server join must actually enter the scene, not just display
  // "connected" on the setup form. Reconnecting preserves the scene; a denied
  // join or deliberate leave returns to the visible retry/setup controls.
  useEffect(() => {
    if (presence === "online") setEntered(true);
    if (presence === "solo" || presence === "error") {
      setEntered(false);
      setShowDestinations(false);
    }
  }, [presence]);
  useEffect(() => {
    if (!entered) return;
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    stageRef.current?.focus({ preventScroll: true });
  }, [entered]);

  // A full-length reference can be previewed locally; no upload and no AI yet.
  // Free the object URL when replaced, removed, or this view is unmounted.
  useEffect(() => () => {
    if (bodyUrlRef.current) URL.revokeObjectURL(bodyUrlRef.current);
    bodyUrlRef.current = null;
  }, []);

  const removeBodyReference = () => {
    if (bodyUrlRef.current) URL.revokeObjectURL(bodyUrlRef.current);
    bodyUrlRef.current = null;
    setBodyPreview(null);
    setShowBodyOnStage(false);
    setBodyError("");
  };
  const chooseBodyReference = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = validateWorldBodyReference(file);
    if (problem) {
      setBodyError(t(problem === "invalidType" ? "worldPhoto.bodyInvalidFormat" : "worldPhoto.bodyInvalidSize"));
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    if (bodyUrlRef.current) URL.revokeObjectURL(bodyUrlRef.current);
    bodyUrlRef.current = nextUrl;
    setBodyPreview(nextUrl);
    setShowBodyOnStage(true);
    setBodyError("");
  };

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
      auth: (callback) => callback({ token: getToken() || token }),
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

  // Socket snapshots arrive ~5 times/second with new array identities.
  // A stable consented-user key prevents aborting/restarting image fetches
  // on every tick. A leave, revocation, block or country change removes images
  // and aborts in-flight requests immediately.
  const photoLookupKey = worldPhotoLookupKey(peers, presence);
  useEffect(() => {
    setPeerPhotos({});
    if (!photoLookupKey || !activeToken) return;
    const ids = photoLookupKey.split(",");
    const controller = new AbortController();
    let active = true;
    Promise.all(ids.map(async (userId) => {
      try {
        const response = await fetch(`${API_URL}/api/user/${encodeURIComponent(userId)}/public`, {
          headers: { Authorization: `Bearer ${activeToken}` },
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) return [userId, null];
        const profile = await response.json();
        return [userId, getPrimaryProfileImage(profile)];
      } catch { return [userId, null]; }
    })).then((entries) => {
      if (active) setPeerPhotos(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
    });
    return () => { active = false; controller.abort(); };
  }, [photoLookupKey, activeToken]);

  const visit = (id) => {
    if (id === country || !VCR_COUNTRIES.some((place) => place.id === id)) return;
    setShowDestinations(false);
    setPanoramaStop(0);
    setPeerPhotos({}); setPeers([]); setCountry(id); setZone("central"); setImageError(false);
    presenceRef.current?.changeCountry(id);
  };
  const goTo = (id) => {
    if (!ZONES.includes(id)) return;
    presenceRef.current?.travel(id, () => setZone(id));
  };
  const leave = () => {
    presenceRef.current?.leave();
    setEntered(false); setShowDestinations(false);
    setPanoramaStop(0);
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

  const enterWorld = () => {
    // On the World page, restore the original real movement engine on entry.
    // Standalone PhotoWorld callers retain the existing authenticated photo mode.
    if (onEnterWalk) onEnterWalk({ initialCountry: country, initialToken: activeToken, sharePhoto });
    else presenceRef.current?.join(country, "violet", sharePhoto);
  };
  const onlineOrConnecting = ["online", "connecting", "reconnecting"].includes(presence);
  return (
    <section className={styles.root} aria-label={t("worldPhoto.title")}>
      <div ref={stageRef} tabIndex={-1}
        aria-label={entered ? t("worldPhoto.insideWorld") : t("worldPhoto.title")}
        className={entered ? `${styles.stage} ${styles.enteredStage}` : styles.stage}>
        {!imageError ? (
          <img key={country} src={scene.imageUrl} alt={t("worldPhoto.sceneAlt").replace("{city}", scene.city)}
            className={styles.backdrop} style={{ objectPosition: ZONE_FOCUS[zone] }} onError={() => setImageError(true)}/>
        ) : <p className={styles.imageFallback}>{t("worldPhoto.imageUnavailable")}</p>}
        {activePanorama && (
          <WorldPanorama key={activePanorama.id} imageUrl={activePanorama.imageUrl}
            label={t("worldPhoto.panoramaLookAround")}
            unavailable={t("worldPhoto.panoramaUnavailable")}
            leftLabel={t("worldPhoto.panoramaTurnLeft")}
            rightLabel={t("worldPhoto.panoramaTurnRight")}
            zoomInLabel={t("worldPhoto.panoramaZoomIn")}
            zoomOutLabel={t("worldPhoto.panoramaZoomOut")} />
        )}
        <div className={styles.sceneOverlay}>
          <span className={styles.sceneBadge}>{activePanorama ? t("worldPhoto.panoramaBadge") : entered ? t("worldPhoto.insideWorld") : t("worldPhoto.realPhoto")}</span>
          <div className={styles.destination}>
            <span className={styles.city}>{scene.city}</span>
            <span>{t("vcrWorld.countries." + country)}</span>
          </div>
          <p className={styles.photoNotice}>{t("worldPhoto.notLive")}</p>
        </div>
        {bodyPreview && showBodyOnStage && (
          <figure className={styles.privateStagePreview}>
            <img src={bodyPreview} alt={t("worldPhoto.bodyPreviewAlt")} />
            <figcaption>{t("worldPhoto.stagePhotoNotice")}</figcaption>
          </figure>
        )}
        {entered && (
          <nav className={styles.insideNav} aria-label={t("worldPhoto.exploreControls")}>
            <div className={styles.insideNavTitle}>
              <strong>{t("worldPhoto.photoExploration")}</strong>
              <span>{panoramaStops ? t("worldPhoto.panoramaBadge") : t("vcrWorld.zones." + zone)}</span>
            </div>
            {!panoramaStops && <div className={styles.insideZoneGrid} role="group" aria-label={t("worldPhoto.zonesShort")}>
              {ZONES.map((id) => (
                <button key={id} type="button" aria-pressed={zone === id}
                  className={zone === id ? styles.insideZoneActive : styles.insideZoneButton}
                  disabled={presence !== "online"} onClick={() => goTo(id)}>
                  <span aria-hidden="true">{ZONE_ICONS[id]}</span>
                  <span>{t("vcrWorld.zones." + id)}</span>
                </button>
              ))}
            </div>}
            <div className={styles.insideActions}>
              <button type="button" aria-expanded={showDestinations} aria-controls="world-travel-menu"
                onClick={() => setShowDestinations((current) => !current)}>
                {t("worldPhoto.changeDestination")}
              </button>
              <button type="button" onClick={leave}>{t("vcrWorld.leave")}</button>
            </div>
            {panoramaStops && <div className={styles.panoramaStopControls}>
              <button type="button" disabled={presence !== "online" || panoramaStop === 0}
                onClick={() => stepPanorama(-1)} aria-label={t("worldPhoto.panoramaPreviousStop")}>←</button>
              <div className={styles.panoramaStopInfo}>
                <strong>{t("worldPhoto.panoramaStopCount")
                  .replace("{current}", String(panoramaStop + 1))
                  .replace("{total}", String(panoramaStops.length))}</strong>
                <small>{t("worldPhoto.panoramaLookTip")}</small>
              </div>
              <button type="button" disabled={presence !== "online" || panoramaStop >= panoramaStops.length - 1}
                onClick={() => stepPanorama(1)} aria-label={t("worldPhoto.panoramaNextStop")}>→</button>
            </div>}
            <p className={styles.insideDisclaimer}>{panoramaStops
              ? t("worldPhoto.panoramaNotWalking")
              : t("worldPhoto.photoOnlyNavigation")}</p>
          </nav>
        )}
        {entered && showDestinations && (
          <div className={styles.insideTravelMenu} id="world-travel-menu"
            role="group" aria-label={t("worldPhoto.destinationsShort")}>
            <div className={styles.insideTravelHeading}>
              <strong>{t("worldPhoto.destinationsShort")}</strong>
              <button type="button" onClick={() => setShowDestinations(false)}
                aria-label={t("worldPhoto.closeDestinations")}>✕</button>
            </div>
            <div className={styles.insideTravelGrid}>
              {VCR_COUNTRIES.map((entry) => {
                const photo = getPhotoScene(entry.id);
                return (
                  <button key={entry.id} type="button" aria-pressed={country === entry.id}
                    disabled={presence !== "online"} onClick={() => visit(entry.id)}>
                    <img src={photo.thumbnailUrl} alt="" loading="lazy" />
                    <span>{entry.emoji} {photo.city}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className={styles.sceneSocial}>
          {!entered && <div className={styles.stageControls}>
            <span className={styles.statusPill} role="status">
              <span aria-hidden="true" className={presence === "online" ? styles.liveDot : styles.offlineDot} />
              {t("vcrWorld.connection." + presence)}
            </span>
            {onlineOrConnecting
              ? <button type="button" className={styles.leave} onClick={leave}>{t("vcrWorld.leave")}</button>
              : <button type="button" className={styles.enter} disabled={!ready || authError}
                  onClick={enterWorld}>
                  {presence === "error" ? t("worldPhoto.retryEnter") : t("vcrWorld.start")}
                </button>}
          </div>}
          {entered && <div className={styles.enteredStatus} role="status">
            {t("vcrWorld.connection." + presence)}
            {presence === "online" && <span> · {t("worldPhoto.visitorCount").replace("{count}", String(peers.length))}</span>}
          </div>}
          {presence === "error" && <p className={styles.stageError} role="alert">{t("worldPhoto.connectionError")}</p>}
          {authError && <p className={styles.stageError} role="alert">{t("worldPhoto.noSession")}</p>}
          {presence === "online" && peers.length > 0 ? (
            <div className={styles.people}>
              {peers.slice(0, 16).map((peer) => (
                <div key={peer.userId} className={styles.person}>
                  <div className={styles.personPhoto}>
                    {peer.photoConsent && peerPhotos[peer.userId]
                      ? <img src={peerPhotos[peer.userId]} alt="" loading="lazy"/>
                      : <span aria-hidden="true">{(peer.name || "?").slice(0, 1).toUpperCase()}</span>}
                  </div>
                  {WORLD_TEST_ONLY ? (
                    <span className={styles.personName}>{peer.name || t("vcrWorld.visitor")}</span>
                  ) : (
                    <Link href={`/profile/${encodeURIComponent(peer.userId)}`} className={styles.personName}>
                      {peer.name || t("vcrWorld.visitor")}
                    </Link>
                  )}
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
        {t("worldPhoto.creditPrefix")} <a href={activePanorama?.sourceUrl || scene.sourceUrl}
          target="_blank" rel="noreferrer">{activePanorama?.author || scene.author}</a>
        {" · "}<a href={activePanorama?.licenseUrl || scene.licenseUrl}
          target="_blank" rel="noreferrer">{activePanorama?.license || scene.license}</a>
        {" · "}{activePanorama ? t("worldPhoto.panoramaAttribution") : t("worldPhoto.cropped")}
      </p>

      {!entered && <div className={styles.panel}>
        <h2>{t("worldPhoto.destinationsShort")}</h2>
        <div className={styles.countryGrid} role="group" aria-label={t("vcrWorld.chooseCountry")}>
          {VCR_COUNTRIES.map((entry) => {
            const photo = getPhotoScene(entry.id);
            return (
              <button key={entry.id} type="button" aria-pressed={country === entry.id}
                className={country === entry.id ? styles.countryActive : styles.countryButton}
                onClick={() => visit(entry.id)} aria-label={t("vcrWorld.countries." + entry.id)}>
                <img className={styles.countryThumb} src={photo.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                <span className={styles.countryMeta}>
                  <span className={styles.countryFlag} aria-hidden="true">{entry.emoji}</span>
                  <span className={styles.countryCopy}><strong>{photo.city}</strong><small>{t("vcrWorld.countries." + entry.id)}</small></span>
                  {country === entry.id && <span className={styles.countryCheck} aria-hidden="true">✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>}

      {!entered && <div className={styles.panel}>
        <h2>{t("worldPhoto.zonesShort")}</h2>
        <div className={styles.zoneGrid}>
          {ZONES.map((id) => <button type="button" key={id} aria-pressed={zone === id}
            className={zone === id ? styles.zoneActive : styles.zoneButton}
            onClick={() => goTo(id)}><span aria-hidden="true">{ZONE_ICONS[id]}</span>{t("vcrWorld.zones." + id)}</button>)}
        </div>
        <details className={styles.infoDisclosure}><summary>{t("worldPhoto.zoneInfo")}</summary>
          <p>{t("worldPhoto.zoneHelp")}</p>
        </details>
      </div>}

      {!entered && <div className={styles.panel}>
        <h2>{t("worldPhoto.identityTitle")}</h2>
        <div className={styles.identityRow}>
          {myPhoto
            ? <img className={styles.selfPhoto} src={myPhoto} alt={t("worldPhoto.myPhoto")}/>
            : <span className={styles.selfPlaceholder} aria-hidden="true">◉</span>}
          <div className={styles.identityText}>
            <strong>{myPhoto ? t("worldPhoto.profilePublic") : t("worldPhoto.noProfilePhoto")}</strong>
            {WORLD_TEST_ONLY && <small>{t("worldPhoto.testIdentity")}</small>}
          </div>
        </div>
        <label className={styles.consent}>
          <input type="checkbox" checked={sharePhoto} disabled={onlineOrConnecting || !myPhoto}
            onChange={(event) => setSharePhoto(event.target.checked)}/>
          <span>{t("worldPhoto.photoConsentShort")}</span>
        </label>
        <details className={styles.infoDisclosure}>
          <summary>{t("worldPhoto.consentInfo")}</summary>
          <p>{t("worldPhoto.photoConsent")}</p>
          <p>{t("worldPhoto.identityActual")}</p>
        </details>
        <div className={styles.bodyReference}>
          <h3>{t("worldPhoto.bodyTitle")}</h3>
          <details className={styles.infoDisclosure}><summary>{t("worldPhoto.photoTips")}</summary>
            <p>{t("worldPhoto.bodyDescription")}</p>
          </details>
          <label className={styles.bodyPicker} htmlFor="world-body-reference">{t("worldPhoto.bodyChoose")}</label>
          <input id="world-body-reference" className={styles.bodyInput} type="file"
            accept="image/jpeg,image/png,image/webp" onChange={chooseBodyReference}/>
          {bodyError && <p role="alert" className={styles.bodyError}>{bodyError}</p>}
          {bodyPreview && (
            <>
              <div className={styles.bodyPreview}>
                <img src={bodyPreview} alt={t("worldPhoto.bodyPreviewAlt")}/>
                <button type="button" onClick={removeBodyReference} className={styles.bodyRemove}>
                  {t("worldPhoto.bodyRemove")}
                </button>
              </div>
              <label className={styles.stagePreviewToggle}>
                <input type="checkbox" checked={showBodyOnStage}
                  onChange={(event) => setShowBodyOnStage(event.target.checked)} />
                <span>{t("worldPhoto.stagePhotoToggle")}</span>
              </label>
            </>
          )}
          <p className={styles.bodyPrivacy}>{t("worldPhoto.privateShort")}</p>
          <details className={styles.infoDisclosure}><summary>{t("worldPhoto.privacyInfo")}</summary>
            <p>{t("worldPhoto.bodyPrivacy")}</p>
          </details>
        </div>
        <div className={styles.stylePreferences}>
          <h3>{t("worldPhoto.styleTitle")}</h3>
          <p className={styles.styleHint}>{t("worldPhoto.stylePendingShort")}</p>
          <div className={styles.styleOptions} role="group" aria-label={t("worldPhoto.styleTitle")}>
            {WORLD_CLOTHING_STYLES.map((style) => (
              <button key={style} type="button" aria-pressed={clothingStyle === style}
                className={clothingStyle === style ? styles.styleActive : styles.styleButton}
                onClick={() => setClothingStyle(chooseWorldClothingStyle(style))}>
                <span aria-hidden="true">{STYLE_ICONS[style]}</span>{t("worldPhoto.style." + style)}
              </button>
            ))}
          </div>
          <details className={styles.infoDisclosure}><summary>{t("worldPhoto.identityPolicy")}</summary>
            <p className={styles.identityRule}>{t("worldPhoto.bodyIntegrity")}</p>
            <p>{t("worldPhoto.styleDescription")}</p>
            <p>{t("worldPhoto.styleNotRendered")}</p>
          </details>
        </div>
        <details className={styles.infoDisclosure}>
          <summary>{t("worldPhoto.worldInfo")}</summary>
          <p>{t("worldPhoto.notAiYet")}</p>
          <p>{t("worldPhoto.serverNotice")}</p>
          {instance && <p>{t("vcrWorld.instance")}: {String(instance).slice(-8)}</p>}
          {presence === "online" && <p>{t("vcrWorld.present").replace("{count}", String(peers.length))}</p>}
        </details>
        {safety && <p role="status">{safety}</p>}
      </div>}
      {entered && safety && <p className={styles.insideSafety} role="status">{safety}</p>}
    </section>
  );
}
