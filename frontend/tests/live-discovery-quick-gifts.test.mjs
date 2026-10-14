import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("discovery puts accessible filters and active streams ahead of secondary sections", async () => {
  const source = await read("../app/live/page.jsx");
  const filters = source.indexOf('<section className="discover-panel"');
  const active = source.indexOf('<section id="active-lives"');
  assert.ok(filters < active);
  assert.ok(active < source.indexOf('<section className="featured-section"'));
  assert.ok(active < source.indexOf('<section className="creators-section"'));
  assert.ok(active < source.indexOf("<LiveActivityFeed"));
  assert.match(source, /aria-pressed=\{activeFilter === filter\.id\}/);
  assert.match(source, /className="hero-title-mobile">\{t\("nav.live"\)\}/);
  assert.match(source, /\.live-page :global\(\.hero-start\)/);
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
  const header = source.match(/\.creator-header-bar\s*{\s*position: absolute;([^}]+)}/)?.[1];
  assert.ok(header);
  assert.match(header, /rgba\(10,4,24,0\.46\)[\s\S]*transparent 100%/);
  assert.match(header, /backdrop-filter: none/);
  assert.match(header, /env\(safe-area-inset-top/);
  assert.match(source, /\.stage-title-caption \{ top: calc\(44px \+ env\(safe-area-inset-top/);
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
