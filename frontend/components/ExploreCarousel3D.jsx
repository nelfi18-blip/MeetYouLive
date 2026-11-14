"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { normalizePortalIndex, getPortalCardOffset } from "@/lib/universePortalMotion";
import styles from "./ExploreCarousel3D.module.css";
import RotatingEarthCanvas from "./RotatingEarthCanvas";

// Route destinations are verified against App Router. Unreleased experiences
// intentionally have no href: never send people to a 404 or a fake feature.
export const EXPERIENCES = Object.freeze([
  { id: "live", route: "/live", color: "#ff4da4", icon: "radio" },
  { id: "games", route: null, color: "#a778ff", icon: "games", coming: true },
  { id: "random", route: "/random", color: "#b675ff", icon: "random" },
  { id: "world", route: null, color: "#50e0ff", icon: "world", coming: true },
  { id: "rooms", route: "/rooms", color: "#ffbd6b", icon: "rooms" },
  { id: "connect", route: "/feed", color: "#ff6eae", icon: "heart" },
  { id: "ai", route: null, color: "#70f4f4", icon: "ai", coming: true },
]);

const WORLD_INDEX = EXPERIENCES.findIndex((item) => item.id === "world");
const FULL_TURN_SECONDS = 8.8;
const COPY = {
  es: {
    eyebrow: "TU UNIVERSO SOCIAL", welcome: "Bienvenido a MeetYouLive",
    question: "¿Qué te gustaría explorar hoy?", skip: "Omitir",
    instruction: "Desliza para girar y elegir tu experiencia",
    enter: "Entrar ahora", coming: "En construcción",
    comingAction: "Próximamente", prev: "Girar a la izquierda",
    next: "Girar a la derecha", selection: "Experiencia seleccionada",
    live: ["En Vivo", "Transmisiones reales y eventos"],
    games: ["Juegos", "Juega, compite y conversa"],
    random: ["Random", "Conoce personas al azar"],
    world: ["World", "Explora países y conoce personas"],
    rooms: ["Salas Sociales", "Conversa, comparte y haz amigos"],
    connect: ["Conectar", "Citas, afinidad y relaciones reales"],
    ai: ["IA Social", "Rompe el hielo y descubre ideas"],
  },
  en: {
    eyebrow: "YOUR SOCIAL UNIVERSE", welcome: "Welcome to MeetYouLive",
    question: "What would you like to explore today?", skip: "Skip",
    instruction: "Swipe to spin and choose your experience",
    enter: "Enter now", coming: "Coming soon",
    comingAction: "Coming soon", prev: "Rotate left",
    next: "Rotate right", selection: "Selected experience",
    live: ["Live", "Real streams and events"],
    games: ["Games", "Play, compete and connect"],
    random: ["Random", "Meet people spontaneously"],
    world: ["World", "Explore places and meet people"],
    rooms: ["Social Rooms", "Chat, share and make friends"],
    connect: ["Connect", "Dating, connections and relationships"],
    ai: ["Social AI", "Break the ice and discover ideas"],
  },
  pt: {
    eyebrow: "SEU UNIVERSO SOCIAL", welcome: "Bem-vindo ao MeetYouLive",
    question: "O que gostaria de explorar hoje?", skip: "Pular",
    instruction: "Deslize para girar e escolher sua experiência",
    enter: "Entrar agora", coming: "Em construção",
    comingAction: "Em breve", prev: "Girar à esquerda",
    next: "Girar à direita", selection: "Experiência selecionada",
    live: ["Ao Vivo", "Transmissões e eventos reais"],
    games: ["Jogos", "Jogue, compita e converse"],
    random: ["Random", "Conheça pessoas ao acaso"],
    world: ["World", "Explore países e conheça pessoas"],
    rooms: ["Salas Sociais", "Converse, compartilhe e faça amigos"],
    connect: ["Conectar", "Encontros e conexões reais"],
    ai: ["IA Social", "Quebre o gelo e descubra ideias"],
  },
};

// Original SVG strokes avoid an extra icon dependency (lucide-react is not
// installed in this project). All icons scale cleanly in Capacitor WebView.
function Glyph({ name, size = 25 }) {
  let art;
  switch (name) {
    case "radio":
      art = <><circle cx="12" cy="12" r="2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.6 4.6a10.5 10.5 0 0 0 0 14.8m14.8-14.8a10.5 10.5 0 0 1 0 14.8" /></>;
      break;
    case "games":
      art = <><path d="M6.2 9H17.8a3 3 0 0 1 3 2.5l.8 5a2 2 0 0 1-3.2 1.9l-2.5-2.2H8.1l-2.5 2.2a2 2 0 0 1-3.2-1.9l.8-5a3 3 0 0 1 3-2.5Z" /><path d="M7.5 11v5m-2.5-2.5h5" /><circle cx="16.5" cy="12" r=".65" fill="currentColor" /><circle cx="18" cy="14.5" r=".65" fill="currentColor" /></>;
      break;
    case "random":
      art = <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="7.5" cy="7.5" r=".8" fill="currentColor" /><circle cx="16.5" cy="7.5" r=".8" fill="currentColor" /><circle cx="12" cy="12" r=".8" fill="currentColor" /><circle cx="7.5" cy="16.5" r=".8" fill="currentColor" /><circle cx="16.5" cy="16.5" r=".8" fill="currentColor" /></>;
      break;
    case "world":
      art = <><circle cx="12" cy="12" r="9" /><path d="M3.4 12h17.2M12 3c-3.2 3.5-3.2 14.5 0 18m0-18c3.2 3.5 3.2 14.5 0 18" /></>;
      break;
    case "rooms":
      art = <><circle cx="9" cy="8" r="3" /><circle cx="17.5" cy="9" r="2.5" /><path d="M2.5 20v-2.2A5.6 5.6 0 0 1 8.2 12h1.6a5.6 5.6 0 0 1 5.7 5.8V20H2.5Zm14.2-7a4 4 0 0 1 4.8 4v3h-4" /></>;
      break;
    case "heart":
      art = <path d="M20.8 5.8a5.1 5.1 0 0 0-7.3 0L12 7.3l-1.5-1.5a5.1 5.1 0 1 0-7.3 7.2L12 21.1l8.8-8.1a5.1 5.1 0 0 0 0-7.2Z" />;
      break;
    default:
      art = <><path d="M8 6.2A4.5 4.5 0 0 0 3.8 11v2.6a4 4 0 0 0 4.5 4.1c1.2 3.2 6.3 3.2 7.4 0a4 4 0 0 0 4.5-4.1V11A4.5 4.5 0 0 0 16 6.2a4 4 0 0 0-8 0Z" /><path d="M8 6.2v11.5m8-11.5v11.5M5.7 12h4.1m4.4 0h4.1" /></>;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{art}</svg>;
}

export default function ExploreCarousel3D() {
  const router = useRouter();
  const { lang } = useLanguage();
  const copy = COPY[lang] || COPY.es;
  const reducedMotion = useReducedMotion();
  const [turns, setTurns] = useState(0);
  const [introPlaying, setIntroPlaying] = useState(false);
  const [wheelMoving, setWheelMoving] = useState(false);
  const pointerRef = useRef(null);
  const suppressCardClickRef = useRef(false);
  const introTimerRef = useRef(null);
  const total = EXPERIENCES.length;
  const activeIndex = normalizePortalIndex(WORLD_INDEX + turns, total);
  const activeExperience = EXPERIENCES[activeIndex];

  useEffect(() => {
    // Initial animation is exactly one turn, not an endless carousel.
    // It is opt-out via reduced motion and interrupted by any user input.
    if (reducedMotion) return undefined;
    introTimerRef.current = window.setTimeout(() => {
      setIntroPlaying(true);
      setWheelMoving(true);
      setTurns(total);
      introTimerRef.current = null;
    }, 500);
    return () => {
      if (introTimerRef.current != null) window.clearTimeout(introTimerRef.current);
    };
  }, [reducedMotion, total]);

  const interruptIntro = useCallback(() => {
    if (introTimerRef.current != null) window.clearTimeout(introTimerRef.current);
    introTimerRef.current = null;
    setIntroPlaying(false);
  }, []);

  const move = useCallback((by) => {
    interruptIntro();
    if (!reducedMotion) setWheelMoving(true);
    setTurns((current) => current + by);
  }, [interruptIntro, reducedMotion]);

  const select = useCallback((index) => {
    if (suppressCardClickRef.current) {
      suppressCardClickRef.current = false;
      return;
    }
    interruptIntro();
    if (!reducedMotion) setWheelMoving(true);
    setTurns((current) => current + getPortalCardOffset(
      index, normalizePortalIndex(WORLD_INDEX + current, total), total
    ));
  }, [interruptIntro, total, reducedMotion]);

  const onPointerDown = (event) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    suppressCardClickRef.current = false;
  };
  const onPointerUp = (event) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      suppressCardClickRef.current = true;
      move(dx < 0 ? 1 : -1);
    }
  };
  const navigate = () => {
    if (!activeExperience.route) return;
    interruptIntro();
    router.push(activeExperience.route);
  };

  const angle = (-turns * 360) / total;
  return (
    <section className={styles.scene} style={{ "--theme-color": activeExperience.color }} data-experience={activeExperience.id}>
      <div key={activeExperience.id} className={styles.backdrop} aria-hidden="true" />
      <header className={styles.header}>
        <button className={styles.skip} type="button" onClick={() => router.push("/feed")}>{copy.skip} ›</button>
        <div className={styles.logo}><span className={styles.logoMark}><Image src="/logo.svg" alt="" width={72} height={50} priority unoptimized /></span><span className={styles.brandName}>MeetYou<span>Live</span></span></div>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1>{copy.welcome}</h1>
        <p className={styles.question}>{copy.question}</p>
      </header>

      <div className={styles.center}>
        <div className={styles.stage} role="group" aria-label={copy.instruction}
          onPointerDown={onPointerDown} onPointerUp={onPointerUp}
          onPointerCancel={() => { pointerRef.current = null; }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
            if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
          }}>
          <div className={styles.halo} aria-hidden="true" />
          <div className={styles.floorReflections} aria-hidden="true" />
          <div className={styles.platform} aria-hidden="true">
            <span className={styles.platformTop} />
            <span className={styles.platformLeds} />
            <span className={styles.platformCore} />
          </div>
          <button className={styles.arrow + " " + styles.arrowLeft} type="button" aria-label={copy.prev}
            onClick={() => move(-1)}><span aria-hidden="true">‹</span></button>
          <div className={styles.camera}>
            {/* The central Earth is a separate background world, NOT World card art.
                Every experience continues to orbit around this visible planet. */}
            <div className={styles.universeGlobe}
              data-wheel-moving={wheelMoving ? "yes" : "no"} aria-hidden="true">
              <span className={styles.universeGlobeImage} />
              <RotatingEarthCanvas paused={wheelMoving} reducedMotion={Boolean(reducedMotion)} />
              <span className={styles.universeGlobeAtmosphere} />
            </div>
            {/* Independent luminous orbits keep circling the Earth and cards
                after the 3D wheel settles. They never intercept swipes. */}
            <div className={styles.planetOrbits}
              data-wheel-moving={wheelMoving ? "yes" : "no"} aria-hidden="true">
              <span className={styles.orbitPathPrimary} />
              <span className={styles.orbitPathSecondary} />
              <span className={styles.orbitSparkPrimary} />
              <span className={styles.orbitSparkSecondary} />
            </div>
            <motion.div
              className={styles.wheel}
              initial={false}
              animate={{ rotateY: angle }}
              transition={reducedMotion ? { duration: 0 } : introPlaying ? { type: "tween", duration: FULL_TURN_SECONDS, ease: "easeInOut" } : { type: "spring", stiffness: 95, damping: 20, mass: 1.1 }}
              onAnimationComplete={() => {
                setIntroPlaying(false);
                setWheelMoving(false);
              }}
            >
              {EXPERIENCES.map((item, index) => {
                const offset = getPortalCardOffset(index, activeIndex, total);
                const centered = offset === 0;
                return (
                  <button key={item.id}
                    type="button"
                    className={styles.card}
                    aria-label={copy[item.id][0] + ": " + copy[item.id][1]}
                    aria-pressed={centered}
                    data-destination={item.id}
                    data-active={centered ? "yes" : "no"}
                    onClick={() => select(index)}
                    style={{
                      "--slot-angle": String(((index - WORLD_INDEX) * 360) / total) + "deg",
                      "--card-accent": item.color,
                    }}>
                    <span className={styles.cardImage} aria-hidden="true" />
                    <span className={styles.cardShade} />
                    <span className={styles.cardContent}>
                      <span className={styles.cardIcon}><Glyph name={item.icon} size={29} /></span>
                      <strong>{copy[item.id][0]}</strong>
                      <span className={styles.cardDescription}>{copy[item.id][1]}</span>
                      {item.coming && <span className={styles.coming}>{copy.coming}</span>}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          </div>
          {/* A bright, filled fingertip always points toward the front card,
              with a brief selection response, without intercepting touches. */}
          <motion.div key={activeExperience.id} className={styles.selectionHand}
            aria-hidden="true" initial={reducedMotion ? false : { opacity: 0, y: 18, scale: .75 }}
            animate={{ opacity: introPlaying ? .78 : 1, y: 0, scale: 1 }}
            transition={{ duration: reducedMotion ? 0 : .46, ease: "easeOut" }}>
            <span className={styles.fingerAura} />
            <svg viewBox="0 0 104 144" width="78" height="110" aria-hidden="true">
              <defs>
                <linearGradient id="portal-hand-skin" x1="10%" y1="10%" x2="92%" y2="90%">
                  <stop offset="0%" stopColor="#fffaf2" />
                  <stop offset="42%" stopColor="#ffe0d0" />
                  <stop offset="76%" stopColor="#f5b1c3" />
                  <stop offset="100%" stopColor="#bd78ba" />
                </linearGradient>
                <linearGradient id="portal-hand-cuff" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#82f3ff" />
                  <stop offset="55%" stopColor="#6d70f9" />
                  <stop offset="100%" stopColor="#ec5ed9" />
                </linearGradient>
              </defs>
              <path d="M41 138 36 120c-7-5-12-12-17-20L8 89c-4-6-3-12 3-15 6-3 12-1 16 5l11 14V24c0-8 6-14 13-14s13 6 13 14v49c2-6 6-10 12-10 7 0 11 5 12 11 3-3 7-5 11-4 7 1 11 7 11 15v20c0 16-8 29-23 35z"
                fill="url(#portal-hand-skin)" stroke="#552b76" strokeWidth="4.5" strokeLinejoin="round" />
              <path d="M46 27v54M61 76v26m15-25v25M88 84v19M17 83l16 21"
                fill="none" stroke="#be79aa" strokeWidth="3" strokeLinecap="round" opacity=".68" />
              <path d="M43 24c0-5 3-8 8-8 4 0 7 3 7 8v14H43z"
                fill="#fff1eb" stroke="#efb6ca" strokeWidth="1.4" opacity=".92" />
              <path d="M42 134h38l5 10H41z" fill="url(#portal-hand-cuff)" stroke="#4e3ca4" strokeWidth="2" />
              <path d="M45 130h33" stroke="#fff" strokeWidth="1.6" opacity=".8" />
              <path d="M51 2v-7M32 12l-6-7M70 10l6-8" fill="none"
                stroke="#91f7ff" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <span className={styles.fingerSpark}>✦</span>
          </motion.div>
          <button className={styles.arrow + " " + styles.arrowRight} type="button" aria-label={copy.next}
            onClick={() => move(1)}><span aria-hidden="true">›</span></button>
        </div>
        <div className={styles.instruction} aria-live="polite">
          <span className={styles.hand} aria-hidden="true">← &nbsp; ↔ &nbsp; →</span>
          <span>{copy.instruction}</span>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.selection} aria-live="polite">{copy.selection}: <strong>{copy[activeExperience.id][0]}</strong></div>
        <button type="button" onClick={navigate} disabled={!activeExperience.route}
          className={styles.enter} aria-label={activeExperience.route ? copy.enter + " " + copy[activeExperience.id][0] : copy.comingAction}>
          <span className={styles.enterShimmer} aria-hidden="true" />
          <span className={styles.enterLabel}>
            {activeExperience.route ? copy.enter : copy.comingAction}
          </span>
          <span className={styles.enterIcon} aria-hidden="true">
            {activeExperience.route ? (
              <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12h16m-7-7 7 7-7 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M3.5 12h17M12 3.5c-5 5-5 12 0 17m0-17c5 5 5 12 0 17" />
              </svg>
            )}
          </span>
        </button>
      </footer>
    </section>
  );
}
