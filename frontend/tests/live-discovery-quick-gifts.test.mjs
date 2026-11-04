import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("discovery exposes accessible search and filters before the active streams", async () => {
  const source = await read("../app/live/page.jsx");
  const filters = source.indexOf('<section className="discover-panel"');
  const active = source.indexOf('<section id="active-lives"');
  assert.ok(filters >= 0 && active > filters);
  assert.doesNotMatch(source, /<section className="(?:featured|creators)-section"|<LiveActivityFeed/);
  assert.match(source, /aria-label=\{t\("liveDiscovery\.discoveryFiltersAria"\)\}/);
  assert.match(source, /aria-expanded=\{searchOpen\}/);
  assert.match(source, /aria-label=\{t\("liveDiscovery\.searchAria"\)\}/);
  assert.match(source, /onClick=\{\(\) => setActiveFilter\(filter\.id\)\}/);
  assert.match(source, /filteredLives\.map\(\(live, index\) => \([\s\S]*?<LiveCard/);
  assert.match(source, /aria-pressed=\{activeFilter === filter\.id\}/);
  assert.match(source, /<h1>\{t\("nav.live"\)\}<\/h1>/);
  assert.match(source, /\.live-page :global\(\.live-topbar-start\)/);
  assert.match(source, /@media \(max-width: 900px\)[\s\S]*?\.streams-grid\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(source, /@media \(max-width: 340px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test("compact cards retain real identity, viewer and battle indicators without stream playback", async () => {
  const source = await read("../components/LiveCard.jsx");
  assert.match(source, /loading="lazy" decoding="async"/);
  assert.doesNotMatch(source, /<video|agora-rtc/);
  assert.match(source, /className="live-username">@\{username\}/);
  assert.match(source, /className="live-stat-chip viewer-pulse">👁 \{safeViewerCount\}/);
  assert.match(source, /isBattle && <span className="live-vs-badge"/);
  assert.match(source, /aspect-ratio: 3 \/ 4/);
  assert.match(source, /\.live-card :global\(\.live-card-link:focus-visible\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});

test("mobile header uses localized contrast without a frosted video surface and keeps safe areas", async () => {
  const source = await read("../app/live/[id]/page.jsx");
  const header = source.match(/@media \(max-width: 900px\)\s*{\s*\.creator-header-bar\s*{([^}]*backdrop-filter: none;[^}]+)}/)?.[1];
  assert.ok(header);
  assert.match(header, /rgba\(10,4,24,0\.46\)[\s\S]*transparent 100%/);
  assert.match(header, /backdrop-filter: none/);
  assert.match(header, /env\(safe-area-inset-top/);
  assert.match(header, /flex-shrink: 0/);
  assert.match(source, /\.stage-header-overlay\s*{\s*display: flex;\s*flex-direction: column;\s*position: absolute;\s*top: 0/);
  const caption = source.match(/@media \(max-width: 900px\)\s*{\s*\.stage-title-caption\s*{([^}]+)}/)?.[1];
  assert.ok(caption);
  assert.match(caption, /display: block/);
  assert.doesNotMatch(caption, /position: absolute|\btop:/);
});

test("quick gifts reuse the single GiftPanel catalog, selection, confirmation and send handler", async () => {
  const source = await read("../components/GiftPanel.jsx");
  const quick = source.slice(source.indexOf("{compact && quickGiftTarget"), source.indexOf("{!compact && <>"));
  assert.match(quick, /createPortal/);
  assert.match(quick, /gifts\.map\(\(gift\)/);
  assert.match(quick, /gift\.coinCost\.toLocaleString/);
  assert.match(quick, /onExpand\?\.\(\);\s*handleSelectGift\(gift\)/);
  assert.match(quick, /onClick=\{onExpand\} aria-label=\{t\("giftPanel.panelAria"\)\}/);
  assert.doesNotMatch(quick, /fetch\(|\/api\/gifts/);
  assert.equal((source.match(/\/api\/gifts\/send/g) || []).length, 1);
  assert.match(source, /onClick=\{handleConfirmSend\}/);
  assert.match(source, /receiverId: effectiveReceiverId/);
  assert.match(source, /overflow-x: auto/);
  assert.match(source, /scroll-snap-type: x proximity/);
});

test("Live keeps one persistent GiftPanel and hides quick gifts while typing or hosting", async () => {
  const source = await read("../app/live/[id]/page.jsx");
  assert.equal((source.match(/<GiftPanel\s/g) || []).length, 1);
  assert.match(source, /!isCreator && \(\s*<div className="quick-gift-slot" ref=\{setQuickGiftTarget\} hidden=\{chatInputFocused\}/);
  assert.match(source, /compact=\{!showGiftPanel\}/);
  assert.match(source, /quickGiftTarget=\{quickGiftTarget\}/);
  assert.match(source, /recipients=\{giftRecipients\}/);
  assert.match(source, /onGiftSent=\{handleGiftSent\}/);
});
