import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { DEFAULT_AUTH_REDIRECT, normalizeCallbackPath } from "../lib/redirects.js";
import { isProtectedRoutePath, isPublicRoute } from "../lib/publicAccess.js";
import { isBottomNavRoute } from "../lib/bottomNavRoutes.js";
import { getNativeGoogleLoginUrl } from "../lib/nativeGoogleLoginUrl.js";
import { UNIVERSE_ACCOUNT_ROUTES, getUniverseAccountLinks } from "../lib/universeAccountNavigation.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(join(root, p), "utf8");

test("authenticated universe route is private, immersive and not the open design preview", async () => {
  assert.equal(isProtectedRoutePath("/universe"), true);
  assert.equal(isPublicRoute("/universe"), false);
  assert.equal(isProtectedRoutePath("/universe-preview"), false);
  assert.equal(isBottomNavRoute("/universe"), false);
  const route = await read("app/universe/page.jsx");
  const preview = await read("app/universe-preview/page.jsx");
  const navbar = await read("components/NavbarWrapper.jsx");
  assert.doesNotThrow(() => parse(route, { sourceType: "module", plugins: ["jsx"] }));
  assert.match(route, /import ExploreCarousel3D from "@\/components\/ExploreCarousel3D"/);
  assert.match(route, /<ExploreCarousel3D \/>/);
  assert.match(route, /getToken\(\) \|\| session\?\.backendToken/);
  assert.match(route, /fetch\(\`\$\{API_URL\}\/api\/user\/me\`/);
  assert.match(route, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(route, /clearToken\(\)/);
  assert.match(route, /signOut\(\{ redirect: false \}\)/);
  assert.match(route, /user\?\.role === "admin"/);
  assert.match(route, /user\?\.onboardingComplete === false/);
  assert.match(route, /router\.replace\("\/onboarding"\)/);
  assert.match(route, /router\.replace\("\/login\?callbackUrl=%2Funiverse"\)/);
  assert.match(route, /setState\("error"\)/);
  assert.match(preview, /<ExploreCarousel3D \/>/);
  assert.match(navbar, /"\/universe", "\/universe-preview"/);
});

test("default login opens universe, but secure deep links and admin/onboarding retain priority", async () => {
  assert.equal(DEFAULT_AUTH_REDIRECT, "/universe");
  assert.equal(normalizeCallbackPath(null), "/universe");
  assert.equal(normalizeCallbackPath("/login"), "/universe");
  assert.equal(normalizeCallbackPath("//evil.test"), "/universe");
  for (const dest of ["/chats", "/coins", "/profile", "/creator-request", "/feed", "/dashboard"]) {
    assert.equal(normalizeCallbackPath(dest), dest);
  }
  const login = await read("app/login/page.jsx");
  const middleware = await read("middleware.js");
  assert.match(login, /user\?\.role === "admin"\) return "\/admin"/);
  assert.match(login, /user\?\.onboardingComplete === false\) return "\/onboarding"/);
  assert.match(login, /return fallbackPath;/);
  assert.match(login, /normalizeCallbackPath\(searchParams\.get\("callbackUrl"\)\)/);
  assert.match(login, /getPostLoginRedirectPath\(user, userRedirectPath\)/);
  assert.match(middleware, /normalizeCallbackPath\(request\.nextUrl\.searchParams\.get\("callbackUrl"\)\)/);
});

test("registration and completed onboarding enter universe without overwriting invite or verification flows", async () => {
  const register = await read("app/register/RegisterForm.jsx");
  const onboarding = await read("app/onboarding/page.jsx");
  assert.match(register, /if \(user\?\.role === "admin"\) return "\/admin"/);
  assert.match(register, /if \(user\?\.onboardingComplete === false\) return "\/onboarding"/);
  assert.match(register, /if \(inviteCode\) return \`\/agency\/invite\?code=/);
  assert.match(register, /return "\/universe"/);
  assert.match(register, /signIn\("google", \{ callbackUrl: "\/login\?callbackUrl=\/universe" \}\)/);
  assert.match(register, /startNativeGoogleLogin\("\/universe"\)/);
  assert.match(register, /router\.push\(\`\/verify-email/);
  assert.match(onboarding, /const onboardingComplete = data\.onboardingComplete === true/);
  assert.match(onboarding, /if \(!onboardingComplete\)/);
  assert.match(onboarding, /router\.replace\("\/universe"\)/);
});

test("Google entry from landing still completes the backend JWT handoff", async () => {
  const landing = await read("components/LandingPageContent.jsx");
  assert.match(landing, /startNativeGoogleLogin\("\/universe"\)/);
  assert.match(landing, /callbackUrl: "\/login\?callbackUrl=%2Funiverse"/);
  assert.match(landing, /<Link href="\/login"/);
  assert.match(landing, /<Link href="\/register"/);
  const url = new URL(getNativeGoogleLoginUrl("/universe", "https://meetyoulive.net"));
  const callback = new URL(url.searchParams.get("callbackUrl"));
  assert.equal(callback.pathname, "/auth/native-callback");
  assert.equal(callback.searchParams.get("callbackUrl"), "/universe");
});

test("immersive authenticated entry suppresses public footer and accidental Android back navigation", async () => {
  const footer = await read("components/PublicFooterWrapper.jsx");
  const native = await read("components/NativeAppManager.jsx");
  const floating = await read("components/FloatingGoLiveButton.jsx");
  assert.match(footer, /pathname === "\/universe-preview" \|\| pathname === "\/universe"/);
  assert.match(native, /EXIT_CONFIRM_PATHS = new Set\(\["\/", "\/dashboard", "\/universe"\]\)/);
  assert.match(native, /"\/universe",\s*"\/verify-email"/);
  assert.match(floating, /pathname !== "\/universe" && pathname !== "\/universe-preview"/);
  assert.doesNotMatch(native, /router\.replace\("\/universe"\)/);
});

test("the universe only links to existing screens, without duplicating business workflows", async () => {
  const scene = await read("components/ExploreCarousel3D.jsx");
  const menu = await read("components/UniverseAccountMenu.jsx");

  // A selected experience routes to the original feature, never a clone.
  for (const route of ["/live", "/random", "/rooms", "/feed"]) {
    assert.ok(scene.includes('route: "' + route + '"'));
    const page = await read("app" + route + "/page.jsx");
    assert.ok(page.length > 100, "Missing existing destination: " + route);
  }
  for (const future of ["games", "world", "ai"]) {
    assert.ok(scene.includes('id: "' + future + '", route: null'), future + " must remain unavailable");
  }

  // All account links resolve to already implemented App Router pages.
  const member = getUniverseAccountLinks({ role: "user" }, { authenticated: true });
  const guest = getUniverseAccountLinks(null);
  const creator = getUniverseAccountLinks({ role: "creator", creatorStatus: "approved" }, { authenticated: true });
  const subCreator = getUniverseAccountLinks({ role: "subCreator", creatorStatus: "approved" }, { authenticated: true });
  const admin = getUniverseAccountLinks(null, { admin: true });
  for (const links of [member, guest, creator, subCreator, admin]) {
    for (const link of links) {
      const path = link.href.startsWith("/login?callbackUrl=")
        ? decodeURIComponent(link.href.split("callbackUrl=")[1]) : link.href;
      assert.ok(path.startsWith("/") && !path.startsWith("//"));
      const page = await read("app" + path + "/page.jsx");
      assert.ok(page.length > 50, "Missing existing route: " + path);
    }
  }

  // Chat, creator panels and coin checkout must remain owned by their
  // existing pages and backend authorization, not reimplemented in the portal.
  assert.equal(UNIVERSE_ACCOUNT_ROUTES.find((link) => link.id === "chats").href, "/chats");
  assert.equal(UNIVERSE_ACCOUNT_ROUTES.find((link) => link.id === "coins").href, "/coins");
  assert.ok(!scene.includes("purchaseCoinPackageWithGooglePlay"));
  assert.ok(!scene.includes("socket.emit("));
  assert.ok(!menu.includes("purchaseCoinPackageWithApple"));
  assert.ok(!menu.includes("socket.emit("));
  assert.ok(!member.some((link) => link.href === "/agency"));
  assert.ok(creator.some((link) => link.href === "/creator"));
  assert.ok(creator.some((link) => link.href === "/live/start"));
});
