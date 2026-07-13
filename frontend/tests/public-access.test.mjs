import test from "node:test";
import assert from "node:assert/strict";
import { middleware } from "../middleware.js";

const HOSTS = ["meetyoulive.net", "www.meetyoulive.net"];
const PUBLIC_PATHS = ["/", "/privacy", "/terms", "/refund", "/contact"];
const SESSION_COOKIES = {
  "auth-session": "backend-session",
  "__Secure-next-auth.session-token": "next-auth-session",
};

function createRequest(pathname, { host, cookies = {} }) {
  const url = new URL(`https://${host}${pathname}`);

  return {
    nextUrl: {
      pathname: url.pathname,
      search: url.search,
      clone: () => new URL(url.href),
    },
    headers: new Headers({ host }),
    cookies: {
      get(name) {
        return cookies[name] ? { value: cookies[name] } : undefined;
      },
    },
  };
}

function assertPublicResponse(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(
    [...response.headers.values()].some((value) => value.includes("/login")),
    false
  );
}

test("public routes stay public on apex and www without session cookies", () => {
  for (const host of HOSTS) {
    for (const pathname of PUBLIC_PATHS) {
      const response = middleware(createRequest(pathname, { host }));
      assertPublicResponse(response);
    }
  }
});

test("public routes stay public on apex and www with session cookies", () => {
  for (const host of HOSTS) {
    for (const pathname of PUBLIC_PATHS) {
      const response = middleware(
        createRequest(pathname, { host, cookies: SESSION_COOKIES })
      );
      assertPublicResponse(response);
    }
  }
});

test("protected routes still redirect unauthenticated visitors to login", () => {
  const response = middleware(createRequest("/feed", { host: "www.meetyoulive.net" }));
  const location = response.headers.get("location");

  assert.match(location, /^https:\/\/www\.meetyoulive\.net\/login\?/);
  assert.match(location, /callbackUrl=%2Ffeed/);
});
