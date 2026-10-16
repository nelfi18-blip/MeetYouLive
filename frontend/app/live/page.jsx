"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import LiveCard from "@/components/LiveCard";
import GiftPanel from "@/components/GiftPanel";
import EmptyState from "@/components/ui/EmptyState";
import { notify } from "@/lib/notify";
import { filterActiveLives } from "@/lib/liveFilters";
import { getDisplayName } from "@/lib/imageHelpers";
import { RECENT_LIVE_WINDOW_MINUTES, RECENT_LIVE_WINDOW_MS } from "@/lib/liveUi";
import { useLanguage } from "@/contexts/LanguageContext";
import socket from "@/lib/socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const POLL_INTERVAL_MS = 20000;

const FILTERS = [
  { id: "popular", labelKey: "liveDiscovery.filterPopular", icon: "🔥" },
  { id: "new", labelKey: "liveDiscovery.filterNew", icon: "✨" },
  { id: "near", labelKey: "liveDiscovery.filterNear", icon: "📍" },
  { id: "music", labelKey: "liveDiscovery.filterMusic", icon: "🎵", terms: ["musica", "música", "music"] },
  { id: "gaming", labelKey: "liveDiscovery.filterGaming", icon: "🎮", terms: ["gaming", "juegos", "games"] },
  { id: "lifestyle", labelKey: "liveDiscovery.filterLifestyle", icon: "🌙", terms: ["lifestyle", "vida", "chat"] },
  { id: "dating", labelKey: "liveDiscovery.filterDating", icon: "💕", terms: ["dating", "citas", "date"] },
  { id: "travel", labelKey: "liveDiscovery.filterTravel", icon: "✈️", terms: ["viajes", "travel", "trip"] },
  { id: "fitness", labelKey: "liveDiscovery.filterFitness", icon: "💪", terms: ["fitness", "gym", "fit"] },
  { id: "ai", labelKey: "liveDiscovery.filterAi", icon: "🤖", terms: ["ia", "ai", "inteligencia"] },
  { id: "all", labelKey: "liveDiscovery.filterAll", icon: "🌐" },
];

function normalizeLive(live) {
  return {
    ...live,
    title:
      typeof live.title === "string" && live.title.trim()
        ? live.title.trim()
        : "",
    viewerCount: Number.isFinite(Number(live.viewerCount)) ? Math.max(0, Number(live.viewerCount)) : 0,
    giftsTotal: Number.isFinite(Number(live.giftsTotal)) ? Math.max(0, Number(live.giftsTotal)) : 0,
  };
}

function isRecentLive(live) {
  const startedAt = live?.startedAt || live?.createdAt;
  if (!startedAt) return false;
  return Date.now() - new Date(startedAt).getTime() < RECENT_LIVE_WINDOW_MS;
}

function liveText(live) {
  return [
    live?.category,
    live?.title,
    live?.description,
    live?.language,
    live?.user?.username,
    live?.user?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasLocationHint(live) {
  return Boolean(
    live?.city ||
      live?.country ||
      live?.location ||
      live?.user?.city ||
      live?.user?.country ||
      live?.user?.location,
  );
}

export default function LivePage() {
  const { t } = useLanguage();
  const [lives, setLives] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("popular");
  const [search, setSearch] = useState("");
  const [token, setToken] = useState("");
  const [giftLive, setGiftLive] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const knownIdsRef = useRef(null);

  const fetchLives = async (isInitial = false) => {
    try {
      const res = await fetch(`${API_URL}/api/lives`);
      if (!res.ok) throw new Error(t("liveDiscovery.loadError"));
      const data = await res.json();
      const fresh = filterActiveLives(data)
        .filter((live) => live && live._id)
        .map(normalizeLive);
      const freshIds = fresh.map((live) => String(live._id));

      if (knownIdsRef.current === null) {
        knownIdsRef.current = freshIds;
        setLives(fresh);
      } else {
        const added = freshIds.filter((id) => !knownIdsRef.current.includes(id));
        const changed = added.length > 0 || fresh.length !== knownIdsRef.current.length;
        knownIdsRef.current = freshIds;
        if (changed) setLives(fresh);
        if (added.length > 0) {
          added.slice(0, 2).forEach((id) => {
            const live = fresh.find((item) => String(item._id) === id);
            if (!live) return;
            const username = getDisplayName(live.user);
            notify({
              icon: "🔥",
              message: t("liveDiscovery.liveStartedNotification").replace("{username}", username),
              href: `/live/${id}`,
              actionLabel: t("liveDiscovery.enterLiveShort"),
              duration: 7000,
              dedupKey: `live_poll_${id}`,
            });
          });
        }
      }
      setError("");
    } catch {
      if (isInitial) setError(t("liveDiscovery.loadListError"));
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    setToken(localStorage.getItem("token") || sessionStorage.getItem("token") || "");
    fetchLives(true);
    const pollTimer = setInterval(() => fetchLives(false), POLL_INTERVAL_MS);

    // Real-time nudge: when any live starts/ends, refetch immediately instead
    // of waiting up to POLL_INTERVAL_MS. Degrades gracefully to the poll
    // above for anonymous visitors (socket only connects for authenticated
    // sessions, see providers.jsx) or if the event is missed.
    let discoveryDebounce = null;
    const onDiscoveryChanged = () => {
      clearTimeout(discoveryDebounce);
      discoveryDebounce = setTimeout(() => fetchLives(false), 500);
    };
    socket.on("LIVE_DISCOVERY_CHANGED", onDiscoveryChanged);

    return () => {
      clearInterval(pollTimer);
      clearTimeout(discoveryDebounce);
      socket.off("LIVE_DISCOVERY_CHANGED", onDiscoveryChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedLives = useMemo(() => {
    return [...lives].sort((a, b) => {
      const scoreA = (a.viewerCount || 0) * 3 + (a.giftsTotal || 0) + (a.isTrending ? 100 : 0);
      const scoreB = (b.viewerCount || 0) * 3 + (b.giftsTotal || 0) + (b.isTrending ? 100 : 0);
      return scoreB - scoreA;
    });
  }, [lives]);

  const filteredLives = useMemo(() => {
    const selected = FILTERS.find((filter) => filter.id === activeFilter) || FILTERS[0];
    let result = [...lives];

    if (selected.id === "popular") {
      result = sortedLives;
    } else if (selected.id === "new") {
      result = result.filter(isRecentLive);
    } else if (selected.id === "near") {
      result = result.filter(hasLocationHint);
    } else if (selected.id !== "all") {
      result = result.filter((live) => selected.terms?.some((term) => liveText(live).includes(term)));
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((live) => liveText(live).includes(query));
    }

    return result;
  }, [activeFilter, lives, search, sortedLives]);

  const handleShare = async (live) => {
    if (!live?._id) return;
    const url = `${window.location.origin}/live/${live._id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: live.title || "MeetYouLive",
          text: t("liveDiscovery.shareText").replace("{username}", getDisplayName(live.user)),
          url,
        });
      } else {
        await navigator.clipboard?.writeText(url);
        notify({ icon: "🔗", message: t("liveDiscovery.linkCopied"), duration: 2500 });
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        notify({ icon: "⚠️", message: t("liveDiscovery.shareError"), duration: 2500 });
      }
    }
  };

  const openGiftPanel = (live) => {
    if (!live?.user?._id) return;
    setGiftLive(live);
  };

  const activeFilterLabel = t(FILTERS.find((filter) => filter.id === activeFilter)?.labelKey || "liveDiscovery.filterPopular");

  return (
    <div className="live-page">
      <header className="live-topbar">
        <h1>{t("nav.live")}</h1>
        <div className="live-topbar-actions">
          <button
            type="button"
            className={`live-topbar-icon${searchOpen ? " active" : ""}`}
            aria-label={t("liveDiscovery.searchAria")}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            ⌕
          </button>
          <Link href="/live/start" className="live-topbar-start">{t("liveDiscovery.startLive")}</Link>
        </div>
      </header>

      {error && <div className="banner-error">{error}</div>}

      <section className="discover-panel" aria-label={t("liveDiscovery.discoveryFiltersAria")}>
        {searchOpen && (
          <div className="search-wrap">
            <span>⌕</span>
            <input
              type="text"
              autoFocus
              aria-label={t("liveDiscovery.searchAria")}
              placeholder={t("liveDiscovery.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        <div className="filter-chips">
          {FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.id}
              className={`filter-chip${activeFilter === filter.id ? " active" : ""}`}
              aria-pressed={activeFilter === filter.id}
              onClick={() => setActiveFilter(filter.id)}
              title={filter.id === "near" ? t("liveDiscovery.nearTooltip") : undefined}
            >
              <span>{filter.icon}</span>
              {t(filter.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section id="active-lives" className="active-section" aria-label={`${t("liveDiscovery.activeRoomsHeading")} · ${activeFilterLabel}`}>
        {!loading && filteredLives.length > 0 && (
          <span className="section-count">
            {filteredLives.length} {filteredLives.length === 1 ? t("liveDiscovery.roomSingular") : t("liveDiscovery.roomPlural")}
          </span>
        )}

        <div className="streams-grid">
          {loading
            ? [...Array(6)].map((_, index) => <div key={index} className="skeleton card-skeleton" />)
            : filteredLives.map((live, index) => (
                <LiveCard
                  key={live._id}
                  live={live}
                  index={index}
                  token={token}
                  onShare={handleShare}
                  onGift={openGiftPanel}
                />
              ))}
        </div>

        {!loading && !error && lives.length === 0 && (
          <EmptyState
            compact
            icon="🎥"
            kicker={t("liveDiscovery.honestEmptyKicker")}
            title={t("liveDiscovery.emptyNoLivesTitle")}
            description={t("liveDiscovery.emptyNoLivesSubtitle")}
            action={<Link href="/live/start" className="live-topbar-start">{t("liveDiscovery.startLive")}</Link>}
            secondaryAction={<Link href="/explore" className="empty-secondary-action">{t("liveDiscovery.exploreCreators")}</Link>}
          />
        )}

        {!loading && !error && lives.length > 0 && filteredLives.length === 0 && (
          <EmptyState
            compact
            icon="🔎"
            kicker={t("liveDiscovery.honestEmptyKicker")}
            title={t("liveDiscovery.emptyResultsTitle")}
            description={
              activeFilter === "near"
                ? t("liveDiscovery.emptyNear")
                : activeFilter === "new"
                  ? t("liveDiscovery.emptyNew").replace("{minutes}", String(RECENT_LIVE_WINDOW_MINUTES))
                  : t("liveDiscovery.emptyDefault")
            }
          />
        )}
      </section>

      {giftLive?.user?._id && (
        <GiftPanel
          receiverId={giftLive.user._id}
          liveId={giftLive._id}
          context="live"
          onClose={() => setGiftLive(null)}
          onGiftSent={() => {
            notify({ icon: "🎁", message: t("liveDiscovery.giftSent"), duration: 2500 });
            setGiftLive(null);
          }}
        />
      )}

      <style jsx>{`
        .live-page {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        h1,
        h2,
        h3,
        p {
          margin: 0;
        }

        .live-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .live-topbar h1 {
          font-size: 1.5rem;
          font-weight: 950;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #fff, #f0abfc 48%, #67e8f9);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .live-topbar-actions {
          display: flex;
          align-items: center;
          gap: 0.55rem;
        }

        .live-topbar-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
          color: #67e8f9;
          font-weight: 900;
          font-size: 1rem;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .live-topbar-icon:hover,
        .live-topbar-icon.active {
          border-color: rgba(34,211,238,0.42);
          background: rgba(34,211,238,0.1);
        }

        .live-page :global(.live-topbar-start) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          text-decoration: none;
          min-height: 42px;
          padding: 0.6rem 1.1rem;
          font-size: 0.84rem;
          font-weight: 900;
          color: #fff;
          border: none;
          background: linear-gradient(135deg, #e040fb, #8b5cf6, #22d3ee);
          box-shadow: 0 0 22px rgba(224,64,251,0.3);
          cursor: pointer;
          white-space: nowrap;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .live-page :global(.live-topbar-start:hover) {
          transform: translateY(-2px);
          box-shadow: 0 0 28px rgba(34,211,238,0.22);
        }

        .empty-secondary-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          text-decoration: none;
          min-height: 42px;
          padding: 0.6rem 1.1rem;
          font-size: 0.84rem;
          font-weight: 900;
          color: #e9d5ff;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .empty-secondary-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 24px rgba(34,211,238,0.18);
        }

        .discover-panel {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .search-wrap {
          position: relative;
        }

        .search-wrap span {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #67e8f9;
          font-weight: 900;
        }

        .search-wrap input {
          width: 100%;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: var(--text);
          outline: none;
          padding: 0.72rem 1rem 0.72rem 2.7rem;
          font-weight: 700;
        }

        .search-wrap input:focus {
          border-color: rgba(34,211,238,0.42);
          box-shadow: 0 0 0 3px rgba(34,211,238,0.08);
        }

        .filter-chips {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding: 0.1rem 0.1rem 0.3rem;
          scrollbar-width: none;
          scroll-snap-type: x proximity;
        }

        .filter-chips::-webkit-scrollbar {
          display: none;
        }

        .filter-chip {
          flex: 0 0 auto;
          scroll-snap-align: start;
          display: inline-flex;
          align-items: center;
          gap: 0.38rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.11);
          background: rgba(255,255,255,0.045);
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 850;
          padding: 0.5rem 0.85rem;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .filter-chip:hover {
          transform: translateY(-1px);
          color: var(--text);
        }

        .filter-chip.active {
          color: #fff;
          border-color: rgba(224,64,251,0.52);
          background: linear-gradient(135deg, rgba(224,64,251,0.22), rgba(34,211,238,0.14));
          box-shadow: 0 0 22px rgba(224,64,251,0.16);
        }

        .active-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .section-count {
          align-self: flex-end;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 750;
          padding: 0.22rem 0.6rem;
        }

        .streams-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .banner-error {
          background: var(--error-bg);
          border: 1px solid rgba(248,113,113,0.35);
          color: var(--error);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 700;
        }

        .card-skeleton { min-height: 320px; border-radius: var(--radius); }

        @media (max-width: 900px) {
          .live-page { gap: 0.6rem; }
          .live-topbar h1 { font-size: 1.15rem; }
          .live-topbar-icon { width: 38px; height: 38px; }
          .live-page :global(.live-topbar-start) {
            min-height: 38px;
            padding: 0.5rem 0.85rem;
            font-size: 0.78rem;
          }
          .search-wrap input { min-height: 44px; padding-block: 0.55rem; }
          .filter-chips { gap: 0.4rem; padding-bottom: 0; }
          .filter-chip { min-height: 40px; padding: 0.4rem 0.7rem; }
          .section-count { font-size: 0.68rem; padding: 0.2rem 0.5rem; }
          .streams-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.6rem;
          }
          .card-skeleton { min-height: 230px; }

          /* Guarantee the last visible content (grid cards or the empty
             state) always clears the floating bottom nav/CTA instead of
             relying solely on the shared .main-content-bottom-nav padding. */
          .live-page {
            padding-bottom: 1rem;
          }

          .active-section {
            margin-bottom: calc(0.5rem + env(safe-area-inset-bottom));
          }
        }

        @media (max-width: 340px) {
          .streams-grid { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
    </div>
  );
}
