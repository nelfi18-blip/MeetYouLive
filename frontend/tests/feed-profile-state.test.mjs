import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowFeedProfileIncompleteState, shouldShowDiscoveryProfileSetupGate } from "../lib/feedProfileState.js";

test("approved creator with a complete profile does not see the incomplete-profile notice", () => {
  assert.equal(
    shouldShowFeedProfileIncompleteState(true, {
      role: "creator",
      creatorStatus: "approved",
      profileComplete: true,
      missingFields: [],
      canAppearInFeed: false,
    }),
    false
  );
});

test("incomplete regular user sees the incomplete-profile notice", () => {
  assert.equal(
    shouldShowFeedProfileIncompleteState(true, {
      role: "user",
      profileComplete: false,
      missingFields: ["photo"],
      canAppearInFeed: false,
    }),
    true
  );
});

test("complete regular user keeps the expected feed access state", () => {
  assert.equal(
    shouldShowFeedProfileIncompleteState(true, {
      role: "user",
      profileComplete: true,
      missingFields: [],
      canAppearInFeed: true,
    }),
    false
  );
});

test("canAppearInFeed is not used as an incomplete-profile signal", () => {
  assert.equal(
    shouldShowFeedProfileIncompleteState(true, {
      role: "creator",
      creatorStatus: "approved",
      profileComplete: true,
      missingFields: [],
      canAppearInFeed: false,
    }),
    false
  );
  assert.equal(
    shouldShowFeedProfileIncompleteState(true, {
      role: "user",
      profileComplete: false,
      missingFields: [],
      canAppearInFeed: true,
    }),
    true
  );
});

test("photo-less account is routed to profile setup even if recommendations exist", () => {
  const status = { profileComplete: false, missingFields: ["photo"], interestedInConfirmed: true };
  const mustSetup = shouldShowDiscoveryProfileSetupGate(status);
  assert.equal(mustSetup, true);
  assert.equal(shouldShowFeedProfileIncompleteState(false || mustSetup, status), true);
});

test("missing profile gender cannot be fixed by repeating the interest chooser", () => {
  assert.equal(shouldShowDiscoveryProfileSetupGate({ missingFields: ["gender"] }), true);
});

test("complete users and users loading their status are not blocked by profile setup", () => {
  assert.equal(shouldShowDiscoveryProfileSetupGate(null), false);
  assert.equal(shouldShowDiscoveryProfileSetupGate({ profileComplete: true, missingFields: [] }), false);
  assert.equal(shouldShowDiscoveryProfileSetupGate({ missingFields: ["interestedIn"] }), false);
});

test("Discovery renders a photo/gender completion screen before showing swipe cards", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/feed/page.jsx", import.meta.url), "utf8");
  assert.match(page, /shouldShowProfileSetupGate = shouldShowDiscoveryProfileSetupGate\(viewerProfileStatus\)/);
  assert.match(page, /showEmptyState \|\| shouldShowProfileSetupGate/);
  assert.match(page, /!shouldShowProfileSetupGate && shouldShowDiscoveryPreferenceGate/);
  assert.match(page, /hasMoreProfiles && !shouldShowProfileSetupGate/);
  assert.match(page, /href=\{profileCompletionHref\}/);
});
