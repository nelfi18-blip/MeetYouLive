"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { isApprovedCreator } from "@/lib/creatorUtils";
import { getHomePath } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";
import { nextBottomNavOnScroll } from "@/lib/navigation/scrollAwareBottomNav.mjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const getBearerHeader = (token) => ["Bearer", token].join(" ");
// Treat the public root and dashboard as Home states while preserving
// the role-aware Home link returned by getHomePath().
const HOME_ACTIVE_PATHS = new Set(["/", "/dashboard"]);

export default function BottomNavEnhanced() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t, lang } = useLanguage();
  const [viewerRole, setViewerRole] = useState("");
  const [viewerCreatorStatus, setViewerCreatorStatus] = useState("");
  const [worldPressed, setWorldPressed] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const scrollStateRef = useRef({ hidden: false, travel: 0, previousY: 0 });

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token || pathname === "/nav-preview") return;

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: getBearerHeader(token) },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setViewerRole(d.role || "");
          setViewerCreatorStatus(d.creatorStatus || "");
        }
      })
      .catch(() => {});
  }, [session, pathname]);

  const canGoLive = useMemo(
    () => Boolean(session?.user) && isApprovedCreator({ role: viewerRole, creatorStatus: viewerCreatorStatus }),
    [session?.user, viewerCreatorStatus, viewerRole]
  );
  const homePath = useMemo(
    () => (canGoLive ? "/creator" : getHomePath(viewerRole) || "/dashboard"),
    [canGoLive, viewerRole]
  );

  const worldLabel = lang === "en" ? "World" : "Mundo";
  const worldAria = lang === "en" ? "Open MeetYouLive universe" : lang === "pt" ? "Abrir o universo MeetYouLive" : "Abrir el universo MeetYouLive";

  const isActive = (path) => {
    if (path === homePath) return HOME_ACTIVE_PATHS.has(pathname) || pathname === homePath;
    return pathname?.startsWith(path);
  };


  useEffect(() => {
    // Route changes always restore the five actions.
    const y = Math.max(0, window.scrollY || document.scrollingElement?.scrollTop || 0);
    scrollStateRef.current = { hidden: false, travel: 0, previousY: y };
    setNavHidden(false);
    setWorldPressed(false);
  }, [pathname]);

  useEffect(() => {
    const y = Math.max(0, window.scrollY || document.scrollingElement?.scrollTop || 0);
    scrollStateRef.current = { hidden: false, travel: 0, previousY: y };
    setNavHidden(false);

    const onScroll = () => {
      if (window.innerWidth > 1024) {
        scrollStateRef.current = { hidden: false, travel: 0, previousY: window.scrollY || 0 };
        setNavHidden(false);
        return;
      }
      const active = document.activeElement;
      const focusedNav = Boolean(active?.closest?.(".bottom-nav-enhanced") && active?.matches?.(":focus-visible"));
      const editing = Boolean(active?.matches?.("input, textarea, select, [contenteditable='true']"));
      const scroller = document.scrollingElement || document.documentElement;
      const next = nextBottomNavOnScroll({
        scrollY: Math.max(0, window.scrollY || scroller.scrollTop || 0),
        previousY: scrollStateRef.current.previousY,
        travel: scrollStateRef.current.travel,
        hidden: scrollStateRef.current.hidden,
        totalHeight: scroller.scrollHeight,
        viewportHeight: window.innerHeight,
        interactionLocked: focusedNav || editing,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      scrollStateRef.current = next;
      setNavHidden(current => current === next.hidden ? current : next.hidden);
    };
    const onResize = () => {
      const yNow = Math.max(0, window.scrollY || document.scrollingElement?.scrollTop || 0);
      scrollStateRef.current = { hidden: false, travel: 0, previousY: yNow };
      setNavHidden(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [pathname]);

  return (
    <nav
      className={"bottom-nav-enhanced" + (navHidden ? " bottom-nav-enhanced--concealed" : "")}
      aria-label="Premium MeetYouLive navigation"
      aria-hidden={navHidden}
    >
        <Link href={homePath} className={`nav-item ${isActive(homePath) ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5 10.5V20h14v-9.5" />
            <path d="M9.5 20v-5h5v5" />
          </svg>
          <span className="nav-label">{t("nav.home")}</span>
        </Link>

        <Link href="/feed" className={`nav-item ${isActive("/feed") || isActive("/explore") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 4 7l8 4 8-4-8-4Z" />
            <path d="m4 12 8 4 8-4" />
            <path d="m4 17 8 4 8-4" />
          </svg>
          <span className="nav-label">{t("nav.discover")}</span>
        </Link>

        <Link
          href="/universe"
          className="nav-item-create nav-world-entry"
          aria-label={worldAria}
          data-world-center="true"
          data-pressed={worldPressed ? "true" : "false"}
          onPointerDown={() => setWorldPressed(true)}
          onPointerUp={() => setWorldPressed(false)}
          onPointerCancel={() => setWorldPressed(false)}
          onPointerLeave={() => setWorldPressed(false)}
          onKeyDown={(event) => { if (event.key === "Enter") setWorldPressed(true); }}
          onKeyUp={() => setWorldPressed(false)}
          onBlur={() => setWorldPressed(false)}
        >
          <span className="nav-world-globe" aria-hidden="true">
            <svg viewBox="0 0 52 52" width="43" height="43" fill="none">
              <defs>
                <radialGradient id="navWorldOcean" cx="27%" cy="20%" r="84%">
                  <stop offset="0%" stopColor="#b4faff" />
                  <stop offset="45%" stopColor="#2aa5ea" />
                  <stop offset="100%" stopColor="#26338f" />
                </radialGradient>
              </defs>
              <circle cx="26" cy="26" r="20" fill="url(#navWorldOcean)" stroke="#dcfaff" strokeWidth="1.5" />
              <path d="m13 14 9-3 7 6-2 7-7 1-2 9-6-6-2-8Z" fill="#81f1bb" />
              <path d="m31 14 9 3 5 10-7 5-4 9-5-4 1-8-4-7Z" fill="#7ee9bc" />
              <path d="M11 16c7-9 20-12 29-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".78" />
              <ellipse cx="26" cy="26" rx="25" ry="9" transform="rotate(-23 26 26)" stroke="#f39aff" strokeWidth="2.4" />
            </svg>
          </span>
          <span className="create-live-label nav-world-label">{worldLabel}</span>
        </Link>

        <Link href="/chats" className={`nav-item ${isActive("/chats") ? "active" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
            <path d="M8 9h8M8 13h5" />
          </svg>
          <span className="nav-label">{t("nav.chats")}</span>
        </Link>

        <Link
          href="/profile"
          className={`nav-item ${isActive("/profile") ? "active" : ""}`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
          </svg>
          <span className="nav-label">{t("nav.profile")}</span>
        </Link>
    </nav>
  );
}
