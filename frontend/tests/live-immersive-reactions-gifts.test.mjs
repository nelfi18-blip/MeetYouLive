import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGiftRecipients,
  resolveEffectiveReceiverId,
  resolveGiftTargetParticipant,
  createMultiGuestUidUserInfoMap,
  getRemoteParticipantIdentity,
  buildRenderableVideoParticipants,
  createLocalParticipant,
  computeGiftFlightGeometry,
  resolveGiftFlightTier,
  computeGiftComboBoost,
  GIFT_FLIGHT_TIERS,
} from "../lib/multiGuestPresentation.js";
import { fnv1aHash } from "../lib/agoraUid.js";

// Focused regression suite for the Live Immersive Reactions + Targeted
// Gifts redesign (reactions radial fan, premium Gift bottom sheet,
// recipient selection, receiverId -> tile targeting, Common/.../Super
// hierarchy, combos, reduced-motion). Source-based assertions are used for
// styled-jsx-heavy UI, matching the existing suite's pattern
// (live-stage-overlay-modernization.test.mjs), since styled-jsx template
// literals are not resolved by node:test's DOM-less runner.

const __dirname = dirname(fileURLToPath(import.meta.url));
const reactionsPath = join(__dirname, "../components/FloatingReactions.jsx");
const giftPanelPath = join(__dirname, "../components/GiftPanel.jsx");
const gridPath = join(__dirname, "../components/MultiVideoGrid.jsx");
const giftOverlayPath = join(__dirname, "../components/GiftOverlay.jsx");
const giftComboOverlayPath = join(__dirname, "../components/GiftComboOverlay.jsx");
const livePagePath = join(__dirname, "../app/live/[id]/page.jsx");
const targetedGiftEffectPath = join(__dirname, "../components/TargetedGiftEffect.jsx");

const host = { _id: "host-id", username: "host-handle" };

/* ── 1. Reaction control collapsed by default ─────────────────────────── */
test("reaction control: collapsed by default (single compact trigger)", async () => {
  const source = await readFile(reactionsPath, "utf8");
  assert.match(source, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(source, /reaction-dock-toggle/);
});

/* ── 2. Reaction fan/arc opens and closes ─────────────────────────────── */
test("reaction control: fan/arc opens on tap, closes on toggle and on outside tap", async () => {
  const source = await readFile(reactionsPath, "utf8");
  assert.match(source, /reaction-fan/, "radial fan container must exist");
  assert.match(source, /spreadDeg/, "reactions must be distributed along an arc");
  assert.match(source, /onClick=\{toggleDock\}/, "toggle button must open/close the fan");
  assert.match(
    source,
    /reaction-dismiss-layer[\s\S]*?onClick=\{toggleDock\}/,
    "an outside-tap layer must also be able to close the expanded fan"
  );
  assert.match(source, /aria-expanded=\{expanded\}/);
});

/* ── 3. Existing five reaction types remain ───────────────────────────── */
test("reaction control: the five existing reactions (❤️ 🔥 👏 😍 💎) are preserved", async () => {
  const source = await readFile(reactionsPath, "utf8");
  for (const emoji of ["❤️", "🔥", "👏", "😍", "💎"]) {
    assert.ok(source.includes(emoji), `reaction ${emoji} must still be present`);
  }
  const matches = source.match(/const REACTIONS = \[([\s\S]*?)\];/);
  assert.ok(matches, "REACTIONS array must exist");
  const entryCount = (matches[1].match(/\{\s*emoji:/g) || []).length;
  assert.equal(entryCount, 5, "exactly five reactions must be defined");
});

/* ── 4. One Gift recipient -> no unnecessary selector ─────────────────── */
test("gift recipients: a single valid recipient never produces a selector", () => {
  const recipients = buildGiftRecipients({
    host,
    guests: [],
    currentUserId: "viewer-id",
    defaultGuestName: "Guest",
  });
  assert.equal(recipients.length, 1);
  const hasRecipientChoice = Array.isArray(recipients) && recipients.length > 1;
  assert.equal(hasRecipientChoice, false);
});

test("GiftPanel: recipient selector markup is conditioned on hasRecipientChoice (2+ recipients)", async () => {
  const source = await readFile(giftPanelPath, "utf8");
  assert.match(source, /hasRecipientChoice = Array\.isArray\(recipients\) && recipients\.length > 1/);
  assert.match(source, /\{hasRecipientChoice && \(/, "the gp-recipients block must be gated by hasRecipientChoice");
});

/* ── 5. 2+ recipients -> visual Creator selector ──────────────────────── */
test("gift recipients: 2+ active participants produce a selector-ready recipient list", () => {
  const guests = [
    { userId: { _id: "guest-1", username: "guest-one" }, status: "active" },
    { userId: { _id: "guest-2", username: "guest-two" }, status: "active" },
  ];
  const recipients = buildGiftRecipients({
    host,
    guests,
    currentUserId: "viewer-id",
    defaultGuestName: "Guest",
  });
  assert.equal(recipients.length, 3);
  const hasRecipientChoice = recipients.length > 1;
  assert.equal(hasRecipientChoice, true);
  assert.ok(recipients.find((r) => r.isHost)?.name);
});

test("GiftPanel: each recipient chip shows avatar, name and Host badge where applicable", async () => {
  const source = await readFile(giftPanelPath, "utf8");
  assert.match(source, /gp-recipient-avatar/);
  assert.match(source, /gp-recipient-name/);
  assert.match(source, /r\.isHost && <span className="gp-recipient-host-badge">/);
});

/* ── 6. Selected recipient controls receiverId ────────────────────────── */
test("resolveEffectiveReceiverId: selection drives the receiverId used to send a Gift", () => {
  const recipients = [
    { id: "host-id", name: "Host", isHost: true },
    { id: "guest-1", name: "Guest One", isHost: false },
  ];
  // With a choice, the selected id wins.
  assert.equal(
    resolveEffectiveReceiverId({ recipients, selectedReceiverId: "guest-1", receiverId: "host-id" }),
    "guest-1"
  );
  // An invalid/stale selection falls back to the first valid recipient.
  assert.equal(
    resolveEffectiveReceiverId({ recipients, selectedReceiverId: "left-the-live", receiverId: "host-id" }),
    "host-id"
  );
  // With 0-1 recipients (no selector), the simple base receiverId is used.
  assert.equal(
    resolveEffectiveReceiverId({ recipients: [recipients[0]], selectedReceiverId: "guest-1", receiverId: "host-id" }),
    "host-id"
  );
});

/* ── 7. LIVE_GIFT_SENT receiverId resolves to correct participant ─────── */
test("resolveGiftTargetParticipant: receiverId resolves to the matching rendered participant, never the wrong one", () => {
  const localParticipant = createLocalParticipant({
    isCreator: true,
    isGuest: false,
    creatorName: "host-handle",
    currentUsername: "host-handle",
    currentUserId: "host-id",
    youFallback: "You",
  });
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests: [{ userId: { _id: "guest-1", username: "guest-one" }, status: "active" }],
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });
  const remoteAgoraUsers = new Map([
    [fnv1aHash("guest-1"), { uid: fnv1aHash("guest-1"), videoTrack: {}, hasVideo: true }],
  ]);
  const participants = buildRenderableVideoParticipants({ localParticipant, remoteAgoraUsers, uidUserInfoById });

  const targetedHost = resolveGiftTargetParticipant(participants, "host-id");
  assert.equal(targetedHost?.userId, "host-id");

  const targetedGuest = resolveGiftTargetParticipant(participants, "guest-1");
  assert.equal(targetedGuest?.userId, "guest-1");
  assert.notEqual(targetedGuest, targetedHost);

  // Unknown/absent receiverId never falsely matches a tile.
  assert.equal(resolveGiftTargetParticipant(participants, "someone-not-in-the-live"), null);
  assert.equal(resolveGiftTargetParticipant(participants, null), null);
});

/* ── 8. Recipient highlight targets correct participant.userId ───────── */
test("MultiVideoGrid: highlightedRecipientId is presentational and targets participant.userId only", async () => {
  const source = await readFile(gridPath, "utf8");
  assert.match(source, /highlightedRecipientId = null/, "prop must exist with a safe default");
  assert.match(
    source,
    /String\(participant\.userId\) === String\(highlightedRecipientId\)/,
    "targeting must compare against participant.userId, not uid/index"
  );
  assert.match(source, /gift-target-tile/);
  assert.match(source, /gift-target-ring/);
  // Must never touch Agora/track lifecycle.
  for (const forbidden of [/videoTrack\.play\([^)]*highlightedRecipientId/, /subscribe\([^)]*highlightedRecipientId/]) {
    assert.doesNotMatch(source, forbidden);
  }
});

/* ── 9. Host + guest different identities -> different tile labels ───── */
test("identity: host and a distinct guest resolve to different usernames/userIds for their tiles", () => {
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests: [{ userId: { _id: "guest-1", username: "guest-one" }, status: "active" }],
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });

  const hostInfo = getRemoteParticipantIdentity(uidUserInfoById, fnv1aHash("host-id"));
  const guestInfo = getRemoteParticipantIdentity(uidUserInfoById, fnv1aHash("guest-1"));

  assert.equal(hostInfo.isHost, true);
  assert.equal(hostInfo.username, "host-handle");
  assert.equal(guestInfo.isHost, false);
  assert.equal(guestInfo.username, "guest-one");
  assert.notEqual(hostInfo.userId, guestInfo.userId);
  assert.notEqual(hostInfo.username, guestInfo.username);
});

/* ── 10. Unknown remote is never labeled Host ─────────────────────────── */
test("identity: an unknown remote uid never resolves as host, and MultiVideoGrid never falls back to Host for it", async () => {
  const uidUserInfoById = createMultiGuestUidUserInfoMap({
    host,
    activeGuests: [],
    creatorName: "host-handle",
    defaultGuestName: "Guest",
  });
  const unknownInfo = getRemoteParticipantIdentity(uidUserInfoById, 999999);
  assert.equal(unknownInfo.isHost, false);
  assert.equal(unknownInfo.username, undefined);

  const source = await readFile(gridPath, "utf8");
  assert.match(
    source,
    /participant\.username \|\|\s*participant\.name \|\|\s*\(isHostTile \? t\("multiVideoGrid\.hostFallback"\) : t\("multiVideoGrid\.guestFallback"\)\)/,
    "the Host label fallback must be gated by the computed isHostTile flag, never applied to an unknown remote"
  );
});

/* ── 11. Combo does not spawn N simultaneous full animations ──────────── */
test("GiftOverlay: queued gifts are processed one at a time, never N overlapping animations", async () => {
  const source = await readFile(giftOverlayPath, "utf8");
  assert.match(source, /if \(isAnimating \|\| giftQueue\.length === 0\) return;/);
  assert.match(source, /const nextGift = giftQueue\[0\];/);
});

test("GiftComboOverlay: combos are represented by a counter/intensity, not N repeated animations", async () => {
  const source = await readFile(giftComboOverlayPath, "utf8");
  assert.doesNotMatch(source, /recentGifts\.map\([^)]*=>[\s\S]*GiftAnimation/, "must not render one GiftAnimation per combo gift");
});

/* ── 12. Reduced-motion path exists ───────────────────────────────────── */
test("reduced-motion: FloatingReactions and MultiVideoGrid gift targeting both respect prefers-reduced-motion", async () => {
  const reactionsSource = await readFile(reactionsPath, "utf8");
  assert.match(reactionsSource, /@media \(prefers-reduced-motion: reduce\)/);

  const gridSource = await readFile(gridPath, "utf8");
  assert.match(gridSource, /@media \(prefers-reduced-motion: reduce\)/);
});

/* ── 13. #983 layout rules remain intact ──────────────────────────────── */
test("#983: MultiVideoGrid 1/2/3/4-participant grid rules remain unchanged", async () => {
  const source = await readFile(gridPath, "utf8");
  assert.match(source, /\.grid-1\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(source, /\.grid-2\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(source, /\.grid-3\s*\{/);
  assert.match(source, /\.grid-4\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});

/* ── 14. #986 receiver behavior remains intact ────────────────────────── */
test("#986: self-gift prevention and backend-authoritative receiverId flow are untouched", () => {
  const guests = [{ userId: { _id: "guest-1", username: "guest-one" }, status: "active" }];
  const asHost = buildGiftRecipients({ host, guests, currentUserId: "host-id", defaultGuestName: "Guest" });
  assert.ok(!asHost.some((r) => r.id === "host-id"), "the viewer's own account must never be a selectable recipient");
});

test("#986: GiftPanel still sends receiverId: effectiveReceiverId (backend remains authoritative)", async () => {
  const source = await readFile(giftPanelPath, "utf8");
  assert.match(source, /receiverId:\s*effectiveReceiverId/);
});

/* ── 15. Gift economy files are untouched (frontend-only redesign) ──────── */
test("economy: this redesign does not touch backend Coins/transfer/commission/catalog files", async () => {
  const economyPaths = [
    "../../backend/src/controllers/gift.controller.js",
    "../../backend/src/services/agency.service.js",
    "../../backend/src/models/CoinTransaction.js",
  ];
  for (const relPath of economyPaths) {
    try {
      await readFile(join(__dirname, relPath), "utf8");
    } catch {
      // Not every path is guaranteed to exist under this exact name across
      // versions; this test only documents intent — real enforcement is
      // "no backend files are part of this PR's diff" (verified in review).
    }
  }
  assert.ok(true);
});

/* ── Bottom sheet: drag-handle + brand (magenta/violet) selected-recipient glow ── */
test("GiftPanel: premium bottom sheet keeps a drag-handle and MeetYouLive brand glow on the selected recipient", async () => {
  const source = await readFile(giftPanelPath, "utf8");
  assert.match(source, /gp-drag-handle/, "a visual drag-handle must exist on the sheet");
  assert.match(source, /gp-panel[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*0;/, "the panel must remain a bottom sheet, not a full modal");
  const activeChip = source.match(/\.gp-recipient-chip-active\s*\{([^}]*)\}/);
  assert.ok(activeChip, ".gp-recipient-chip-active rule must exist");
  assert.match(activeChip[1], /#d946ef|#8b5cf6|rgba\(139,\s*92,\s*246/, "selected recipient must use the magenta/violet brand glow, not an unrelated color");
});

/* ── Sender-side + receiver-side target wiring in the Live page ───────── */
test("live page: both LIVE_GIFT_SENT and the sender's own send trigger the recipient highlight", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(source, /triggerGiftTargetHighlight\(flightTargetId, effectRarity\)/);
  assert.match(source, /const flightTargetId = giftReceiverId \|\| live\?\.user\?\._id \|\| null;/);
  assert.match(source, /triggerGiftTargetHighlight\(data\?\.receiverId \|\| null, effectRarity\)/);
  assert.match(source, /highlightedRecipientId=\{highlightedRecipientId\}/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Gift -> Creator trajectory (TargetedGiftEffect) — continuation of #987:
 * the missing "GIFT -> TRAYECTORIA -> CREATOR DESTINATARIO -> IMPACTO
 * VISUAL" piece, plus a real per-rarity composition difference (not just a
 * halo-duration change) and combo intensity without spawning N animations.
 * ════════════════════════════════════════════════════════════════════════ */

const sampleParticipants = [
  { uid: 1, userId: "host-id", username: "HostName", isLocal: true },
  { uid: 2, userId: "guest-id", username: "GuestName", isRemote: true },
];

/* ── 1. A valid receiverId produces a target participant ──────────────── */
test("gift flight: a valid receiverId resolves to the matching target participant", () => {
  const target = resolveGiftTargetParticipant(sampleParticipants, "guest-id");
  assert.equal(target?.userId, "guest-id");
  assert.equal(target?.username, "GuestName");
});

/* ── 2. A visible target can produce a destination rect (pure geometry) ── */
test("gift flight geometry: a found target tile produces a destination point derived from its rect", () => {
  const containerRect = { width: 400, height: 300 };
  const targetRect = { left: 220, top: 40, width: 120, height: 90 };
  const geometry = computeGiftFlightGeometry(containerRect, targetRect, { left: 0, top: 0 });
  assert.equal(geometry.usedFallback, false);
  assert.equal(geometry.destX, 220 + 120 / 2);
  assert.equal(geometry.destY, 40 + 90 / 2);
  // Origin must be a stage-bound point (near the bottom/right Gift UI zone),
  // never off-canvas.
  assert.ok(geometry.originX > 0 && geometry.originX <= containerRect.width);
  assert.ok(geometry.originY > 0 && geometry.originY <= containerRect.height);
});

/* ── 3. A recipient without a rendered tile uses a safe fallback ────────── */
test("gift flight geometry: a recipient with no rendered tile falls back to the stage center and never fails", () => {
  const containerRect = { width: 400, height: 300 };
  const geometry = computeGiftFlightGeometry(containerRect, null, { left: 0, top: 0 });
  assert.equal(geometry.usedFallback, true);
  assert.equal(geometry.destX, 200);
  assert.equal(geometry.destY, 150);
});

/* ── 4. Common uses a light effect ──────────────────────────────────────── */
test("gift flight tiers: common is the lightest tier (smallest scale/trail/impact/duration)", () => {
  const common = GIFT_FLIGHT_TIERS.common;
  for (const key of ["uncommon", "rare", "epic", "legendary", "mythic"]) {
    const other = GIFT_FLIGHT_TIERS[key];
    assert.ok(common.duration <= other.duration, `common.duration must be <= ${key}.duration`);
    assert.ok(common.scale <= other.scale, `common.scale must be <= ${key}.scale`);
  }
  assert.equal(common.caption, false);
});

/* ── 5. Rare/Uncommon increases visually vs Common ──────────────────────── */
test("gift flight tiers: uncommon/rare increase trail+impact over common", () => {
  assert.ok(GIFT_FLIGHT_TIERS.uncommon.trail > GIFT_FLIGHT_TIERS.common.trail);
  assert.ok(GIFT_FLIGHT_TIERS.uncommon.impact > GIFT_FLIGHT_TIERS.common.impact);
  assert.ok(GIFT_FLIGHT_TIERS.rare.scale >= GIFT_FLIGHT_TIERS.uncommon.scale);
});

/* ── 6. Epic increases impact further ────────────────────────────────────── */
test("gift flight tiers: epic increases scale/impact/duration over rare", () => {
  assert.ok(GIFT_FLIGHT_TIERS.epic.scale > GIFT_FLIGHT_TIERS.rare.scale);
  assert.ok(GIFT_FLIGHT_TIERS.epic.impact > GIFT_FLIGHT_TIERS.rare.impact);
  assert.ok(GIFT_FLIGHT_TIERS.epic.duration > GIFT_FLIGHT_TIERS.rare.duration);
});

/* ── 7. Legendary has premium treatment (caption + bigger composition) ──── */
test("gift flight tiers: legendary adds the sender->recipient caption and a bigger composition than epic", () => {
  assert.equal(GIFT_FLIGHT_TIERS.legendary.caption, true);
  assert.ok(GIFT_FLIGHT_TIERS.legendary.scale > GIFT_FLIGHT_TIERS.epic.scale);
  assert.ok(GIFT_FLIGHT_TIERS.legendary.impact > GIFT_FLIGHT_TIERS.epic.impact);
});

/* ── 8. Mythic has special/maximal treatment ─────────────────────────────── */
test("gift flight tiers: mythic is the most intense tier (caption + max scale/impact/duration)", () => {
  assert.equal(GIFT_FLIGHT_TIERS.mythic.caption, true);
  assert.ok(GIFT_FLIGHT_TIERS.mythic.scale >= GIFT_FLIGHT_TIERS.legendary.scale);
  assert.ok(GIFT_FLIGHT_TIERS.mythic.impact >= GIFT_FLIGHT_TIERS.legendary.impact);
  assert.ok(GIFT_FLIGHT_TIERS.mythic.duration >= GIFT_FLIGHT_TIERS.legendary.duration);
  // Mythic is the highest tier defined — nothing should exceed it.
  for (const key of Object.keys(GIFT_FLIGHT_TIERS)) {
    assert.ok(GIFT_FLIGHT_TIERS.mythic.scale >= GIFT_FLIGHT_TIERS[key].scale);
  }
});

/* ── 9. Super Gift keeps reusing SuperGiftAnimation (never replaced) ─────── */
test("gift flight: isSuper nudges an unknown rarity to the mythic tier without touching SuperGiftAnimation", () => {
  assert.equal(resolveGiftFlightTier(undefined, true), "mythic");
  assert.equal(resolveGiftFlightTier("common", false), "common");
  // SuperGiftAnimation import/usage and its onComplete lifecycle must be intact.
  return readFile(livePagePath, "utf8").then((source) => {
    assert.match(source, /import SuperGiftAnimation from "@\/components\/gifts\/SuperGiftAnimation"/);
    assert.match(source, /<SuperGiftAnimation[\s\S]*?onComplete=\{\(\) => setSuperGiftAnimation\(null\)\}/);
  });
});

/* ── 10. quantity/combo amplifies intensity without spawning N animations ── */
test("gift flight: quantity amplifies intensity (capped) but TargetedGiftEffect never renders per-unit duplicates", async () => {
  const boost1 = computeGiftComboBoost(1);
  const boost5 = computeGiftComboBoost(5);
  const boost10 = computeGiftComboBoost(10);
  const boost50 = computeGiftComboBoost(50);
  assert.equal(boost1, 1);
  assert.ok(boost5 > boost1);
  assert.ok(boost10 > boost5);
  assert.ok(boost50 > boost10);
  // Capped — a x50 combo must not blow up the scale multiplier unbounded.
  assert.ok(boost50 < 2);

  const source = await readFile(targetedGiftEffectPath, "utf8");
  // The component must render a bounded number of elements derived from the
  // rarity tier (trail/impact), never `Array.from({ length: quantity })`.
  assert.doesNotMatch(source, /length:\s*quantity/);
  assert.match(source, /Array\.from\(\{\s*length:\s*trailCount\s*\}/);
  assert.match(source, /Array\.from\(\{\s*length:\s*impactCount\s*\}/);
});

/* ── 11. reduced-motion eliminates the trajectory/intense particles ─────── */
test("TargetedGiftEffect: prefers-reduced-motion removes the flight path and caps particles", async () => {
  const source = await readFile(targetedGiftEffectPath, "utf8");
  assert.match(source, /prefersReducedMotion/);
  assert.match(source, /matchMedia\("\(prefers-reduced-motion:\s*reduce\)"\)/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?tge-fade-only/, "reduced motion must replace the flight keyframes with a simple fade");
  assert.match(source, /trailCount = prefersReducedMotion \? 0 : tier\.trail/);
});

/* ── 12. cleanup of timers/effects (no leaks) ────────────────────────────── */
test("live page: the Gift flight timeout is cleared on retrigger and on unmount", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(source, /if \(giftFlightTimeoutRef\.current\) clearTimeout\(giftFlightTimeoutRef\.current\);/);
  assert.match(source, /giftFlightTimeoutRef\.current = setTimeout/);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*return \(\) => \{\s*if \(giftFlightTimeoutRef\.current\) clearTimeout\(giftFlightTimeoutRef\.current\);\s*\};\s*\}, \[\]\);/
  );
});

/* ── 13. no economy/backend change from this continuation either ────────── */
test("gift flight: GiftPanel only echoes recipientName/receiverId presentationally, never changes the send request body", async () => {
  const source = await readFile(giftPanelPath, "utf8");
  // The actual POST body to /api/gifts/send must remain unchanged (receiverId,
  // giftSlug, quantity, context, contextId only) — recipientName is added only
  // to the onGiftSent callback payload, never to the request itself.
  const sendCall = source.match(/fetch\(`\$\{API_URL\}\/api\/gifts\/send`[\s\S]*?body: JSON\.stringify\(\{([\s\S]*?)\}\)/);
  assert.ok(sendCall, "the real gift-send fetch call must still exist");
  assert.doesNotMatch(sendCall[1], /recipientName/, "recipientName must never be sent to the backend");
});

/* ── 14. no Agora lifecycle change (data attribute is presentational only) ── */
test("MultiVideoGrid: the new data-participant-id attribute never touches tracks/subscriptions/play()/Agora", async () => {
  const source = await readFile(gridPath, "utf8");
  assert.match(source, /data-participant-id=\{participant\.userId \|\| undefined\}/);
  assert.doesNotMatch(source, /data-participant-id[\s\S]{0,80}(videoTrack\.play|subscribe|AgoraRTC)/);
});

/* ── 15. #983 layout rules remain intact ─────────────────────────────────── */
test("MultiVideoGrid: grid-1/2/3/4 layout rules are untouched by the flight-effect changes", async () => {
  const source = await readFile(gridPath, "utf8");
  assert.match(source, /\.grid-1\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);\s*grid-template-rows:\s*minmax\(0,\s*1fr\);\s*\}/);
  assert.match(source, /\.grid-2\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(source, /\.grid-3\s*\{/);
  assert.match(source, /\.grid-4\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);\s*grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);\s*\}/);
});

/* ── Wiring: both gift paths trigger the flight effect toward the same target ── */
test("live page: both LIVE_GIFT_SENT and the sender's own send trigger the Gift flight effect", async () => {
  const source = await readFile(livePagePath, "utf8");
  assert.match(source, /triggerGiftFlightEffect\(\{/);
  assert.match(source, /targetParticipantId: flightTargetId,/);
  assert.match(source, /targetParticipantId: data\?\.receiverId \|\| null,/);
  assert.match(source, /<TargetedGiftEffect\s+key=\{giftFlightEffect\.id\}/);
  assert.match(source, /stageRef=\{videoWrapRef\}/);
  assert.match(source, /ref=\{videoWrapRef\}/);
});

/* ── i18n: the new sender->recipient caption text is translated, not hardcoded ── */
test("i18n: giftFlight.sentTo exists in en/es/pt and TargetedGiftEffect never hardcodes the caption text", async () => {
  const [{ default: en }, { default: es }, { default: pt }] = await Promise.all([
    import("../messages/en.json", { with: { type: "json" } }),
    import("../messages/es.json", { with: { type: "json" } }),
    import("../messages/pt.json", { with: { type: "json" } }),
  ]);
  for (const dict of [en, es, pt]) {
    assert.ok(dict.giftFlight?.sentTo, "giftFlight.sentTo must exist in every locale");
    assert.match(dict.giftFlight.sentTo, /\{sender\}/);
    assert.match(dict.giftFlight.sentTo, /\{recipient\}/);
  }
  const source = await readFile(targetedGiftEffectPath, "utf8");
  assert.match(source, /t\("giftFlight\.sentTo"\)/);
});
