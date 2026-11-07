import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPeerOnlineFromSnapshot } from "../lib/chatPeerPresence.js";

test("an already-connected chat contact appears online from the existing server snapshot", () => {
  assert.equal(getPeerOnlineFromSnapshot([{ _id: "contact-1" }, { _id: "contact-2" }], "contact-2"), true);
  assert.equal(getPeerOnlineFromSnapshot([{ _id: "contact-1" }], "contact-2"), false);
});

test("malformed or unavailable presence snapshots never fabricate offline state", () => {
  assert.equal(getPeerOnlineFromSnapshot(null, "contact-1"), null);
  assert.equal(getPeerOnlineFromSnapshot({}, "contact-1"), null);
  assert.equal(getPeerOnlineFromSnapshot(undefined, "contact-1"), null);
  assert.equal(getPeerOnlineFromSnapshot([], ""), null);
  assert.equal(getPeerOnlineFromSnapshot([{ _id: "contact-1" }], null), null);
});

test("presence snapshot checks only the active chat peer, never unrelated profiles", () => {
  assert.equal(getPeerOnlineFromSnapshot([{ _id: 123 }, { _id: "contact-3" }], "123"), true);
  assert.equal(getPeerOnlineFromSnapshot([{ _id: "contact-3" }, {}], "other"), false);
});

test("conversation sync keeps existing socket events and refreshes only on opening, reconnect and foreground", async () => {
  const room = await readFile(new URL("../app/chats/[id]/page.jsx", import.meta.url), "utf8");
  assert.match(room, /getPeerOnlineFromSnapshot\(payload\?\.users, otherUserId\)/);
  assert.match(room, /fetch\(`\$\{API_URL\}\/api\/user\/online`/);
  assert.match(room, /Authorization: `Bearer \$\{token\}`/);
  assert.match(room, /cache: "no-store"/);
  assert.match(room, /socket\.on\("USER_ONLINE", handleOnline\)/);
  assert.match(room, /socket\.on\("USER_OFFLINE", handleOffline\)/);
  assert.match(room, /socket\.on\("connect", handleConnect\)/);
  assert.match(room, /window\.addEventListener\("focus", handleFocus\)/);
  assert.match(room, /document\.addEventListener\("visibilitychange", handleVisibility\)/);
  assert.match(room, /eventAtRequest !== presenceEventVersion/);
  assert.match(room, /request !== latestRequest/);
  assert.match(room, /if \(online === null \|\| !active/);
  assert.match(room, /socket\.off\("USER_ONLINE", handleOnline\)/);
  assert.match(room, /socket\.off\("USER_OFFLINE", handleOffline\)/);
  assert.match(room, /window\.removeEventListener\("focus", handleFocus\)/);
  assert.match(room, /document\.removeEventListener\("visibilitychange", handleVisibility\)/);
});

test("presence repair does not alter chat message sending or native capture protection", async () => {
  const room = await readFile(new URL("../app/chats/[id]/page.jsx", import.meta.url), "utf8");
  assert.match(room, /useAndroidScreenCaptureProtection\(true, id\)/);
  assert.match(room, /const sendMessage = async \(e\) =>/);
  assert.match(room, /socket\.emit\("chat:join"/);
  assert.match(room, /<span className="peer-status">\{isOtherOnline \? t\("chatPremium\.onlineNow"\) : t\("chatPremium\.lastSeenUnavailable"\)\}<\/span>/);
});
