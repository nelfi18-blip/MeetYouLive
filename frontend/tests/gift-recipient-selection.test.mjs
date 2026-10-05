import test from "node:test";
import assert from "node:assert/strict";
import { buildGiftRecipients } from "../lib/multiGuestPresentation.js";

const host = { _id: "host-id", username: "host-handle", avatar: "/uploads/host.jpg" };

test("a single participant (host only) yields a single recipient — simple direct flow", () => {
  const recipients = buildGiftRecipients({
    host,
    guests: [],
    currentUserId: "viewer-id",
    defaultGuestName: "Guest",
  });

  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].id, "host-id");
  assert.equal(recipients[0].isHost, true);
});

test("several active participants yield a recipient selector with host + active guests only", () => {
  const guests = [
    { userId: { _id: "guest-1", username: "guest-one" }, status: "active" },
    { userId: { _id: "guest-2", username: "guest-two" }, status: "active" },
    { userId: { _id: "disconnected-guest", username: "ghost" }, status: "disconnected" },
  ];

  const recipients = buildGiftRecipients({
    host,
    guests,
    currentUserId: "viewer-id",
    defaultGuestName: "Guest",
  });

  assert.equal(recipients.length, 3);
  const ids = recipients.map((r) => r.id);
  assert.deepEqual(ids, ["host-id", "guest-1", "guest-2"]);
  assert.equal(recipients.find((r) => r.id === "host-id").isHost, true);
  assert.equal(recipients.find((r) => r.id === "guest-1").isHost, false);
  // Disconnected guest never appears
  assert.ok(!ids.includes("disconnected-guest"));
});

test("pending guestRequests are never part of the recipient list (only live.guests is read)", () => {
  // guestRequests are a completely separate array on the Live document and
  // must never be passed in here — this test documents that buildGiftRecipients
  // only ever considers `guests`, never pending join requests.
  const recipients = buildGiftRecipients({
    host,
    guests: [{ userId: { _id: "pending-id", username: "pending" }, status: "active" }],
    currentUserId: "viewer-id",
    defaultGuestName: "Guest",
  });

  assert.equal(recipients.length, 2);
  assert.ok(recipients.some((r) => r.id === "pending-id"));

  // But a guestRequest-shaped entry with no `status: "active"` (e.g. "pending") is excluded.
  const withPendingRequest = buildGiftRecipients({
    host,
    guests: [{ userId: { _id: "pending-id", username: "pending" }, status: "pending" }],
    currentUserId: "viewer-id",
    defaultGuestName: "Guest",
  });
  assert.equal(withPendingRequest.length, 1);
  assert.ok(!withPendingRequest.some((r) => r.id === "pending-id"));
});

test("the viewer's own account never appears as a selectable recipient (self-gift prevention)", () => {
  const guests = [{ userId: { _id: "guest-1", username: "guest-one" }, status: "active" }];

  // Viewer is the host
  const asHost = buildGiftRecipients({
    host,
    guests,
    currentUserId: "host-id",
    defaultGuestName: "Guest",
  });
  assert.ok(!asHost.some((r) => r.id === "host-id"));
  assert.equal(asHost.length, 1);

  // Viewer is one of the guests
  const asGuest = buildGiftRecipients({
    host,
    guests,
    currentUserId: "guest-1",
    defaultGuestName: "Guest",
  });
  assert.ok(!asGuest.some((r) => r.id === "guest-1"));
  assert.equal(asGuest.length, 1);
  assert.equal(asGuest[0].id, "host-id");
});

test("avatar resolution uses the provided resolver (e.g. getUserImage) when given", () => {
  const recipients = buildGiftRecipients({
    host,
    guests: [],
    currentUserId: "viewer-id",
    defaultGuestName: "Guest",
    resolveAvatar: (u) => `resolved:${u?.avatar}`,
  });

  assert.equal(recipients[0].avatar, "resolved:/uploads/host.jpg");
});

test("falls back to raw avatar field when no resolver is provided", () => {
  const recipients = buildGiftRecipients({
    host,
    guests: [],
    currentUserId: "viewer-id",
    defaultGuestName: "Guest",
  });

  assert.equal(recipients[0].avatar, "/uploads/host.jpg");
});

test("a guest without username/name falls back to the i18n default guest label", () => {
  const recipients = buildGiftRecipients({
    host,
    guests: [{ userId: { _id: "nameless-guest" }, status: "active" }],
    currentUserId: "viewer-id",
    defaultGuestName: "Invitado",
  });

  const guestEntry = recipients.find((r) => r.id === "nameless-guest");
  assert.equal(guestEntry.name, "Invitado");
});
