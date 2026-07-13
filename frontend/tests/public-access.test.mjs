import test from "node:test";
import assert from "node:assert/strict";
import {
  isPublicRoute,
  shouldRedirectUnauthenticatedToLogin,
} from "../lib/publicAccess.js";

const HOSTS = ["meetyoulive.net", "www.meetyoulive.net"];
const PUBLIC_PATHS = ["/", "/privacy", "/terms", "/refund", "/contact"];
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
