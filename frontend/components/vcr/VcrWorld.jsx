"use client";

import Link from "next/link";
import { io } from "socket.io-client";
import { getToken } from "@/lib/token";
import { createVcrPresence } from "@/lib/vcr/presence";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { VCR_DISTRICTS } from "@/lib/vcr/districtWorld";
import { VCR_COUNTRIES } from "@/lib/vcr/countries";
import styles from "@/app/vcr/vcr.module.css";

const OUTFIT_COLORS = [
  { id: "violet", hex: "#985cff" },
  { id: "cyan", hex: "#16c8da" },
  { id: "pink", hex: "#ef58a9" },
];

export default function VcrWorld() {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const presenceRef = useRef(null);
  const preferenceRef = useRef(null);
  const [presenceStatus, setPresenceStatus] = useState("solo");
  const [peers, setPeers] = useState([]);
  const [instance, setInstance] = useState(null);
  const [safetyStatus, setSafetyStatus] = useState("");
  const [status, setStatus] = useState("loading");
  const [district, setDistrict] = useState("central");
  const [country, setCountry] = useState("us");
  const [outfit, setOutfit] = useState("violet");

  useEffect(() => {
    let cancelled = false;
    // Lazy-load the renderer only after client mounting; never evaluate WebGL
    // on the server or import a shared Live/Agora client into this world.
    Promise.all([
      import("three"),
      import("@/lib/vcr/districtWorld"),
    ]).then(([THREE, module]) => {
      if (cancelled || !canvasRef.current) return;
      worldRef.current = module.createVcrDistrict(THREE, canvasRef.current, {
        onDistrictChange: (id) => { if (!cancelled) setDistrict(id); },
        onCountryChange: (id) => { if (!cancelled) setCountry(id); },
        onContextLost: () => { if (!cancelled) { presenceRef.current?.leave(); setStatus("error"); } },
      });
      const token = getToken();
      let savedOutfit = "violet";
      try {
        // Token decoding selects a local preference key only; the server alone
        // authenticates membership. No photograph or biometric data is accessed.
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (/^[a-f0-9]{24}$/i.test(payload.id)) preferenceRef.current = `vcr:outfit:${payload.id}`;
        const saved = localStorage.getItem(preferenceRef.current);
        if (OUTFIT_COLORS.some((entry) => entry.id === saved)) savedOutfit = saved;
      } catch { /* Local preference storage is optional. */ }
      worldRef.current.setOutfit(savedOutfit); setOutfit(savedOutfit);
      const connection = io(`${process.env.NEXT_PUBLIC_API_URL || window.location.origin}/vcr`, {
        autoConnect: false, auth: (callback) => callback({ token: getToken() }), transports: ["websocket", "polling"],
      });
      presenceRef.current = createVcrPresence({ socket: connection, world: worldRef.current,
        onState: (value) => { if (!cancelled) setPresenceStatus(value); },
        onPeers: (rows) => { if (!cancelled) setPeers(rows); },
        onInstance: (id) => { if (!cancelled) setInstance(id); },
      });
      setStatus("ready");
    }).catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => {
      cancelled = true;
      presenceRef.current?.close();
      presenceRef.current = null;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, []);

  const move = (direction, down) => worldRef.current?.setDirection(direction, down);
  const chooseDistrict = (id) => {
    presenceRef.current?.travel(id, () => setDistrict(id));
  };
  const chooseCountry = (id) => {
    presenceRef.current?.changeCountry(id);
    setDistrict("central");
  };
  const chooseOutfit = (id) => {
    presenceRef.current?.setOutfit(id);
    setOutfit(id);
    try { if (preferenceRef.current) localStorage.setItem(preferenceRef.current, id); } catch { /* Optional local persistence. */ }
  };

  const moderate = async (userId, action) => {
    const reason = action === "report" ? window.prompt(t("vcrWorld.reportReason"))?.trim().slice(0, 500) : null;
    if (action === "report" && !reason) return;
    if (!window.confirm(t(`vcrWorld.${action}Confirm`))) return;
    setSafetyStatus("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/moderation/${action === "block" ? `users/${encodeURIComponent(userId)}/block` : "report"}`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        ...(action === "report" ? { body: JSON.stringify({ targetType: "user", targetId: userId, reason }) } : {}),
      });
      if (!response.ok) throw new Error("Moderation unavailable");
      if (action === "block") {
        const visible = peers.filter((peer) => peer.userId !== userId);
        worldRef.current?.setPeers(visible); setPeers(visible);
      }
      setSafetyStatus(t("vcrWorld.safetySuccess"));
    } catch { setSafetyStatus(t("vcrWorld.safetyError")); }
  };

  const directionButton = (direction, symbol) => (
    <button
      type="button"
      className={styles.moveButton}
      aria-label={t("vcrWorld." + direction)}
      title={t("vcrWorld." + direction)}
      disabled={status !== "ready"}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        move(direction, true);
      }}
      onPointerUp={() => move(direction, false)}
      onPointerCancel={() => move(direction, false)}
      onLostPointerCapture={() => move(direction, false)}
      onBlur={() => move(direction, false)}
    >{symbol}</button>
  );

  return (
    <section className={styles.worldSection} aria-label={t("vcrWorld.sceneLabel")}>
      <div className={styles.viewport}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label={t("vcrWorld.sceneLabel")}
          role="img"
          tabIndex={0}
        />
        <div className={styles.sceneBadge}>{t("vcrWorld.preview")}</div>
        <div className={styles.sceneDistrict}>{t("vcrWorld.countries." + country)}</div>
        {status !== "ready" && (
          <div className={styles.stateCover} role={status === "error" ? "alert" : "status"}>
            <div className={styles.stateIcon} aria-hidden="true">✦</div>
            <p>{t(status === "error" ? "vcrWorld.unsupported" : "vcrWorld.loading")}</p>
            {status === "error" && <button type="button" onClick={() => window.location.reload()}>{t("vcrWorld.retry")}</button>}
          </div>
        )}
        <div className={styles.touchPad} role="group" aria-label={t("vcrWorld.controlTitle")}>
          <span className={styles.padEmpty} />
          {directionButton("forward", "↑")}
          <span className={styles.padEmpty} />
          {directionButton("left", "←")}
          {directionButton("back", "↓")}
          {directionButton("right", "→")}
        </div>
      </div>
      <div className={styles.connectionPanel}>
        <p role="status">{t(`vcrWorld.connection.${presenceStatus}`)}</p>
        <p>{t("vcrWorld.consent")}</p>
        {presenceStatus === "online" || presenceStatus === "reconnecting" || presenceStatus === "connecting" ? (
          <button type="button" className={styles.pill} onClick={() => presenceRef.current?.leave()}>{t("vcrWorld.leave")}</button>
        ) : (
          <button type="button" className={styles.pillActive} disabled={status !== "ready"} onClick={() => presenceRef.current?.join(country, outfit)}>{t("vcrWorld.start")}</button>
        )}
        {instance && <small>{t("vcrWorld.instance")}: {instance.slice(-8)}</small>}
        {presenceStatus === "online" && <p>{t("vcrWorld.present").replace("{count}", String(peers.length))}</p>}
        {peers.length > 0 && <ul className={styles.participants} aria-label={t("vcrWorld.people")}>
          {peers.map((peer) => <li key={peer.userId}>
            <Link href={`/profile/${peer.userId}`}>{peer.name || t("vcrWorld.visitor")}</Link>
            <button type="button" onClick={() => moderate(peer.userId, "block")}>{t("vcrWorld.block")}</button>
            <button type="button" onClick={() => moderate(peer.userId, "report")}>{t("vcrWorld.report")}</button>
          </li>)}
        </ul>}
        {safetyStatus && <p role="status">{safetyStatus}</p>}
      </div>
      <div className={styles.countryTravel}>
        <h2>{t("vcrWorld.chooseCountry")}</h2>
        <p>{t("vcrWorld.countryPreview")}</p>
        <div className={styles.countries} role="group" aria-label={t("vcrWorld.chooseCountry")}>
          {VCR_COUNTRIES.map((entry) => (
            <button key={entry.id} type="button"
              disabled={status !== "ready"}
              className={country === entry.id ? styles.countryActive : styles.countryButton}
              aria-pressed={country === entry.id}
              onClick={() => chooseCountry(entry.id)}
            >
              <span aria-hidden="true">{entry.emoji}</span>
              {t("vcrWorld.countries." + entry.id)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.tools}>
        <div className={styles.toolGroup}>
          <h2>{t("vcrWorld.zonesTitle")}</h2>
          <div className={styles.pills}>
            {VCR_DISTRICTS.map((zone) => (
              <button key={zone.id} type="button"
                disabled={status !== "ready"}
                className={district === zone.id ? styles.pillActive : styles.pill}
                aria-pressed={district === zone.id}
                onClick={() => chooseDistrict(zone.id)}
              >
                {t("vcrWorld.zones." + zone.id)}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.toolGroup}>
          <h2>{t("vcrWorld.avatar")}</h2>
          <div className={styles.pills}>
            {OUTFIT_COLORS.map((color) => (
              <button key={color.id} type="button"
                disabled={status !== "ready"}
                className={outfit === color.id ? styles.pillActive : styles.pill}
                aria-pressed={outfit === color.id}
                onClick={() => chooseOutfit(color.id)}
              >
                <span className={styles.swatch} style={{ backgroundColor: color.hex }} aria-hidden="true" />
                {t("vcrWorld.colors." + color.id)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.hints}>
        <p>{t("vcrWorld.touchHint")}</p>
        <p>{t("vcrWorld.desktopHint")}</p>
        <span>{t("vcrWorld.status")}</span>
      </div>
    </section>
  );
}
