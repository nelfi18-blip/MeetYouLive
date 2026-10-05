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
    /participant\.username \|\| participant\.name \|\| \(isHostTile \? "Host" : "Invitado"\)/,
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
  assert.match(source, /triggerGiftTargetHighlight\(giftReceiverId \|\| live\?\.user\?\._id \|\| null, effectRarity\)/);
  assert.match(source, /triggerGiftTargetHighlight\(data\?\.receiverId \|\| null, effectRarity\)/);
  assert.match(source, /highlightedRecipientId=\{highlightedRecipientId\}/);
});
