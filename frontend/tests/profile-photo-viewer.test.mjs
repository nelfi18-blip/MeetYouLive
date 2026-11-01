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
const nativeAppManagerSource = await readSource("../components/NativeAppManager.jsx");

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

test("tapping the dark backdrop closes the viewer, but tapping the photo or the arrows does not", () => {
  // The overlay itself is the only element whose onClick directly calls
  // onClose — this is what makes a tap on the backdrop close the viewer.
  assert.match(viewerSource, /className="photo-viewer-overlay"[\s\S]*?onClick=\{onClose\}/);

  // Regression guard: .photo-viewer-stage must NOT blanket-stop propagation
  // anymore — that bug swallowed every click inside the full-bleed stage
  // (which visually includes most of the dark backdrop), so tapping outside
  // the photo never reached the overlay's onClose.
  const stageBlockMatch = viewerSource.match(/<div\s+className="photo-viewer-stage"[\s\S]*?>/);
  assert.ok(stageBlockMatch, "expected to find the .photo-viewer-stage element");
  assert.doesNotMatch(stageBlockMatch[0], /onClick/);

  // The photo and the prev/next arrows must stop propagation on click so a
  // tap on them does not bubble up to the overlay and close the viewer.
  assert.match(viewerSource, /<img[\s\S]*?onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(viewerSource, /photo-viewer-nav--prev"[\s\S]*?onClick=\{\(event\) => \{ event\.stopPropagation\(\); goPrev\(\); \}\}/);
  assert.match(viewerSource, /photo-viewer-nav--next"[\s\S]*?onClick=\{\(event\) => \{ event\.stopPropagation\(\); goNext\(\); \}\}/);
});

test("the viewer is detected as an open modal and closes on the Android hardware back button without exiting MeetYouLive", () => {
  // NativeAppManager intercepts the hardware back button, and when it finds
  // an open modal it consumes the press (closing the modal) instead of
  // exiting the app or navigating away — reusing this existing mechanism
  // requires the overlay to match hasOpenModal()'s selector.
  assert.match(nativeAppManagerSource, /function hasOpenModal\(\)/);
  assert.match(nativeAppManagerSource, /\[aria-modal='true'\]/);
  assert.match(nativeAppManagerSource, /function closeTopModal\(\)/);
  assert.match(nativeAppManagerSource, /if \(closeTopModal\(\)\) return;/);
  assert.match(viewerSource, /aria-modal="true"/);

  // The viewer must listen on `document` (what closeTopModal's synthetic
  // Escape keydown targets) rather than `window`, and must also handle the
  // `meetyoulive:native-back` custom event NativeAppManager dispatches on
  // the hardware back button, so the back press reliably closes the
  // overlay instead of leaking through to app-level back/exit handling.
  assert.match(nativeAppManagerSource, /document\.dispatchEvent\(new KeyboardEvent\("keydown", \{ key: "Escape", bubbles: true \}\)\)/);
  assert.match(nativeAppManagerSource, /window\.dispatchEvent\(new CustomEvent\("meetyoulive:native-back"\)\)/);
  assert.match(viewerSource, /document\.addEventListener\("keydown", handleKeyDown\)/);
  assert.match(viewerSource, /window\.addEventListener\("meetyoulive:native-back", handleNativeBack\)/);
});

