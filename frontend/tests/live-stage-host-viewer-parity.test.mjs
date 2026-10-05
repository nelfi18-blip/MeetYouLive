import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Regression suite for the HOST/VIEWER stage-overlay parity bug observed
// after #984: viewers correctly saw the modernized, clean stage design, but
// a host's long-lived broadcast tab kept rendering the pre-#984 overlays
// (EN VIVO / espectadores / Chat activo / bottom live badge) because the
// app never consumed the service worker's "a new build is ready" signal.
//
// These tests assert on the authored source (JSX markup + styled-jsx rules),
// consistent with the sibling live-stage-overlay-modernization.test.mjs.
const __dirname = dirname(fileURLToPath(import.meta.url));
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");
const gridPath = join(__dirname, "../components/MultiVideoGrid.jsx");
const swRegistrationPath = join(__dirname, "../components/ServiceWorkerRegistration.jsx");
const updateBannerPath = join(__dirname, "../components/AppUpdateBanner.jsx");
const layoutPath = join(__dirname, "../app/layout.jsx");

/** Extracts the markup between `<div className="video-wrap">` and its matching stage close. */
function extractStageBlock(source) {
  const start = source.indexOf('<div className="video-wrap">');
  assert.ok(start >= 0, "video-wrap stage block must exist");
  const end = source.indexOf('<div className="action-bar">', start);
  assert.ok(end > start, "action-bar must follow the stage block");
  return source.slice(start, end);
}

test("live stage: the stage surface markup is a single shared block, not duplicated/branched per isCreator", async () => {
  const source = await readFile(livePagePath, "utf8");
  const matches = source.match(/<div className="video-wrap">/g) || [];
  assert.equal(matches.length, 1, "there must be exactly one video-wrap stage block (no host-only/viewer-only duplicate)");
});

test("live stage: no legacy overlay markup (video-activity-pills/badge-live pulse/creator-chip) anywhere in the stage, for either role", async () => {
  const source = await readFile(livePagePath, "utf8");
  const stage = extractStageBlock(source);

  assert.doesNotMatch(stage, /video-activity-pills/, "legacy EN VIVO/espectadores/Chat activo pill row must not render inside the stage");
  assert.doesNotMatch(stage, /vap-live/, "legacy EN VIVO pill must not render inside the stage");
  assert.doesNotMatch(stage, /vap-viewers/, "legacy espectadores pill must not render inside the stage");
  assert.doesNotMatch(stage, /vap-chat/, "legacy permanent Chat activo pill must not render inside the stage");
  assert.doesNotMatch(stage, /badge badge-live pulse/, "legacy bottom EN VIVO badge must not render inside the stage");
  assert.doesNotMatch(stage, /className="creator-chip"/, "legacy floating host chip must not render inside the stage");
});

test("live stage: no isCreator-gated branch exists for the overlay-stack/video-overlay surface itself (shared by host and viewer)", async () => {
  const source = await readFile(livePagePath, "utf8");
  const stage = extractStageBlock(source);
  const overlayStackIdx = stage.indexOf('className="live-overlay-stack"');
  const videoOverlayIdx = stage.indexOf('className="video-overlay"');
  assert.ok(overlayStackIdx >= 0 && videoOverlayIdx >= 0, "overlay-stack and video-overlay must exist in the stage");

  // Neither block's opening tag is itself conditioned on isCreator (only
  // ephemeral inner content — e.g. the reconnecting pill — is conditional).
  const beforeOverlayStack = stage.slice(Math.max(0, overlayStackIdx - 120), overlayStackIdx);
  const beforeVideoOverlay = stage.slice(Math.max(0, videoOverlayIdx - 120), videoOverlayIdx);
  assert.doesNotMatch(beforeOverlayStack, /isCreator\s*\?/, "overlay-stack must render for both roles identically");
  assert.doesNotMatch(beforeVideoOverlay, /isCreator\s*\?/, "video-overlay must render for both roles identically");
});

test("live stage: host keeps its own controls outside the stage overlay (TRANSMITIENDO/Finalizar/Evento x2/Boost/VIP-only)", async () => {
  const source = await readFile(livePagePath, "utf8");
  const actionBarIdx = source.indexOf('<div className="action-bar">');
  assert.ok(actionBarIdx >= 0, "action-bar must exist");
  const actionBar = source.slice(actionBarIdx, actionBarIdx + 3500);

  assert.match(actionBar, /badge-broadcasting/, "broadcasting badge must exist for the host");
  assert.match(actionBar, /handleEndStream/, "Finalizar (end stream) control must exist for the host");
  assert.match(actionBar, /handleTriggerEvent\("x2_coins"\)/, "x2 event control must exist for the host");
  assert.match(actionBar, /handleTriggerEvent\("last_boost"\)/, "boost event control must exist for the host");
  assert.match(actionBar, /handleToggleVipOnly/, "VIP-only toggle must exist for the host");
});

test("live stage: viewer keeps its own controls (Enviar regalo / Reportar) outside the stage overlay", async () => {
  const source = await readFile(livePagePath, "utf8");
  const actionBarIdx = source.indexOf('<div className="action-bar">');
  const actionBar = source.slice(actionBarIdx, actionBarIdx + 3500);
  assert.match(actionBar, /btn-gift-cta/, "send-gift control must exist for the viewer");

  assert.match(source, /reportLabel=\{t\("common\.report"\)\}/, "Report control must still exist");
  assert.match(source, /!isCreator\s*&&\s*live\.user\?\._id\s*&&[\s\S]{0,200}<ModerationActions/, "Report/moderation stays viewer-only");
});

test("live stage: FloatingReactions remains viewer-only", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(source, /\{agoraJoined && !isCreator && <FloatingReactions \/>\}/);
});

test("live stage: GiftPanel keeps receiverId={live.user._id} (no per-participant gifting)", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(source, /<GiftPanel\s+receiverId=\{live\.user\._id\}/);
});

test("#983 multi-guest layouts (1/2/3/4 cameras) remain intact", async () => {
  const source = await readFile(gridPath, "utf8");
  for (const cls of ["grid-1", "grid-2", "grid-3", "grid-4"]) {
    assert.match(source, new RegExp(`\\.${cls}\\s*{`), `${cls} layout rule must still exist`);
  }
  assert.match(source, /if \(count === 1\) return "grid-1";/);
  assert.match(source, /if \(count === 2\) return "grid-2";/);
  assert.match(source, /if \(count === 3\) return "grid-3";/);
  assert.match(source, /return "grid-4";/);
});

test("root cause guard: the sw-update-ready signal now has a real UI consumer (AppUpdateBanner)", async () => {
  const swSource = await readFile(swRegistrationPath, "utf8");
  assert.match(
    swSource,
    /dispatchEvent\(new Event\("meetyoulive:sw-update-ready"\)\)/,
    "ServiceWorkerRegistration must still dispatch the update-ready signal"
  );

  const bannerSource = await readFile(updateBannerPath, "utf8");
  assert.match(
    bannerSource,
    /addEventListener\("meetyoulive:sw-update-ready"/,
    "AppUpdateBanner must listen for the update-ready signal dispatched by ServiceWorkerRegistration"
  );

  const layoutSource = await readFile(layoutPath, "utf8");
  assert.match(layoutSource, /<AppUpdateBanner \/>/, "AppUpdateBanner must be mounted application-wide (app/layout.jsx)");
});

test("root cause guard: the update banner never auto-reloads (user-triggered only, so an active host broadcast is never interrupted)", async () => {
  const bannerSource = await readFile(updateBannerPath, "utf8");
  assert.doesNotMatch(bannerSource, /useEffect\([^)]*window\.location\.reload/s, "reload must not happen automatically inside an effect");
  assert.match(bannerSource, /onClick=\{\(\) => window\.location\.reload\(\)\}/, "reload must be gated behind an explicit user click");
});
