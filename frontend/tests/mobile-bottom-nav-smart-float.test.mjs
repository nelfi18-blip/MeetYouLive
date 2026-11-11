import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nextBottomNavOnScroll } from "../lib/navigation/scrollAwareBottomNav.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const base = { totalHeight: 2800, viewportHeight: 830 };

function advance(state, scrollY, overrides = {}) {
  return nextBottomNavOnScroll({
    ...base,
    ...state,
    scrollY,
    ...overrides,
  });
}

test("slow downward scrolling hides the floating bar, upward scrolling restores it", () => {
  let s = { hidden: false, travel: 0, previousY: 100 };
  s = advance(s, 116);
  assert.equal(s.hidden, false, "minor movement should not conceal navigation");
  s = advance(s, 132);
  assert.equal(s.hidden, false, "only hide after user is sufficiently down the page");
  s = advance(s, 166);
  assert.equal(s.hidden, true, "scrolling down makes reading space");
  s = advance(s, 157);
  assert.equal(s.hidden, true, "minor reverse motion should not flicker");
  s = advance(s, 149);
  assert.equal(s.hidden, false, "short upward gesture reveals controls promptly");
});

test("top of page, short pages, IR menu and reduced-motion settings keep navigation visible", () => {
  const hidden = { hidden: true, travel: 40, previousY: 400 };
  assert.equal(advance(hidden, 65).hidden, false);
  assert.equal(advance(hidden, 420, { totalHeight: 900, viewportHeight: 830 }).hidden, false);
  assert.equal(advance(hidden, 420, { menuOpen: true }).hidden, false);
  assert.equal(advance(hidden, 420, { reducedMotion: true }).hidden, false);
});

test("small scroll jitters and large programmatic jumps cannot hide navigation", () => {
  let s = { hidden: false, travel: 0, previousY: 300 };
  for (const y of [300.5, 300, 300.8, 301]) s = advance(s, y);
  assert.equal(s.hidden, false);
  assert.equal(advance({ ...s, previousY: 300 }, 900).hidden, false);
  assert.equal(advance({ hidden: true, travel: 0, previousY: 900 }, 1800).hidden, false);
});

test("scroll policy only changes visibility and preserves actual BottomNav routes and links", async () => {
  const [nav, css, routes] = await Promise.all([
    read("../components/BottomNavEnhanced.jsx"),
    read("../app/globals.css"),
    read("../lib/bottomNavRoutes.js"),
  ]);
  assert.match(nav, /nextBottomNavOnScroll/);
  assert.match(nav, /addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
  assert.match(nav, /removeEventListener\("scroll", onScroll\)/);
  assert.match(nav, /!showCreateMenu|if \(showCreateMenu\)/);
  assert.match(nav, /aria-hidden=\{navHidden\}/);
  assert.match(nav, /bottom-nav-enhanced--concealed/);
  for (const path of ["/feed", "/chats", "/profile", "/coins"]) {
    assert.match(nav, new RegExp(path.replace("/", "\\/")));
  }
  assert.match(routes, /IMMERSIVE_BOTTOM_NAV_EXCLUSIONS/);
  assert.match(css, /\.bottom-nav-enhanced\.bottom-nav-enhanced--concealed/);
  assert.match(css, /translate3d\(-50%, calc\(100% \+ 60px \+ env\(safe-area-inset-bottom\)\), 0\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /--bottom-spacing-mobile: 180px/);
});

test("nav-preview is an isolated visual demonstration, not a login bypass", async () => {
  const [page, preview, publicAccess, navWrapper, footer, nav] = await Promise.all([
    read("../app/nav-preview/page.jsx"),
    read("../components/FloatingNavPreview.jsx"),
    read("../lib/publicAccess.js"),
    read("../components/NavbarWrapper.jsx"),
    read("../components/PublicFooterWrapper.jsx"),
    read("../components/BottomNavEnhanced.jsx"),
  ]);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /return <FloatingNavPreview \/>;/);
  assert.match(preview, /<BottomNavEnhanced \/>/);
  assert.match(preview, /onClickCapture=\{stopDemoNavigation\}/);
  assert.match(preview, /event\.preventDefault\(\)/);
  assert.doesNotMatch(preview, /fetch\(|setToken|fakeUsers|Stripe|createAccount/);
  assert.match(publicAccess, /"\/nav-preview"/);
  assert.match(navWrapper, /"\/nav-preview"/);
  assert.match(footer, /pathname === "\/nav-preview"/);
  assert.match(nav, /if \(!token \|\| pathname === "\/nav-preview"\) return/);
  assert.match(nav, /if \(!session\?\.backendToken \|\| pathname === "\/nav-preview"\) return/);
  assert.match(nav, /\[session, pathname\]/);
});
