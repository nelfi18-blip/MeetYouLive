import test from "node:test";
import assert from "node:assert/strict";
import {
  getAuthenticityMissingKeys,
  needsMorePhotos,
} from "../lib/profileAuthenticity.js";

test("needs a second photo; selfie never counts", () => {
  assert.equal(needsMorePhotos(0), true);
  assert.equal(needsMorePhotos(1), true);
  assert.equal(needsMorePhotos(2), false);
});

test("missing keys appear only when the backend says enforcement applies", () => {
  const base = { missing: ["minPhotos", "selfieVerified"] };
  assert.deepEqual(getAuthenticityMissingKeys({ ...base, appliesToUser: false }), []);
  assert.deepEqual(getAuthenticityMissingKeys(undefined), []);
  assert.deepEqual(getAuthenticityMissingKeys({ ...base, appliesToUser: true }), [
    "profile.authenticity.missingPhotos",
    "profile.authenticity.missingSelfie",
  ]);
});
