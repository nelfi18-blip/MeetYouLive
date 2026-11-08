"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken } from "@/lib/token";
import { createVcrPresence } from "@/lib/vcr/presence";
import { VCR_COUNTRIES } from "@/lib/vcr/countries";
import styles from "./WalkableWorld.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Separate walkable prototype uses the EXISTING authoritative World protocol.
// Photographic scenes and the full-body photo remain in PhotoWorld untouched.
// First-person mode avoids impersonating the member with a made-up 3D body.
export default function WalkableWorld({ initialCountry = "us", initialToken, sharePhoto = false, onExit }) {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const presenceRef = useRef(null);
  const [renderStatus, setRenderStatus] = useState("loading");
  const [presence, setPresence] = useState("connecting");
  const [country, setCountry] = useState(initialCountry);
  const [peers, setPeers] = useState([]);
  const [instance, setInstance] = useState(null);
  const [showCountries, setShowCountries] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getToken() || initialToken;
    if (!token) {
      setRenderStatus("error");
      setPresence("error");
      return undefined;
    }
    Promise.all([import("three"), import("@/lib/vcr/districtWorld")])
      .then(([THREE, module]) => {
        if (cancelled || !canvasRef.current) return;
        const world = module.createVcrDistrict(THREE, canvasRef.current, {
          firstPerson: true,
          onCountryChange: (id) => { if (!cancelled) setCountry(id); },
          onContextLost: () => {
            if (!cancelled) {
              presenceRef.current?.leave();
              worldRef.current?.setInputEnabled(false);
              setRenderStatus("error");
            }
          },
        });
        worldRef.current = world;
        if (initialCountry !== "us") world.travelCountry(initialCountry);
        const socket = io(`${API_URL || window.location.origin}/vcr`, {
          autoConnect: false,
          auth: (callback) => callback({ token: getToken() || initialToken }),
          transports: ["websocket", "polling"],
        });
        const session = createVcrPresence({
          socket,
          world,
          onState: (state) => {
            if (!cancelled) {
              world.setInputEnabled(state === "online");
              setPresence(state);
            }
          },
          onPeers: (rows) => { if (!cancelled) setPeers(rows); },
          onInstance: (id) => { if (!cancelled) setInstance(id); },
        });
        presenceRef.current = session;
        setRenderStatus("ready");
        // Join only with the already-resolved backend token.
        // A rejected join leaves movement disabled and shows Retry.
        session.join(initialCountry, "violet", sharePhoto);
      })
      .catch(() => {
        if (!cancelled) { setRenderStatus("error"); setPresence("error"); }
      });
    return () => {
      cancelled = true;
      presenceRef.current?.close();
      presenceRef.current = null;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, [initialCountry, initialToken, sharePhoto]);

  const move = (direction, enabled) => {
    if (presence !== "online" || renderStatus !== "ready") {
      worldRef.current?.stopMoving();
      return;
    }
    worldRef.current?.setDirection(direction, enabled);
  };

  const moveButton = (direction, glyph) => (
    <button type="button" key={direction} aria-label={t("vcrWorld." + direction)}
      disabled={renderStatus !== "ready" || presence !== "online"}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        move(direction, true);
      }}
      onPointerUp={() => move(direction, false)}
      onPointerCancel={() => move(direction, false)}
      onLostPointerCapture={() => move(direction, false)}
      onBlur={() => move(direction, false)}>
      {glyph}
    </button>
  );

  const travel = (id) => {
    if (presence !== "online" || !VCR_COUNTRIES.some((entry) => entry.id === id)) return;
    setShowCountries(false);
    if (id !== country) presenceRef.current?.changeCountry(id);
  };

  const leave = () => {
    worldRef.current?.setInputEnabled(false);
    presenceRef.current?.leave();
    onExit?.();
  };

  return (
    <section className={styles.world} aria-label={t("worldPhoto.walkingMode")}>
      <div className={styles.scene}>
        <canvas ref={canvasRef} className={styles.canvas} tabIndex={0}
          role="img" aria-label={t("worldPhoto.walkingScene")} />
        <div className={styles.topBar}>
          <div className={styles.place}>
            <strong>{t("vcrWorld.countries." + country)}</strong>
            <small>{t("worldPhoto.walkingMode")}</small>
          </div>
          <button type="button" onClick={leave}>{t("worldPhoto.backToPhotos")}</button>
        </div>
        {renderStatus === "ready" && (
          <div className={styles.pad} role="group" aria-label={t("vcrWorld.controlTitle")}>
            <span />
            {moveButton("forward", "↑")}
            <span />
            {moveButton("left", "←")}
            {moveButton("back", "↓")}
            {moveButton("right", "→")}
          </div>
        )}
        <div className={styles.bottomBar}>
          <span className={styles.presence} role="status">
            {t("vcrWorld.connection." + presence)}
            {presence === "online" ? ` · ${peers.length}` : ""}
          </span>
          {renderStatus === "ready" && <button type="button"
            disabled={presence !== "online"}
            onClick={() => setShowCountries((current) => !current)}>
            {t("worldPhoto.changeDestination")}
          </button>}
        </div>
        {showCountries && presence === "online" && (
          <div className={styles.travelMenu} role="group" aria-label={t("worldPhoto.destinationsShort")}>
            {VCR_COUNTRIES.map((entry) => (
              <button key={entry.id} type="button" aria-pressed={entry.id === country}
                onClick={() => travel(entry.id)}>{entry.emoji} {t("vcrWorld.countries." + entry.id)}</button>
            ))}
          </div>
        )}
        {(renderStatus !== "ready" || presence === "error") && (
          <div className={styles.cover} role="alert">
            <p>{t(renderStatus === "loading" ? "vcrWorld.loading" : "worldPhoto.walkingConnectionError")}</p>
            {renderStatus === "ready" && presence === "error" &&
              <button type="button" onClick={() => presenceRef.current?.join(country, "violet", sharePhoto)}>
                {t("worldPhoto.retryEnter")}
              </button>}
            <button type="button" onClick={leave}>{t("worldPhoto.backToPhotos")}</button>
          </div>
        )}
      </div>
      <div className={styles.notes}>
        <p>{t("worldPhoto.walkingPrototypeNotice")}</p>
        <p>{t("worldPhoto.walkingHint")}</p>
        {instance && <small>{t("vcrWorld.instance")}: {instance.slice(-8)}</small>}
      </div>
      {peers.length > 0 && presence === "online" && <div className={styles.people}>
        <strong>{t("vcrWorld.people")}</strong>
        <div>{peers.map((peer) => <span key={peer.userId}>{peer.name || t("vcrWorld.visitor")}</span>)}</div>
      </div>}
    </section>
  );
}
