"use strict";

// REAL MongoDB integration tests for GET /api/user/discover's authenticity
// gate. Unlike `user.discover-authenticity.test.js` (mocked User/Live
// models with a hand-rolled Mongo-match simulator), this file connects to
// an ACTUAL MongoDB replica set and exercises the REAL aggregation
// pipeline, the REAL `applyAuthenticityDiscoverFilter`/`getAuthenticityStatus`
// decision, and — the point of this suite — the REAL pagination retry loop
// in the `/discover` route, which must never return an incomplete page when
// enough eligible candidates exist further down the sorted result set, even
// though many ineligible ("not yet Perfil Auténtico") candidates sort ahead
// of them.
//
// Only the auth middleware is mocked (to inject `req.userId` without a real
// JWT) — every model/service underneath (User, Live, the authenticity lib,
// the discovery lib) is the genuine, unmocked implementation.
//
// This suite requires a reachable MongoDB REPLICA SET URI in the
// `INTEGRATION_MONGO_URI` environment variable (kept consistent with
// `creator.payout.integration.test.js`, including the same disposable,
// local-only container recipe). If unset, the whole suite is SKIPPED — not
// failed — so routine `npm test`/CI runs that don't provision Mongo are
// unaffected.
//
// How this was run for this change (documented for the PR):
//   docker run -d --name mytests-mongo -p 27117:27017 mongo:6 --replSet rs0 --bind_ip_all
//   docker exec mytests-mongo mongosh --quiet --eval \
//     "rs.initiate({_id:'rs0', members:[{_id:0, host:'localhost:27017'}]})"
//   INTEGRATION_MONGO_URI="mongodb://127.0.0.1:27117/meetyoulive_discover_test?replicaSet=rs0&directConnection=true" \
//     npx jest src/routes/__tests__/user.discover-authenticity.integration.test.js
//
// NEVER point this at a production/Atlas URI: these tests freely create and
// delete Users/Live docs in whatever database the URI points to.

const INTEGRATION_MONGO_URI = process.env.INTEGRATION_MONGO_URI;

const describeIfRealMongo = INTEGRATION_MONGO_URI ? describe : describe.skip;

if (!INTEGRATION_MONGO_URI) {
  // eslint-disable-next-line no-console
  console.warn(
    "[user.discover-authenticity.integration.test.js] SKIPPED — set INTEGRATION_MONGO_URI to a " +
      "disposable local MongoDB *replica set* URI to run these real-Mongo Discover tests " +
      "(see file header for a docker-based example)."
  );
}

// Mutable closure read lazily at request time (after beforeEach has set the
// current viewer), so no `jest.resetModules()`/`jest.doMock()` per test is
// needed — only this one dependency is ever faked.
let mockCurrentViewerId = null;
jest.mock("../../middlewares/auth.middleware.js", () => ({
  verifyToken: (req, _res, next) => {
    req.userId = mockCurrentViewerId;
    next();
  },
  optionalVerifyToken: (_req, _res, next) => next(),
}));

const PHOTO_A = "https://cdn.example.com/discover-it/a.jpg";
const PHOTO_B = "https://cdn.example.com/discover-it/b.jpg";
const PHOTO_B_UNTRIMMED = "  https://cdn.example.com/discover-it/b.jpg  ";

describeIfRealMongo("GET /api/user/discover — authenticity gate, REAL MongoDB", () => {
  jest.setTimeout(60000);

  let mongoose;
  let User;
  let app;

  const ORIGINAL_ENV = {
    PROFILE_AUTHENTICITY_ENFORCED: process.env.PROFILE_AUTHENTICITY_ENFORCED,
    PROFILE_AUTHENTICITY_NEW_USERS_FROM: process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM,
  };

  beforeAll(async () => {
    mongoose = require("mongoose");
    await mongoose.connect(INTEGRATION_MONGO_URI);
    User = require("../../models/User.js");

    // Everyone created in this suite is "new" for authenticity purposes —
    // the cutoff is set far in the past (getAuthenticityConfig() re-reads
    // process.env on every call, so this is honored live by every request).
    process.env.PROFILE_AUTHENTICITY_ENFORCED = "true";
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = "2000-01-01T00:00:00.000Z";

    const express = require("express");
    const userRoutes = require("../user.routes.js");
    app = express();
    app.use(express.json());
    app.use("/api/user", userRoutes);
  });

  afterAll(async () => {
    process.env.PROFILE_AUTHENTICITY_ENFORCED = ORIGINAL_ENV.PROFILE_AUTHENTICITY_ENFORCED;
    process.env.PROFILE_AUTHENTICITY_NEW_USERS_FROM = ORIGINAL_ENV.PROFILE_AUTHENTICITY_NEW_USERS_FROM;
    if (mongoose?.connection?.readyState) {
      await mongoose.connection.close();
    }
  });

  let viewer;
  beforeEach(async () => {
    await User.deleteMany({});
    viewer = await User.create({
      email: `viewer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: "hashed-placeholder",
      onboardingComplete: true,
      gender: "female",
    });
    mockCurrentViewerId = String(viewer._id);
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  let seq = 0;
  const createUser = async ({ eligible, createdAt }) => {
    seq += 1;
    const tag = `${Date.now()}_${seq}_${Math.random().toString(36).slice(2, 8)}`;
    const base = {
      email: `discover_it_${tag}@example.com`,
      password: "hashed-placeholder",
      onboardingComplete: true,
      emailVerified: true,
      gender: "female",
    };
    const doc = eligible
      ? {
          ...base,
          primaryPhoto: PHOTO_A,
          profilePhotos: [PHOTO_A, PHOTO_B],
          photoVerification: { status: "verified", verifiedPhoto: PHOTO_A },
        }
      : {
          // Deliberately passes the cheap Mongo boolean prefilter
          // (emailVerified + photoVerification.status === "verified", see
          // buildAuthenticityDiscoverFilter) but still only has ONE
          // distinct public photo — so it is excluded only by the full JS
          // `getAuthenticityStatus` decision made AFTER the aggregation's
          // `$limit`. This is exactly what must NOT shrink a page below the
          // requested size when enough other eligible candidates exist.
          ...base,
          primaryPhoto: PHOTO_A,
          profilePhotos: [PHOTO_A],
          photoVerification: { status: "verified", verifiedPhoto: PHOTO_A },
        };
    const user = await User.create(doc);
    await User.collection.updateOne({ _id: user._id }, { $set: { createdAt } });
    return user;
  };

  test(
    "[REAL MONGO] PAGINATION: never returns an incomplete page when ineligible candidates sort ahead of enough eligible ones",
    async () => {
      const now = Date.now();
      // 30 ineligible users, all NEWER than the 10 eligible ones below, so
      // the default fetch window (`skip + limit * LOCATION_FILTER_FETCH_MULTIPLIER`,
      // i.e. 25 for limit=5/skip=0, or 30 for limit=5/skip=5) is entirely
      // consumed by candidates that fail the authenticity check — exactly
      // the scenario that used to truncate pages before the retry loop.
      const ineligibleUsers = [];
      for (let i = 0; i < 30; i += 1) {
        ineligibleUsers.push(
          await createUser({ eligible: false, createdAt: new Date(now - i * 1000) })
        );
      }
      const eligibleUsers = [];
      for (let i = 0; i < 10; i += 1) {
        eligibleUsers.push(
          await createUser({ eligible: true, createdAt: new Date(now - 100000 - i * 1000) })
        );
      }

      const request = require("supertest");

      const page1 = await request(app).get("/api/user/discover?limit=5&page=1");
      expect(page1.status).toBe(200);
      expect(page1.body.users).toHaveLength(5);

      const page2 = await request(app).get("/api/user/discover?limit=5&page=2");
      expect(page2.status).toBe(200);
      expect(page2.body.users).toHaveLength(5);

      const page3 = await request(app).get("/api/user/discover?limit=5&page=3");
      expect(page3.status).toBe(200);
      expect(page3.body.users).toHaveLength(0); // exactly 10 eligible users, exhausted after 2 pages

      const returnedIds = [...page1.body.users, ...page2.body.users].map((u) => String(u._id));
      const eligibleIds = eligibleUsers.map((u) => String(u._id));
      const ineligibleIds = new Set(ineligibleUsers.map((u) => String(u._id)));

      // Every eligible user was returned exactly once across the two pages,
      // and no ineligible user ever leaked through.
      expect(new Set(returnedIds)).toEqual(new Set(eligibleIds));
      returnedIds.forEach((id) => expect(ineligibleIds.has(id)).toBe(false));
    }
  );

  test(
    "[REAL MONGO] mixed valid/invalid candidates: duplicate and whitespace-padded photo URLs are evaluated identically to the backend's own dedup logic",
    async () => {
      const now = Date.now();
      const eligibleTwoDistinct = await createUser({ eligible: true, createdAt: new Date(now - 1000) });

      const duplicateUrlUser = await User.create({
        email: `discover_it_dup_${Date.now()}@example.com`,
        password: "hashed-placeholder",
        onboardingComplete: true,
        emailVerified: true,
        gender: "female",
        primaryPhoto: PHOTO_A,
        // Same URL twice => only ONE distinct public photo => ineligible.
        profilePhotos: [PHOTO_A, PHOTO_A],
        photoVerification: { status: "verified", verifiedPhoto: PHOTO_A },
      });
      await User.collection.updateOne({ _id: duplicateUrlUser._id }, { $set: { createdAt: new Date(now - 2000) } });

      const whitespaceUrlUser = await User.create({
        email: `discover_it_ws_${Date.now()}@example.com`,
        password: "hashed-placeholder",
        onboardingComplete: true,
        emailVerified: true,
        gender: "female",
        primaryPhoto: PHOTO_A,
        // Same photo, but padded with whitespace => normalizes to the SAME
        // distinct set as PHOTO_A/PHOTO_B => still eligible, same as the
        // trimmed version would be.
        profilePhotos: [PHOTO_A, PHOTO_B_UNTRIMMED],
        photoVerification: { status: "verified", verifiedPhoto: PHOTO_A },
      });
      await User.collection.updateOne({ _id: whitespaceUrlUser._id }, { $set: { createdAt: new Date(now - 3000) } });

      const unverifiedSelfieUser = await User.create({
        email: `discover_it_unselfie_${Date.now()}@example.com`,
        password: "hashed-placeholder",
        onboardingComplete: true,
        emailVerified: true,
        gender: "female",
        primaryPhoto: PHOTO_A,
        profilePhotos: [PHOTO_A, PHOTO_B],
        photoVerification: { status: "pending" },
      });
      await User.collection.updateOne({ _id: unverifiedSelfieUser._id }, { $set: { createdAt: new Date(now - 4000) } });

      const request = require("supertest");
      const res = await request(app).get("/api/user/discover?limit=10&page=1");
      expect(res.status).toBe(200);

      const returnedIds = new Set(res.body.users.map((u) => String(u._id)));
      expect(returnedIds.has(String(eligibleTwoDistinct._id))).toBe(true);
      expect(returnedIds.has(String(whitespaceUrlUser._id))).toBe(true);
      expect(returnedIds.has(String(duplicateUrlUser._id))).toBe(false);
      expect(returnedIds.has(String(unverifiedSelfieUser._id))).toBe(false);
    }
  );
});
