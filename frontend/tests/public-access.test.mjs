import test from "node:test";
import assert from "node:assert/strict";
import {
  isPublicRoute,
  shouldRedirectUnauthenticatedToLogin,
} from "../lib/publicAccess.js";

const HOSTS = ["meetyoulive.net", "www.meetyoulive.net"];
const PUBLIC_PATHS = [
  "/",
  "/about",
  "/how-it-works",
  "/legal",
  "/security",
  "/community-guidelines",
  "/privacy",
  "/terms",
  "/cookies",
  "/refund",
  "/refunds",
  "/payments-refunds",
  "/acceptable-use",
  "/pricing",
  "/law-enforcement",
  "/content-policy",
  "/creator-policy",
  "/help-center",
  "/dmca",
  "/safety-moderation",
  "/child-safety",
  "/account-deletion",
  "/contact",
];
const SESSION_COOKIES = {
  "auth-session": "backend-session",
  "__Secure-next-auth.session-token": "next-auth-session",
};

function assertPublicAccess({ pathname, cookies }) {
  assert.equal(isPublicRoute(pathname), true);
  assert.equal(
    shouldRedirectUnauthenticatedToLogin({
      pathname,
      hasBackendSession: Boolean(cookies["auth-session"]),
      hasNextAuthSession: Boolean(cookies["__Secure-next-auth.session-token"]),
    }),
    false
  );
}

test("public routes stay public on apex and www without session cookies", () => {
  for (const host of HOSTS) {
    for (const pathname of PUBLIC_PATHS) {
      assert.equal(new URL(`https://${host}${pathname}`).pathname, pathname);
      assertPublicAccess({ pathname, cookies: {} });
    }
  }
});

test("public routes stay public on apex and www with session cookies", () => {
  for (const host of HOSTS) {
    for (const pathname of PUBLIC_PATHS) {
      assert.equal(new URL(`https://${host}${pathname}`).pathname, pathname);
      assertPublicAccess({ pathname, cookies: SESSION_COOKIES });
    }
  }
});

test("protected routes still redirect unauthenticated visitors to login", () => {
  assert.equal(
    shouldRedirectUnauthenticatedToLogin({
      pathname: "/feed",
      hasBackendSession: false,
      hasNextAuthSession: false,
    }),
    true
  );
});

test("/pricing is a recognized public route for anonymous visitors", () => {
  assert.equal(isPublicRoute("/pricing"), true);
  assert.equal(
    shouldRedirectUnauthenticatedToLogin({
      pathname: "/pricing",
      hasBackendSession: false,
      hasNextAuthSession: false,
    }),
    false
  );
});

test("/pricing does not accidentally make /coins, /vip or /subscription public", () => {
  for (const pathname of ["/coins", "/vip", "/subscription"]) {
    assert.equal(isPublicRoute(pathname), false, pathname);
    assert.equal(
      shouldRedirectUnauthenticatedToLogin({
        pathname,
        hasBackendSession: false,
        hasNextAuthSession: false,
      }),
      true,
      pathname
    );
  }
});

test("/agency/invite is publicly reachable (personal invite-link landing page) even though /agency is protected", () => {
  assert.equal(isPublicRoute("/agency/invite"), true);
  assert.equal(
    shouldRedirectUnauthenticatedToLogin({
      pathname: "/agency/invite",
      hasBackendSession: false,
      hasNextAuthSession: false,
    }),
    false
  );
});

test("/agency and /agency/invite/anything-else stay protected", () => {
  for (const pathname of ["/agency", "/agency/invite/extra", "/agency/sub-creators"]) {
    assert.equal(isPublicRoute(pathname), false, pathname);
    assert.equal(
      shouldRedirectUnauthenticatedToLogin({
        pathname,
        hasBackendSession: false,
        hasNextAuthSession: false,
      }),
      true,
      pathname
    );
  }
});
