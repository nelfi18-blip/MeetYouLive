import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const profile = await readFile(new URL("../app/profile/page.jsx", import.meta.url), "utf8");

test("Boost child markup receives scoped CSS without touching backend pricing or checkout", () => {
  assert.match(profile, /function BoostCard\(/);
  assert.match(profile, /className=\{`boost-profile-card/);
  assert.match(profile, /\.profile-page :global\(\.boost-profile-card\) \{/);
  for (const name of ["boost-profile-body", "boost-profile-title", "boost-profile-sub", "boost-profile-btn"]) {
    assert.match(profile, new RegExp("\\.profile-page :global\\(\\." + name + "\\)"));
  }
  assert.match(profile, /className="boost-profile-btn"/);
  assert.match(profile, /disabled=\{loading \|\| !canAfford\}/);
  assert.match(profile, /onClick=\{onBoost\}/);
});

test("mobile preference labels and values have separate grid rows with normal word wrapping", () => {
  const mobile = profile.slice(profile.indexOf("/* Mobile preferences: keep complete words"));
  assert.match(mobile, /grid-template-columns: 24px minmax\(0, 1fr\) 20px/);
  assert.match(mobile, /\.prefs-row-label \{\s*grid-column: 2;\s*grid-row: 1/);
  assert.match(mobile, /\.prefs-row-value \{\s*grid-column: 2;\s*grid-row: 2/);
  assert.match(mobile, /overflow-wrap: normal/);
  assert.match(mobile, /word-break: normal/);
  assert.match(mobile, /\.prefs-row-chevron \{\s*grid-column: 3/);
  assert.doesNotMatch(mobile.slice(0, mobile.indexOf("profile-page :global(.action-tile)")), /overflow-wrap: anywhere/);
});

test("photo verification, form handlers and profile data are preserved", () => {
  assert.match(profile, /VerifyPhotoFlow/);
  assert.match(profile, /computeProfileCompleteness/);
  assert.match(profile, /setShowDiscoveryPanel/);
  assert.match(profile, /setShowInterestsPanel/);
  assert.match(profile, /setShowLangPanel/);
});
