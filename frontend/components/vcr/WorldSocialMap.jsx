"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  WORLD_MAP_DESTINATIONS, MIN_ZOOM, MAX_ZOOM, clampZoom,
  getVisibleTiles, panView, groupVisibleDestinations,
} from "@/lib/vcr/worldMapProjection.mjs";
import styles from "./WorldSocialMap.module.css";

// Preview cartography uses OSM's human-viewed raster tiles only. For any
// high-traffic public rollout, review provider terms, cost, attribution and
// a sustainable tile host first. No user locations or profiles go to OSM.
const TILE_ENDPOINT = "https://tile.openstreetmap.org";
const COPY = {
  es: {
    overline: "WORLD · MAPA SOCIAL", subtitle: "Explora destinos alrededor del mundo",
    search: "Buscar un país", map: "Mapa interactivo mundial", countries: "Destinos",
    noMatches: "No encontramos ese destino en el piloto.", group: "destinos",
    selected: "Destino seleccionado", explore: "Explorar destino",
    empty: "Todavía no hay perfiles autorizados para aparecer en el mapa.",
    consent: "Las fotos de personas se mostrarán únicamente con su permiso. No se publica el GPS exacto.",
    unavailable: "Los mundos inmersivos todavía están en pruebas. Puedes explorar la entrada actual del destino.",
    preview: "Vista previa · Sin perfiles simulados", zoomIn: "Acercar mapa",
    zoomOut: "Alejar mapa", reset: "Ver el mundo", selectedDestination: "Destino",
    noDestination: "Elige un país en el mapa o en la lista",
    countriesNames: { us: "Estados Unidos", fr: "Francia", jp: "Japón", ae: "Emiratos Árabes", br: "Brasil", eg: "Egipto" },
  },
  en: {
    overline: "WORLD · SOCIAL MAP", subtitle: "Explore destinations across the world",
    search: "Search a country", map: "Interactive world map", countries: "Destinations",
    noMatches: "This destination is not in the pilot.", group: "destinations",
    selected: "Selected destination", explore: "Explore destination",
    empty: "No profiles have opted into appearing on this map yet.",
    consent: "People's photos will only appear with their permission. Exact GPS is never shared.",
    unavailable: "Immersive worlds are still in testing. You can explore the existing destination entrance.",
    preview: "Preview · No simulated profiles", zoomIn: "Zoom in",
    zoomOut: "Zoom out", reset: "View world", selectedDestination: "Destination",
    noDestination: "Choose a country on the map or in the list",
    countriesNames: { us: "United States", fr: "France", jp: "Japan", ae: "United Arab Emirates", br: "Brazil", eg: "Egypt" },
  },
  pt: {
    overline: "WORLD · MAPA SOCIAL", subtitle: "Explore destinos pelo mundo",
    search: "Buscar um país", map: "Mapa-múndi interativo", countries: "Destinos",
    noMatches: "Esse destino não faz parte do piloto.", group: "destinos",
    selected: "Destino selecionado", explore: "Explorar destino",
    empty: "Ainda não há perfis autorizados para aparecer no mapa.",
    consent: "Fotos de pessoas só aparecerão com permissão. O GPS exato nunca é divulgado.",
    unavailable: "Os mundos imersivos ainda estão em testes. Você pode explorar a entrada existente do destino.",
    preview: "Prévia · Sem perfis simulados", zoomIn: "Aproximar",
    zoomOut: "Afastar", reset: "Ver o mundo", selectedDestination: "Destino",
    noDestination: "Escolha um país no mapa ou na lista",
    countriesNames: { us: "Estados Unidos", fr: "França", jp: "Japão", ae: "Emirados Árabes", br: "Brasil", eg: "Egito" },
  },
};
export const worldMapCopy = COPY;

export default function WorldSocialMap({ lang = "es", onExploreCountry, initialCountry = null }) {
  const copy = COPY[lang] || COPY.es;
  const mapRef = useRef(null);
  const pointers = useRef(new Map());
  const [size, setSize] = useState({ width: 390, height: 500 });
  const [view, setView] = useState({ lon: 0, lat: 9, zoom: 1 });
  const [selectedId, setSelectedId] = useState(initialCountry);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth || 390, height: element.clientHeight || 500 });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const filtered = useMemo(() => WORLD_MAP_DESTINATIONS.filter((place) => (
    copy.countriesNames[place.id].toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang))
  )), [copy, lang, query]);
  const tiles = useMemo(() => getVisibleTiles(view, size.width, size.height), [view, size]);
  const markers = useMemo(() => groupVisibleDestinations(filtered, view, size.width, size.height), [filtered, view, size]);
  const selected = WORLD_MAP_DESTINATIONS.find((place) => place.id === selectedId) || null;

  const selectCountry = (place) => {
    setSelectedId(place.id);
    setView((current) => ({ lon: place.lon, lat: place.lat, zoom: Math.max(current.zoom, 3) }));
  };
  const zoomBy = (delta) => setView((current) => ({ ...current, zoom: clampZoom(current.zoom + delta) }));
  const openCountryGroup = (group) => {
    // A group is a count of fixed destinations, not a count of users.
    const lon = group.places.reduce((sum, item) => sum + item.lon, 0) / group.places.length;
    const lat = group.places.reduce((sum, item) => sum + item.lat, 0) / group.places.length;
    setView((current) => ({ lon, lat, zoom: Math.max(3, clampZoom(current.zoom + 1)) }));
  };
  const pointerDown = (event) => {
    if (event.target.closest("button, a, input")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const pointerMove = (event) => {
    const prev = pointers.current.get(event.pointerId);
    if (!prev) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size === 1) {
      setView((current) => panView(current, next.x - prev.x, next.y - prev.y));
    } else if (pointers.current.size === 2) {
      const pair = [...pointers.current.values()];
      const distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      // Discrete pinch steps prevent excessive tile traffic while dragging.
      if (pointers.current.pinchDistance && distance / pointers.current.pinchDistance > 1.5) {
        zoomBy(1); pointers.current.pinchDistance = distance;
      } else if (pointers.current.pinchDistance && distance / pointers.current.pinchDistance < 0.67) {
        zoomBy(-1); pointers.current.pinchDistance = distance;
      } else if (!pointers.current.pinchDistance) {
        pointers.current.pinchDistance = distance;
      }
    }
  };
  const pointerUp = (event) => {
    pointers.current.delete(event.pointerId);
    pointers.current.pinchDistance = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section className={styles.root} aria-label={copy.map}>
      <div className={styles.top}>
        <div className={styles.titleBlock}><span>{copy.overline}</span><h2>{copy.subtitle}</h2></div>
        <span className={styles.preview}>{copy.preview}</span>
      </div>
      <label className={styles.search}>
        <span className={styles.searchIcon} aria-hidden="true">⌕</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.search} aria-label={copy.search} maxLength={70}/>
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
      </label>
      <div className={styles.map} ref={mapRef} role="group" aria-label={copy.map}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={pointerUp} onPointerCancel={pointerUp}
        onLostPointerCapture={pointerUp}
        onWheel={(event) => { if (Math.abs(event.deltaY) >= 1) zoomBy(event.deltaY < 0 ? 1 : -1); }}
        onDoubleClick={() => zoomBy(1)}>
        <div className={styles.tiles} aria-hidden="true">
          {tiles.map((tile) => (
            <img key={tile.key} src={`${TILE_ENDPOINT}/${tile.z}/${tile.x}/${tile.y}.png`}
              alt="" draggable={false} loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ left: tile.left, top: tile.top, width: 256, height: 256 }}/>
          ))}
        </div>
        <div className={styles.mapShade} aria-hidden="true"/>
        {markers.map((marker) => {
          if (marker.places.length > 1) {
            return <button key={marker.key} type="button"
              className={styles.cluster} style={{ left: marker.x, top: marker.y }}
              onClick={(event) => { event.stopPropagation(); openCountryGroup(marker); }}
              aria-label={`${marker.places.length} ${copy.group}: ${marker.places.map((item) => copy.countriesNames[item.id]).join(", ")}`}>
              <span className={styles.clusterFlags} aria-hidden="true">
                {marker.places.slice(0, 3).map((item) => <span key={item.id}>{item.flag}</span>)}
              </span>
              <span className={styles.clusterName}>{marker.places.length} {copy.group}</span>
            </button>;
          }
          const place = marker.places[0];
          return <button key={marker.key} type="button" aria-pressed={selectedId === place.id}
            className={selectedId === place.id ? styles.pinActive : styles.pin}
            style={{ left: marker.x, top: marker.y }}
            onClick={(event) => { event.stopPropagation(); selectCountry(place); }}
            aria-label={`${copy.selectedDestination}: ${copy.countriesNames[place.id]}`}>
            <span className={styles.pinFlag} aria-hidden="true">{place.flag}</span>
            <span className={styles.pinName}>{copy.countriesNames[place.id]}</span>
          </button>;
        })}
        <div className={styles.mapControls}>
          <button type="button" aria-label={copy.zoomIn} disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(1)}>+</button>
          <button type="button" aria-label={copy.zoomOut} disabled={view.zoom <= MIN_ZOOM} onClick={() => zoomBy(-1)}>−</button>
          <button type="button" aria-label={copy.reset} onClick={() => setView({ lon: 0, lat: 9, zoom: 1 })}>◎</button>
        </div>
        <div className={styles.attribution}><a target="_blank" rel="noreferrer"
          href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></div>
      </div>
      <div className={styles.destinations}>
        <div className={styles.sectionHeading}><strong>{copy.countries}</strong><span>{WORLD_MAP_DESTINATIONS.length} {lang === "en" ? "pilot destinations" : lang === "pt" ? "destinos-piloto" : "destinos piloto"}</span></div>
        {filtered.length ? <div className={styles.countryRow}>
          {filtered.map((place) => <button key={place.id} type="button" aria-pressed={selectedId === place.id}
            className={selectedId === place.id ? styles.countryActive : styles.country}
            onClick={() => selectCountry(place)}>
            <span aria-hidden="true">{place.flag}</span><span>{copy.countriesNames[place.id]}</span>
          </button>)}
        </div> : <p className={styles.emptySearch}>{copy.noMatches}</p>}
      </div>
      <div className={styles.actionPanel}>
        <div className={styles.selection}>
          <span>{selected ? copy.selected : copy.noDestination}</span>
          {selected && <strong>{selected.flag} {copy.countriesNames[selected.id]}</strong>}
        </div>
        <button type="button" className={styles.enter} disabled={!selected}
          onClick={() => selected && onExploreCountry?.(selected.id)}>{copy.explore} <span aria-hidden="true">→</span></button>
      </div>
      <div className={styles.notice} role="status"><span aria-hidden="true">♡</span>
        <div><p>{copy.empty}</p><small>{copy.consent}</small><small>{copy.unavailable}</small></div>
      </div>
    </section>
  );
}
