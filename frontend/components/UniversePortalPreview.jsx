"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  PORTAL_CUES_MS,
  PORTAL_TIMELINE_MS,
  getPortalCardStyle,
  normalizePortalIndex,
} from "@/lib/universePortalMotion";
import styles from "./UniversePortalPreview.module.css";

// This is a concept preview, not a replacement for onboarding or the app home.
// Only existing, real destination routes are navigable; unshipped concepts
// explicitly remain previews, rather than misleading buttons.
// World is the centerpiece; these four functional doors orbit around it.
// Keep the welcome choice focused instead of repeating secondary features.
const DESTINATIONS = Object.freeze([
  { id: "world", icon: "🌎", href: null, color: "#69dfff", sky: ["#091a45", "#19488b", "#070c30"], coming: true },
  { id: "live", icon: "📡", href: "/live", color: "#ff559b", sky: ["#2f0b3a", "#77214e", "#170729"] },
  { id: "random", icon: "🎲", href: "/random", color: "#cf77ff", sky: ["#28105d", "#6322b4", "#070c38"] },
  { id: "connect", icon: "💞", href: "/feed", color: "#ff7ab8", sky: ["#471349", "#c85179", "#281047"] },
  { id: "rooms", icon: "🫶", href: "/rooms", color: "#ffc368", sky: ["#311a4c", "#6b4278", "#0d193b"] },
]);

// The scenery changes with the highlighted destination. These are atmosphere
// accents, never simulated users, fake Live audiences or new product features.
const BACKGROUND_SYMBOLS = Object.freeze({
  world: ["🪐", "✦", "🌐"],
  live: ["🎙️", "♫", "🎬"],
  rooms: ["💬", "🎮", "☕"],
  random: ["🎲", "✧", "🎭"],
  connect: ["💕", "🌷", "🧭"],
});

const TRANSLATIONS = {
  es: {
    subtitle: "Un universo para conectar, transmitir y explorar.",
    brandTag: "TU UNIVERSO SOCIAL",
    previewTag: "VISTA PREVIA · NO MODIFICA TU INICIO REAL",
    brand: "La experiencia comienza aquí.",
    portal: "El portal se ilumina ante ti.",
    welcome: "Bienvenido a tu universo social",
    slow: "Descubre cada experiencia a tu ritmo",
    world: ["World", "Un nuevo mundo social está en construcción"],
    live: ["En Vivo", "Transmisiones y entretenimiento real"],
    rooms: ["Salas sociales", "Conversa, participa y descubre juegos en pruebas"],
    random: ["Random", "Conoce personas al azar en tiempo real"],
    games: ["Juegos", "Actividades para jugar y conversar"],
    connect: ["Conectar", "Citas, amistades y perfiles por descubrir"],
    discover: ["Descubrir", "Explora perfiles y preferencias"],
    ai: ["IA social", "Experiencias interactivas en preparación"],
    coming: "En construcción",
    beta: "En pruebas",
    enter: "Entrar a",
    choose: "Gira con el dedo para elegir",
    skip: "Omitir introducción",
    replay: "Repetir entrada",
    home: "Ir al inicio",
    previous: "Experiencia anterior",
    next: "Siguiente experiencia",
    globe: "Un mundo nuevo aparece ante ti.",
    approach: "Nos acercamos a tu universo.",
    reveal: "Las experiencias aparecen lentamente.",
    ready: "Tú decides adónde entrar.",
    notReady: "Esta experiencia todavía está en desarrollo.",
  },
  en: {
    subtitle: "One universe to connect, stream and explore.",
    brandTag: "YOUR SOCIAL UNIVERSE",
    previewTag: "PREVIEW · YOUR REAL HOME IS UNCHANGED",
    brand: "Your experience starts here.",
    portal: "The portal comes to life.",
    welcome: "Welcome to your social universe",
    slow: "Explore each experience at your own pace",
    world: ["World", "A new social world is under construction"],
    live: ["Live", "Real-time streams and entertainment"],
    rooms: ["Social rooms", "Talk, connect and discover games in testing"],
    random: ["Random", "Meet people at random in real time"],
    games: ["Games", "Play and talk together"],
    connect: ["Connect", "Dating, friendship and social discovery"],
    discover: ["Discover", "Explore people and preferences"],
    ai: ["Social AI", "Interactive experiences coming later"],
    coming: "Coming soon",
    beta: "In testing",
    enter: "Enter",
    choose: "Swipe to choose your destination",
    skip: "Skip introduction",
    replay: "Replay entrance",
    home: "Go to home",
    previous: "Previous experience",
    next: "Next experience",
    globe: "A new world appears before you.",
    approach: "Approaching your universe.",
    reveal: "Experiences appear one at a time.",
    ready: "Take your time choosing where to go.",
    notReady: "This experience is still under construction.",
  },
  pt: {
    subtitle: "Um universo para se conectar, transmitir e explorar.",
    brandTag: "SEU UNIVERSO SOCIAL",
    previewTag: "PRÉVIA · SEU INÍCIO REAL NÃO FOI ALTERADO",
    brand: "Sua experiência começa aqui.",
    portal: "O portal começa a brilhar.",
    welcome: "Boas-vindas ao seu universo social",
    slow: "Explore cada experiência no seu ritmo",
    world: ["World", "Um novo mundo social está em construção"],
    live: ["Ao vivo", "Transmissões e entretenimento reais"],
    rooms: ["Salas sociais", "Converse, participe e descubra jogos em testes"],
    random: ["Random", "Conheça pessoas aleatoriamente em tempo real"],
    games: ["Jogos", "Jogue e converse com outras pessoas"],
    connect: ["Conectar", "Encontros, amizade e descoberta social"],
    discover: ["Descobrir", "Explore perfis e preferências"],
    ai: ["IA social", "Experiências interativas em preparação"],
    coming: "Em construção",
    beta: "Em testes",
    enter: "Entrar em",
    choose: "Deslize para escolher seu destino",
    skip: "Pular introdução",
    replay: "Repetir entrada",
    home: "Ir ao início",
    previous: "Experiência anterior",
    next: "Próxima experiência",
    globe: "Um novo mundo surge diante de você.",
    approach: "Estamos chegando ao seu universo.",
    reveal: "As experiências aparecem devagar.",
    ready: "Escolha com calma para onde ir.",
    notReady: "Esta experiência ainda está em desenvolvimento.",
  },
};

function WorldGlobe({ stage, isReady, selected, onSelect, label }) {
  return (
    <button
      type="button"
      className={styles.worldFrame}
      data-stage={stage}
      disabled={!isReady}
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
    >
      <div className={styles.globeHalo} aria-hidden="true" />
      <div className={styles.globeOrb} aria-hidden="true">
        <div className={styles.globeOcean} />
        <svg className={styles.continents} viewBox="0 0 360 360" focusable="false">
          <path d="M52 70L80 50 119 55 136 72 152 73 163 90 150 116 132 118 109 139 91 134 83 157 68 146 66 119 44 102Z" />
          <path d="M118 158L143 144 158 169 162 192 152 218 135 236 130 265 112 284 101 256 97 224 109 200 99 182Z" />
          <path d="M187 66L211 52 236 60 247 79 274 77 291 100 313 100 325 133 300 145 277 141 252 156 234 137 219 128 204 105 190 100Z" />
          <path d="M208 165L244 146 265 160 263 196 246 224 235 263 217 277 207 248 190 234 194 198Z" />
          <path d="M282 244L302 237 325 250 315 274 287 279 275 260Z" />
          <path d="M174 98L183 92 187 105 179 111Z" />
        </svg>
        <div className={styles.globeShade} />
      </div>
      <div className={styles.globeRing} aria-hidden="true" />
      <div className={styles.globePlatform} aria-hidden="true" />
      <div className={styles.worldTag} aria-hidden="true"><strong>WORLD</strong><span>MEETYOULIVE</span></div>
    </button>
  );
}

export default function UniversePortalPreview() {
  const router = useRouter();
  const { lang } = useLanguage();
  const copy = TRANSLATIONS[lang] || TRANSLATIONS.es;
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState("brand");
  const [sequence, setSequence] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scheduled = useRef([]);
  const pointerStart = useRef(null);
  const didSwipe = useRef(false);
  const chosen = DESTINATIONS[selectedIndex];
  const choice = copy[chosen.id];
  const isReady = phase === "ready";
  const showCards = phase === "reveal" || isReady;

  const clearTimers = useCallback(() => {
    for (const timeout of scheduled.current) clearTimeout(timeout);
    scheduled.current = [];
  }, []);

  useEffect(() => {
    clearTimers();
    if (reduceMotion) {
      setPhase("ready");
      return clearTimers;
    }
    setPhase("brand");
    scheduled.current = [
      setTimeout(() => setPhase("globe"), PORTAL_CUES_MS.globe),
      setTimeout(() => setPhase("approach"), PORTAL_CUES_MS.approach),
      setTimeout(() => setPhase("portal"), PORTAL_CUES_MS.portal),
      setTimeout(() => setPhase("reveal"), PORTAL_CUES_MS.reveal),
      setTimeout(() => setPhase("ready"), PORTAL_CUES_MS.ready),
    ];
    return clearTimers;
  }, [sequence, reduceMotion, clearTimers]);

  const skip = useCallback(() => {
    clearTimers();
    setPhase("ready");
  }, [clearTimers]);

  const move = useCallback((direction) => {
    if (!isReady) return;
    setSelectedIndex((current) => normalizePortalIndex(current + direction, DESTINATIONS.length));
  }, [isReady]);

  const enter = useCallback(() => {
    if (!isReady) return;
    if (chosen.href) router.push(chosen.href);
  }, [isReady, chosen.href, router]);

  const onPointerDown = (event) => {
    if (!isReady) return;
    didSwipe.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!isReady || !start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      // On touch devices a click can follow pointerup. Avoid overriding
      // the chosen adjacent card with the tapped card after a deliberate swipe.
      didSwipe.current = true;
      move(dx < 0 ? 1 : -1);
    }
  };

  const phaseDescription = phase === "brand" ? copy.brand
    : phase === "globe" ? copy.globe
      : phase === "approach" ? copy.approach
        : phase === "portal" ? copy.portal
          : phase === "reveal" ? copy.reveal : copy.ready;

  return (
    <main className={styles.scene} data-theme={chosen.id} data-phase={phase}
      style={{
        "--accent": chosen.color,
        "--sky-1": chosen.sky[0],
        "--sky-2": chosen.sky[1],
        "--sky-3": chosen.sky[2],
      }}>
      <div key={chosen.id} className={styles.backdrop} aria-hidden="true" />
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.horizon} aria-hidden="true" />
      <div key={chosen.id} className={styles.ambientScene} aria-hidden="true">
        {BACKGROUND_SYMBOLS[chosen.id].map((symbol, i) => (
          <span key={i} className={styles.ambientSymbol} data-position={i}>{symbol}</span>
        ))}
      </div>

      <header className={styles.header}>
        <div className={styles.brand}><span>♥</span> MeetYou<strong>Live</strong></div>
        <div className={styles.brandTag}>{copy.brandTag}</div>
        <h1>{copy.welcome}</h1>
        <p>{copy.subtitle}</p>
        {!isReady && (
          <button type="button" className={styles.skip} onClick={skip}>{copy.skip}</button>
        )}
      </header>

      <section
        className={styles.stage}
        tabIndex={0}
        aria-label={copy.choose}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerStart.current = null; didSwipe.current = false; }}
      >
        <WorldGlobe
          stage={phase}
          isReady={isReady}
          selected={selectedIndex === 0}
          label={`${copy.world[0]} — ${copy.world[1]}`}
          onSelect={() => {
            if (didSwipe.current) { didSwipe.current = false; return; }
            if (isReady) setSelectedIndex(0);
          }}
        />
        {showCards && (
          <div className={styles.orbitDeck} aria-label={copy.choose}>
            {DESTINATIONS.slice(1).map((item, i) => {
              const optionIndex = i + 1;
              const isSelected = optionIndex === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.card}
                  data-selected={isSelected ? "yes" : "no"}
                  style={{
                    ...getPortalCardStyle(optionIndex, selectedIndex, DESTINATIONS.length),
                    "--card-color": item.color,
                    "--reveal-delay": (i * 380) + "ms",
                  }}
                  onClick={() => {
                    if (didSwipe.current) { didSwipe.current = false; return; }
                    if (isReady) setSelectedIndex(optionIndex);
                  }}
                  disabled={!isReady}
                  aria-pressed={isSelected}
                >
                  <span className={styles.cardIcon}>{item.icon}</span>
                  <span className={styles.cardName}>{copy[item.id][0]}</span>
                  {isSelected && <span className={styles.cardHint}>{copy[item.id][1]}</span>}
                  {item.coming && <span className={styles.cardBadge}>{copy.coming}</span>}
                  {item.beta && <span className={styles.cardBadge}>{copy.beta}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className={styles.controls}>
        <p className={styles.phaseLabel} aria-live="polite">{phaseDescription}</p>
        {isReady ? (
          <>
            <div className={styles.arrowRow}>
              <button type="button" onClick={() => move(-1)} aria-label={copy.previous}>‹</button>
              <p>{copy.choose}</p>
              <button type="button" onClick={() => move(1)} aria-label={copy.next}>›</button>
            </div>
            <div className={styles.choiceDetails} aria-live="polite">
              <strong>{choice[0]}</strong>
              <span>{choice[1]}</span>
            </div>
            <button type="button" className={styles.enterButton} onClick={enter}
              disabled={!chosen.href}>
              {chosen.href ? copy.enter + " " + choice[0] : copy.notReady}
              {chosen.href && <span aria-hidden="true"> →</span>}
            </button>
          </>
        ) : (
          <div key={sequence} className={styles.progressTrack}
            role="progressbar" aria-label={phaseDescription} aria-valuetext={phaseDescription}>
            <div className={styles.progressFill} style={{ "--intro-length": `${PORTAL_TIMELINE_MS.total}ms` }} />
          </div>
        )}
        <div className={styles.utilityRow}>
          <button type="button" onClick={() => { setSelectedIndex(0); setSequence((n) => n + 1); }}>
            ↻ {copy.replay}
          </button>
          <Link href="/dashboard">{copy.home} →</Link>
        </div>
      </div>
      <p className={styles.previewLabel}>{copy.previewTag}</p>
    </main>
  );
}
