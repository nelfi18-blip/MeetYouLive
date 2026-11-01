import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import esMessages from "../messages/es.json" with { type: "json" };
import enMessages from "../messages/en.json" with { type: "json" };
import ptMessages from "../messages/pt.json" with { type: "json" };

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");
const viewerSource = await readSource("../components/PhotoViewerModal.jsx");
const gallerySource = await readSource("../components/SimpleProfilePhotoGallery.jsx");
const profilePageSource = await readSource("../app/profile/page.jsx");

test("PhotoViewerModal is a read-only, full-screen lightbox with swipe/keyboard nav, counter and close control", () => {
  assert.match(viewerSource, /createPortal/);
  assert.match(viewerSource, /role="dialog"/);
  assert.match(viewerSource, /onTouchStart=\{handleTouchStart\}/);
  assert.match(viewerSource, /onTouchMove=\{handleTouchMove\}/);
  assert.match(viewerSource, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(viewerSource, /ArrowRight/);
  assert.match(viewerSource, /ArrowLeft/);
  assert.match(viewerSource, /Escape/);
  assert.match(viewerSource, /t\("profile\.photoViewerCounter"\)/);
  assert.match(viewerSource, /t\("profile\.photoViewerClose"\)/);
  assert.match(viewerSource, /object-fit: contain/);
  // Must never call the backend or mutate photos — purely presentational.
  assert.doesNotMatch(viewerSource, /fetch\(/);
  assert.doesNotMatch(viewerSource, /handleDelete|handleMakePrimary/);
});

test("profile/page.jsx opens the viewer from 'Ver todas' and from thumbnail taps, keeping Edit separate", () => {
  assert.match(profilePageSource, /import PhotoViewerModal from "@\/components\/PhotoViewerModal"/);
  assert.match(profilePageSource, /const openPhotoViewer = \(index = 0\) => setPhotoViewerIndex\(index\);/);
  // "Ver todas" no longer enters edit mode.
  assert.match(profilePageSource, /className="profile-gallery-viewall" onClick=\{\(\) => openPhotoViewer\(0\)\}/);
  assert.doesNotMatch(profilePageSource, /className="profile-gallery-viewall" onClick=\{handleEdit\}/);
  // Thumbnails open the viewer at their own index.
  assert.match(profilePageSource, /onClick=\{\(\) => openPhotoViewer\(photoIndex\)\}/);
  // Edit/Add-photo entry points are untouched.
  assert.match(profilePageSource, /className="profile-gallery-add" onClick=\{handleEdit\}/);
  assert.match(profilePageSource, /className="profile-gallery-grid-add" onClick=\{handleEdit\}/);
  assert.match(profilePageSource, /<PhotoViewerModal\s/);
});

test("SimpleProfilePhotoGallery opens the viewer by tapping a photo while Edit/Delete/Make-primary remain separate actions", () => {
  assert.match(gallerySource, /import PhotoViewerModal from "@\/components\/PhotoViewerModal"/);
  assert.match(gallerySource, /onImageClick=\{\(\) => setViewerIndex\(0\)\}/);
  assert.match(gallerySource, /onImageClick=\{\(\) => setViewerIndex\(secondaryIndex \+ 1\)\}/);
  // Action buttons remain distinct handlers, unaffected by the new tap-to-view behavior.
  assert.match(gallerySource, /onClick=\{\(\) => handleDelete\(primaryImage\)\}/);
  assert.match(gallerySource, /onClick=\{\(\) => handleMakePrimary\(photo\)\}/);
  assert.match(gallerySource, /onClick=\{\(\) => handleDelete\(photo\)\}/);
  assert.match(gallerySource, /<PhotoViewerModal\s/);
});

test("photoViewer translations exist and are non-empty across es/en/pt", () => {
  for (const dictionary of [esMessages, enMessages, ptMessages]) {
    for (const key of [
      "photoViewerLabel",
      "photoViewerClose",
      "photoViewerPrev",
      "photoViewerNext",
      "photoViewerCounter",
      "photoViewerImageAlt",
      "photoViewerOpenAlt",
    ]) {
      assert.equal(typeof dictionary.profile[key], "string", `expected profile.${key} to be a string`);
      assert.ok(dictionary.profile[key].trim(), `expected profile.${key} to be non-empty`);
    }
  }
  assert.equal(esMessages.profile.photoViewerCounter, "{current}/{total}");
});
