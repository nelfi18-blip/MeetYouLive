"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { getToken } from "@/lib/token";
import { createVcrPresence } from "@/lib/vcr/presence";
import { fetchApprovedAiWorldSession } from "@/lib/vcr/aiWorldSession.mjs";
import { createApprovedAiWorldWalk } from "@/lib/vcr/aiWorldWalk.mjs";
import styles from "./WalkableWorld.module.css";

const WORLD_TEST_API = "https://meetyoulive-world-test.onrender.com";
const ISOLATED = process.env.NEXT_PUBLIC_WORLD_TEST_MODE === "isolated";

// This screen does not appear without a server-authorized scene descriptor.
// AI-generated scenery is labeled; no fake human avatars or paid API calls.
export default function AiWalkableWorld({ initialCountry, initialToken, sharePhoto = false, onExit }) {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const presenceRef = useRef(null);
  const [stageStatus, setStageStatus] = useState("loading");
  const [presence, setPresence] = useState("connecting");
  const [peers, setPeers] = useState([]);
  const [instance, setInstance] = useState(null);

  useEffect(() => {
    const aborter = new AbortController();
    let disposed = false;
    const token = getToken() || initialToken;
    if (!ISOLATED || !token || !canvasRef.current) {
      setStageStatus("error"); setPresence("error");
      return () => aborter.abort();
    }

    const start = async () => {
      try {
        // No Spark / collider bytes are downloaded unless World Test has
        // approved a scene for this exact country and synthetic test session.
        const approved = await fetchApprovedAiWorldSession({
          country: initialCountry, token, signal: aborter.signal,
        });
        if (disposed || aborter.signal.aborted) return;
        const THREE = await import("three");
        if (disposed || aborter.signal.aborted) return;
        const world = await createApprovedAiWorldWalk({
          canvas: canvasRef.current, THREE,
          descriptor: approved.descriptor, navigation: approved.navigation,
          signal: aborter.signal,
          onContextLost: () => {
            if (!disposed) {
              presenceRef.current?.leave();
              worldRef.current?.setInputEnabled(false);
              setStageStatus("error");
            }
          },
        });
        if (disposed || aborter.signal.aborted) { world.dispose(); return; }
        worldRef.current = world;

        const socket = io(WORLD_TEST_API + "/vcr", {
          autoConnect: false,
          auth: (callback) => callback({ token }),
          transports: ["websocket", "polling"],
        });
        const session = createVcrPresence({
          socket, world, aiScene: approved.descriptor,
          onState: (state) => {
            if (!disposed) {
              world.setInputEnabled(state === "online");
              setPresence(state);
            }
          },
          onPeers: (rows) => { if (!disposed) setPeers(rows); },
          onInstance: (id) => { if (!disposed) setInstance(id); },
        });
        presenceRef.current = session;
        setStageStatus("ready");
        // An ACK with the same scene ID and SHA-256 pair is mandatory.
        session.join(initialCountry, "violet", sharePhoto);
      } catch {
        if (!disposed) { setStageStatus("error"); setPresence("error"); }
      }
    };
    start();
    return () => {
      disposed = true;
      aborter.abort();
      presenceRef.current?.close();
      presenceRef.current = null;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, [initialCountry, initialToken, sharePhoto]);

  const move = (direction, enabled) => {
    if (stageStatus !== "ready" || presence !== "online") {
      worldRef.current?.stopMoving();
      return;
    }
    worldRef.current?.setDirection(direction, enabled);
  };
  const moveButton = (direction, glyph) => (
    <button type="button" key={direction} aria-label={t("vcrWorld." + direction)}
      disabled={stageStatus !== "ready" || presence !== "online"}
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
  const leave = () => {
    worldRef.current?.setInputEnabled(false);
    presenceRef.current?.leave();
    onExit?.();
  };

  return (
    <section className={styles.world} aria-label={t("worldPhoto.walkingAiTitle")}>
      <div className={styles.scene}>
        <canvas ref={canvasRef} className={styles.canvas} tabIndex={0}
          role="img" aria-label={t("worldPhoto.walkingScene")} />
        <div className={styles.topBar}>
          <div className={styles.place}>
            <strong>{t("vcrWorld.countries." + initialCountry)}</strong>
            <small>{t("worldPhoto.walkingAiTitle")}</small>
          </div>
          <button type="button" onClick={leave}>{t("worldPhoto.backToPhotos")}</button>
        </div>
        {stageStatus === "ready" && (
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
        </div>
        {(stageStatus !== "ready" || presence !== "online") && (
          <div className={styles.cover} role={presence === "error" ? "alert" : "status"}>
            <p>{t(stageStatus === "loading" || presence === "connecting" || presence === "reconnecting"
              ? "worldPhoto.walkingConnecting" : "worldPhoto.walkingAiError")}</p>
            <button type="button" onClick={leave}>{t("worldPhoto.backToPhotos")}</button>
          </div>
        )}
      </div>
      <div className={styles.notes}>
        <p>{t("worldPhoto.walkingAiNotice")}</p>
        <p>{t("worldPhoto.walkingHint")}</p>
        <p>{t("worldPhoto.walkingAiCountryNotice")}</p>
        {instance && <small>{t("vcrWorld.instance")}: {instance.slice(-8)}</small>}
      </div>
      {peers.length > 0 && presence === "online" && (
        <div className={styles.people}>
          <strong>{t("vcrWorld.people")}</strong>
          <div>{peers.map((peer) => (
            <span key={peer.userId}>{peer.name || t("vcrWorld.visitor")}</span>
          ))}</div>
        </div>
      )}
    </section>
  );
}
