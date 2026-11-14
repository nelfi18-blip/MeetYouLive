"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import {
  PORTAL_CUES_MS,
  PORTAL_TIMELINE_MS,
  PORTAL_ORBIT_STEP_MS,
  PORTAL_ORBIT_STEPS,
  normalizePortalIndex,
  getPortalCardOffset,
  getPortalVisualPose,
} from "@/lib/universePortalMotion";
import styles from "./UniversePortalPreview.module.css";

// This preview does NOT change home, signup, login, World, Live or billing.
// Only existing routes are clickable; unreleased features are labeled.
const DESTINATIONS = Object.freeze([
  // Ordered to match the approved visual: Live / Games / Random / WORLD /
  // Social Rooms / Connect / Social AI. Random must be clearly visible.
  { id: "live", icon: "📡", route: "/live", accent: "#ff4f9d" },
  { id: "games", icon: "🎮", route: "/rooms", accent: "#a456ff", testing: true },
  { id: "random", icon: "🎲", route: "/random", accent: "#c35bff" },
  { id: "world", icon: "🌎", route: null, accent: "#47cfff", coming: true },
  { id: "rooms", icon: "🫶", route: "/rooms", accent: "#ffb53c" },
  { id: "connect", icon: "💗", route: "/feed", accent: "#ff5da5" },
  { id: "ai", icon: "✨", route: null, accent: "#4de6ff", coming: true },
]);

const WORLD_INDEX = DESTINATIONS.findIndex((item) => item.id === "world");
// Reveal outward from the central World card, alternating left and right;
// this matches the intentional pacing of the approved presentation.
const REVEAL_ORDER = { random: 0, rooms: 1, games: 2, connect: 3, live: 4, ai: 5, world: 0 };

const COPY = {
  es: {
    brand: "TU UNIVERSO SOCIAL",
    welcome: "Bienvenido a MeetYouLive",
    question: "¿Qué te gustaría explorar hoy?",
    intro: ["Comienza una nueva experiencia.", "El universo aparece ante ti.", "Nos acercamos a World.", "El portal cobra vida.", "Descubre tus experiencias.", "Las opciones giran a tu alrededor.", "Gira y elige adónde entrar."],
    choose: "Gira el círculo para elegir tu experiencia",
    enter: "Entrar ahora",
    enterTo: "Entrar a",
    coming: "En construcción",
    testing: "En pruebas",
    unavailable: "Esta experiencia está en construcción",
    skip: "Omitir",
    replay: "Repetir presentación",
    home: "Ir al inicio",
    previous: "Girar a la izquierda",
    next: "Girar a la derecha",
    preview: "VISTA PREVIA · NO SE HA MODIFICADO TU INICIO",
    live: ["En Vivo", "Transmisiones reales y eventos"],
    games: ["Juegos", "Juega, diviértete y conversa"],
    world: ["World", "Un mundo social en preparación"],
    rooms: ["Salas Sociales", "Conversa, comparte y haz amigos"],
    connect: ["Conectar", "Citas, amistad y nuevas conexiones"],
    ai: ["IA Social", "Experiencias interactivas en preparación"],
    random: ["Random", "Conoce personas al azar"],
  },
  en: {
    brand: "YOUR SOCIAL UNIVERSE",
    welcome: "Welcome to MeetYouLive",
    question: "What would you like to explore today?",
    intro: ["A new experience begins.", "A new universe appears.", "Approaching World.", "The portal comes to life.", "Discover your experiences.", "The destinations orbit around you.", "Spin to choose your destination."],
    choose: "Spin the circle to choose your experience",
    enter: "Enter now",
    enterTo: "Enter",
    coming: "Coming soon",
    testing: "In testing",
    unavailable: "This experience is under construction",
    skip: "Skip",
    replay: "Replay entrance",
    home: "Go to home",
    previous: "Rotate left",
    next: "Rotate right",
    preview: "PREVIEW · YOUR ACTUAL HOME IS UNCHANGED",
    live: ["Live", "Real streams and events"],
    games: ["Games", "Play, have fun and connect"],
    world: ["World", "A social world in development"],
    rooms: ["Social Rooms", "Talk, share and make friends"],
    connect: ["Connect", "Dating, friends and new connections"],
    ai: ["Social AI", "Interactive experiences coming later"],
    random: ["Random", "Meet people spontaneously"],
  },
  pt: {
    brand: "SEU UNIVERSO SOCIAL",
    welcome: "Boas-vindas ao MeetYouLive",
    question: "O que você gostaria de explorar hoje?",
    intro: ["Uma nova experiência começa.", "Um novo universo aparece.", "Estamos chegando ao World.", "O portal ganha vida.", "Descubra suas experiências.", "As experiências giram ao seu redor.", "Gire e escolha para onde entrar."],
    choose: "Gire o círculo para escolher sua experiência",
    enter: "Entrar agora",
    enterTo: "Entrar em",
    coming: "Em construção",
    testing: "Em testes",
    unavailable: "Esta experiência está em construção",
    skip: "Pular",
    replay: "Repetir apresentação",
    home: "Ir ao início",
    previous: "Girar à esquerda",
    next: "Girar à direita",
    preview: "PRÉVIA · O INÍCIO REAL NÃO FOI ALTERADO",
    live: ["Ao vivo", "Transmissões e eventos reais"],
    games: ["Jogos", "Jogue, divirta-se e converse"],
    world: ["World", "Um mundo social em desenvolvimento"],
    rooms: ["Salas sociais", "Converse, compartilhe e faça amigos"],
    connect: ["Conectar", "Encontros, amizades e conexões"],
    ai: ["IA social", "Experiências interativas em preparação"],
    random: ["Random", "Conheça pessoas aleatoriamente"],
  },
};

const PHASE_TEXT_INDEX = { brand: 0, globe: 1, approach: 2, portal: 3, reveal: 4, orbit: 5, ready: 6 };

function WorldArtwork() {
  return (
    <span className={styles.worldArtwork} aria-hidden="true">
      {/* Entire World illustration is a licensed-for-this-project original
          local asset, not a collage of unrelated stock photographs. */}
      {/* Only the normal card tag displays "under construction"; no duplicate overlay. */}
    </span>
  );
}

export default function UniversePortalPreview() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [language, setLanguage] = useState("es");
  const copy = COPY[language];
  const [phase, setPhase] = useState("brand");
  const [sequence, setSequence] = useState(0);
  // Unbounded revolutions keep the carousel travelling forward through the
  // seventh-to-first boundary instead of teleporting to a new position.
  const [turnCount, setTurnCount] = useState(0);
  const selectedIndex = normalizePortalIndex(WORLD_INDEX + turnCount, DESTINATIONS.length);
  const timersRef = useRef([]);
  const touchRef = useRef(null);
  const didSwipe = useRef(false);

  const selected = DESTINATIONS[selectedIndex];
  const isReady = phase === "ready";
  const cardsVisible = phase === "reveal" || phase === "orbit" || isReady;

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    clearTimers();
    if (reducedMotion) {
      setPhase("ready");
      return clearTimers;
    }
    setTurnCount(0);
    setPhase("brand");
    timersRef.current = [
      setTimeout(() => setPhase("globe"), PORTAL_CUES_MS.globe),
      setTimeout(() => setPhase("approach"), PORTAL_CUES_MS.approach),
      setTimeout(() => setPhase("portal"), PORTAL_CUES_MS.portal),
      setTimeout(() => setPhase("reveal"), PORTAL_CUES_MS.reveal),
      setTimeout(() => setPhase("orbit"), PORTAL_CUES_MS.orbit),
      ...Array.from({ length: PORTAL_ORBIT_STEPS }, (_, step) =>
        setTimeout(() => setTurnCount(step + 1),
          PORTAL_CUES_MS.orbit + 360 + step * PORTAL_ORBIT_STEP_MS)),
      setTimeout(() => setPhase("ready"), PORTAL_CUES_MS.ready),
    ];
    return clearTimers;
  }, [sequence, reducedMotion, clearTimers]);

  const skip = useCallback(() => {
    clearTimers();
    setTurnCount(0);
    setPhase("ready");
  }, [clearTimers]);
  const move = useCallback((by) => {
    if (!isReady) return;
    setTurnCount((current) => current + by);
  }, [isReady]);

  const pointerDown = (event) => {
    if (!isReady) return;
    didSwipe.current = false;
    touchRef.current = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!isReady || !start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      didSwipe.current = true;
      move(dx < 0 ? 1 : -1);
    }
  };
  const enter = () => { if (isReady && selected.route) router.push(selected.route); };

  return (
    <main className={styles.scene} data-phase={phase} data-theme={selected.id}
      style={{ "--scene-accent": selected.accent }}>
      <div key={selected.id} className={styles.themeBackground} aria-hidden="true" />
      <div className={styles.sceneGlow} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.brand}><span aria-hidden="true">♥</span> MeetYou<strong>Live</strong></div>
        <div className={styles.brandTag}>{copy.brand}</div>
        <div className={styles.languageBar} role="group" aria-label="Idioma">
          {["es", "en", "pt"].map((lang) => (
            <button key={lang} type="button" aria-pressed={language === lang}
              onClick={() => setLanguage(lang)}>
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
        <h1>{copy.welcome}</h1>
        <p>{copy.question}</p>
        {!isReady && (
          <button type="button" className={styles.skip} onClick={skip}>{copy.skip} ›</button>
        )}
      </header>

      <section className={styles.stage}
        tabIndex={0} aria-label={copy.choose}
        onPointerDown={pointerDown} onPointerUp={pointerUp}
        onPointerCancel={() => { touchRef.current = null; }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
          if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        }}>
        <div className={styles.skyHalo} aria-hidden="true" />
        <div className={styles.portalFloor} aria-hidden="true">
          <div className={styles.floorRingOuter} />
          <div className={styles.floorRingInner} />
        </div>
        <div className={styles.orbit} aria-label={copy.choose}
          style={{ "--portal-angle": `${(turnCount * 360) / DESTINATIONS.length}deg` }}>
          {DESTINATIONS.map((item, index) => {
            const pose = getPortalVisualPose(index, selectedIndex, DESTINATIONS.length);
            const selectedCard = selectedIndex === index;
            const worldCard = item.id === "world";
            const show = worldCard || cardsVisible;
            return (
              <button type="button" key={item.id}
                className={styles.experienceCard}
                data-destination={item.id}
                data-world={worldCard ? "yes" : "no"}
                data-selected={selectedCard ? "yes" : "no"}
                data-visible={show ? "yes" : "no"}
                disabled={!isReady}
                aria-pressed={selectedCard}
                aria-label={`${copy[item.id][0]} — ${copy[item.id][1]}`}
                onClick={() => {
                  if (didSwipe.current) { didSwipe.current = false; return; }
                  if (isReady) setTurnCount((count) => count +
                    getPortalCardOffset(index, normalizePortalIndex(WORLD_INDEX + count, DESTINATIONS.length), DESTINATIONS.length));
                }}
                style={{
                  // A genuine circular orbit: the camera angle is continuous
                  // across all seven stops and even when returning to World.
                  "--slot-angle": `${((index - WORLD_INDEX) * 360) / DESTINATIONS.length}deg`,
                  "--arrival-spin": `${(Math.sign(pose.x) || 1) * 155}deg`,
                  "--card-accent": item.accent,
                  "--reveal-delay": `${REVEAL_ORDER[item.id] * 115}ms`,
                  zIndex: pose.zIndex,
                  opacity: show ? pose.opacity : 0,
                  pointerEvents: isReady && pose.opacity > 0.3 ? "auto" : "none",
                }}>
                <span className={styles.cardArt}>
                  {worldCard ? <WorldArtwork /> : (
                    <span className={styles.cardPhoto} aria-hidden="true" />
                  )}
                </span>
                <span className={styles.cardBottom}>
                  <span className={styles.cardIcon} aria-hidden="true">{item.icon}</span>
                  <span className={styles.cardTitle}>{copy[item.id][0]}</span>
                  {selectedCard && !worldCard && (
                    <span className={styles.cardSubtitle}>{copy[item.id][1]}</span>
                  )}
                  {item.coming && <span className={styles.tag}>{copy.coming}</span>}
                  {item.testing && <span className={styles.tag}>{copy.testing}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.instructions} aria-live="polite">
          {copy.intro[PHASE_TEXT_INDEX[phase]]}
        </div>
        {isReady ? (
          <>
            <div className={styles.turnBar}>
              <button type="button" onClick={() => move(-1)} aria-label={copy.previous}>‹</button>
              <span>{copy.choose}</span>
              <button type="button" onClick={() => move(1)} aria-label={copy.next}>›</button>
            </div>
            <button type="button" className={styles.enter}
              onClick={enter} disabled={!selected.route}>
              {selected.route ? `${copy.enterTo} ${copy[selected.id][0]}` : copy.unavailable}
              {selected.route && <span aria-hidden="true"> →</span>}
            </button>
          </>
        ) : (
          <div className={styles.progress} role="progressbar"
            aria-valuetext={copy.intro[PHASE_TEXT_INDEX[phase]]}>
            <span key={sequence} style={{ "--intro-duration": `${PORTAL_TIMELINE_MS.total}ms` }} />
          </div>
        )}
        <div className={styles.footerLinks}>
          <button type="button" onClick={() => {
            setTurnCount(0); setSequence((n) => n + 1);
          }}>↻ {copy.replay}</button>
          <Link href="/dashboard">{copy.home}</Link>
        </div>
        <small className={styles.previewNote}>{copy.preview}</small>
      </footer>
    </main>
  );
}
