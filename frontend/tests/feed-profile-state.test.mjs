import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowFeedProfileIncompleteState } from "../lib/feedProfileState.js";

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
