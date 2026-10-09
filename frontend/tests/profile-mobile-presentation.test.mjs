import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/profile/page.jsx", import.meta.url), "utf8");
const mobile = source.slice(
  source.indexOf("@media (max-width: 768px)"),
  source.indexOf("@media (max-width: 540px)")
);

test("profile: mobile identity wraps and actions have their own full-width row", () => {
  assert.match(mobile, /grid-template-columns: auto minmax\(0, 1fr\)/);
  assert.match(mobile, /h1\.profile-name\.profile-hero-name\s*\{[^}]*white-space: normal/);
  assert.match(mobile, /\.profile-handle\s*\{[^}]*overflow-wrap: anywhere/);
  assert.match(mobile, /\.profile-hero-location\s*\{[^}]*white-space: normal/);
  assert.match(mobile, /\.profile-hero-id-actions\s*\{[^}]*grid-column: 1 \/ -1/);
  assert.match(mobile, /grid-template-columns: minmax\(0, 1fr\) 44px/);
});

test("profile: existing actions and photo gallery remain accessible", () => {
  assert.match(source, /aria-label=\{t\("profile.passwordShort"\)\}/);
  assert.match(source, /className="profile-gallery-rail" tabIndex=\{0\} role="region" aria-label=\{t\("profile.galleryTitle"\)\}/);
  assert.match(mobile, /:focus-visible/);
  assert.match(mobile, /min-height: 44px/);
  assert.match(mobile, /scroll-margin-bottom: calc\(var\(--bottom-spacing-mobile\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(mobile, /padding-left: env\(safe-area-inset-left, 0px\)/);
  assert.match(mobile, /padding-right: env\(safe-area-inset-right, 0px\)/);
  assert.match(mobile, /\.profile-page :global\(\.action-tile\)\s*\{[^}]*min-height: 44px/);
});

test("profile: gallery keeps real image sources, fallbacks and edit flow", () => {
  assert.match(source, /src=\{primaryImageUrl\}/);
  assert.match(source, /setHiddenPrimaryImageUrl\(event\.currentTarget\.src \|\| primaryImageUrl\)/);
  assert.match(source, /profile-hero-avatar-fallback">\{initial\}/);
  assert.match(source, /normalizedImages\.map\(\(photo\) => \(/);
  assert.match(source, /src=\{photo\.url\}/);
  assert.match(source, /className="profile-gallery-grid-add" onClick=\{handleEdit\}/);
  assert.match(source, /onUserChange=\{handlePhotoGalleryUserChange\}/);
  assert.match(source, /@media \(max-width: 374px\)[\s\S]*?\.profile-gallery-grid\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
