"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { VCR_DISTRICTS } from "@/lib/vcr/districtWorld";
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
  const [status, setStatus] = useState("loading");
  const [district, setDistrict] = useState("central");
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
      });
      setStatus("ready");
    }).catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => {
      cancelled = true;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, []);

  const move = (direction, down) => worldRef.current?.setDirection(direction, down);
  const chooseDistrict = (id) => {
    if (worldRef.current?.teleport(id)) setDistrict(id);
  };
  const chooseOutfit = (id) => {
    worldRef.current?.setOutfit(id);
    setOutfit(id);
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
        <div className={styles.sceneDistrict}>{t("vcrWorld.zones." + district)}</div>
        {status !== "ready" && (
          <div className={styles.stateCover} role={status === "error" ? "alert" : "status"}>
            <div className={styles.stateIcon} aria-hidden="true">✦</div>
            <p>{t(status === "error" ? "vcrWorld.unsupported" : "vcrWorld.loading")}</p>
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
