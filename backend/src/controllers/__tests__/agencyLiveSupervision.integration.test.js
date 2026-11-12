"use strict";
// HTTP auth/agency/staff routes, persisted Report and MongoDB transaction races.
// Live/audience are explicit synthetic fixtures, not media or human surveillance.
const uri = process.env.INTEGRATION_MONGO_URI;
const withMongo = uri ? describe : describe.skip;
withMongo("agency Live supervision through central moderation — real MongoDB", () => {
  jest.setTimeout(40000);
  let mongoose, User, Live, Link, Report, Guard, Audit, app, agency, foreign, creator, viewer, guest, admin, moderator, live;
  let ipCounter = 0, ip;
  const originalSecret = process.env.JWT_SECRET;
  const token = (user) => require("jsonwebtoken").sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const request = (user = agency) => {
    const agent = require("supertest")(app);
    return { get: (path) => agent.get(path).set("Authorization", "Bearer " + token(user)).set("X-Forwarded-For", ip),
      post: (path) => agent.post(path).set("Authorization", "Bearer " + token(user)).set("X-Forwarded-For", ip),
      patch: (path) => agent.patch(path).set("Authorization", "Bearer " + token(user)).set("X-Forwarded-For", ip) };
  };
  const audiencePath = () => `/api/agency/supervision/lives/${live._id}/audience`;
  const reportPath = () => `/api/agency/supervision/lives/${live._id}/reports`;
  const body = (changes = {}) => ({ targetType: "live", category: "harassment", reason: "Observed repeated threats in the public stream", ...changes });
  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) throw new Error("Disposable localhost MongoDB only");
    process.env.JWT_SECRET = "agency-integration-synthetic-only";
    mongoose = require("mongoose"); await mongoose.connect(uri, { autoIndex: false });
    User = require("../../models/User.js"); Live = require("../../models/Live.js");
    Link = require("../../models/AgencyRelationship.js"); Report = require("../../models/Report.js");
    Guard = require("../../models/AgencyReportGuard.js"); Audit = require("../../models/StaffAuditLog.js");
    const express = require("express"); app = express(); app.set("trust proxy", 1); app.use(express.json());
    app.use("/api/agency", require("../../routes/agency.routes.js"));
    app.use("/api/admin", require("../../routes/admin.routes.js"));
    for (const model of Object.values(mongoose.models)) await model.createCollection();
    await Report.createIndexes();
  });
  beforeEach(async () => {
    ip = `172.30.0.${++ipCounter}`;
    const user = (name, extras = {}) => User.create({ username: `agency_test_${name}`, email: `${name}@example.invalid`, password: "synthetic-password", ...extras });
    agency = await user("owner", { role: "creator", creatorStatus: "approved", agencyProfile: { enabled: true } });
    foreign = await user("foreign", { role: "creator", creatorStatus: "approved", agencyProfile: { enabled: true } });
    creator = await user("creator", { role: "creator", creatorStatus: "approved" });
    viewer = await user("viewer"); guest = await user("guest"); admin = await user("admin", { role: "admin" }); moderator = await user("moderator", { role: "moderator" });
    await Link.create({ parentCreator: agency._id, subCreator: creator._id, createdBy: admin._id, percentage: 10, status: "active", subCreatorAgreed: true });
    live = await Live.create({ user: creator._id, title: "Synthetic public Live", streamKey: "synthetic-test-key", isLive: true,
      guests: [{ userId: guest._id, status: "active" }] });
    require("../../lib/socket.js").addViewerToLive({ liveId: String(live._id), socketId: "synthetic-audience-fixture", hostUserId: String(creator._id),
      user: { _id: viewer._id, username: viewer.username, email: viewer.email, avatar: "private-fixture.jpg" } });
  });
  afterEach(async () => {
    require("../../lib/socket.js").clearLiveRoomState(String(live._id));
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  });
  afterAll(async () => {
    if (mongoose?.connection.readyState) await mongoose.disconnect();
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
  });
  test("authorized agency → own public Live → audience → Report → Admin list → central resolution", async () => {
    const list = await request().get("/api/agency/supervision/lives"); expect(list.status).toBe(200);
    expect(list.body.lives.map((l) => l.id)).toEqual([String(live._id)]);
    const audience = await request().get(audiencePath()); expect(audience.status).toBe(200);
    expect(audience.body.viewers).toEqual([{ userId: String(viewer._id), username: viewer.username, role: "viewer" }]);
    expect(JSON.stringify(audience.body)).not.toContain(viewer.email);
    const submitted = await request().post(reportPath()).send(body({ targetType: "viewer", targetId: String(viewer._id) }));
    expect(submitted.status).toBe(201);
    const saved = await Report.findById(submitted.body.reportId).lean();
    expect(String(saved.targetId)).toBe(String(viewer._id)); expect(saved.agencyContext.observedRole).toBe("viewer");
    expect(String(saved.agencyContext.agencyId)).toBe(String(agency._id));
    const reports = await request(admin).get("/api/admin/reports?status=pending"); expect(reports.status).toBe(200);
    expect(reports.body.reports[0]._id).toBe(submitted.body.reportId);
    expect(reports.body.reports[0].agencyContext.category).toBe("harassment");
    expect((await request().get("/api/admin/reports")).status).toBe(403);
    expect((await request().patch(`/api/admin/reports/${saved._id}`).send({ status: "reviewed" })).status).toBe(403);
    const resolved = await request(moderator).patch(`/api/admin/reports/${saved._id}`).send({ status: "reviewed" });
    expect(resolved.status).toBe(200); expect((await Report.findById(saved._id)).status).toBe("reviewed");
    expect((await Audit.findOne({ targetId: saved._id, action: "update_report" })).staffRole).toBe("moderator");
    expect((await request(admin).get("/api/admin/reports?status=pending")).body.total).toBe(0);
    expect((await request(admin).get("/api/admin/reports?status=reviewed")).body.total).toBe(1);
  });
  test("different category or different incident text for the same target is accepted immediately", async () => {
    expect((await request().post(reportPath()).send(body())).status).toBe(201);
    expect((await request().post(reportPath()).send(body({ category: "fraud" }))).status).toBe(201);
    expect((await request().post(reportPath()).send(body({ reason: "Observed a different incident in the same stream" }))).status).toBe(201);
    expect(await Report.countDocuments()).toBe(3);
  });
  test("exact duplicate and case/whitespace variants are deduplicated", async () => {
    expect((await request().post(reportPath()).send(body())).status).toBe(201);
    const duplicate = await request().post(reportPath()).send(body({ reason: "  OBSERVED   repeated threats in the public stream  " }));
    expect(duplicate.status).toBe(409); expect(duplicate.body.code).toBe("ALREADY_REPORTED"); expect(await Report.countDocuments()).toBe(1);
  });
  test("five simultaneous identical reports commit exactly once", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => request().post(reportPath()).send(body())));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]); expect(await Report.countDocuments()).toBe(1);
  });
  test("different concurrent incidents are not blocked by the serialization lock", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => request().post(reportPath()).send(body({ reason: `Different observed incident number ${i}` }))));
    expect(results.every((r) => r.status === 201)).toBe(true); expect(await Report.countDocuments()).toBe(4);
  });
  test("legacy reports are deduplicated without backfill and resolved duplicates stay in cooldown", async () => {
    await Report.create({ reporter: agency._id, targetType: "live", targetId: live._id, reason: body().reason, status: "reviewed",
      agencyContext: { agencyId: agency._id, liveId: live._id, creatorId: creator._id, category: "harassment", observedRole: "host" } });
    expect((await request().post(reportPath()).send(body())).status).toBe(409);
    await Report.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 11 * 60000) } });
    expect((await request().post(reportPath()).send(body())).status).toBe(201);
  });
  test("durable per-agency quota survives changed IP and resolving reports", async () => {
    await Report.insertMany(Array.from({ length: 30 }, (_, i) => ({ reporter: agency._id, targetType: "live", targetId: live._id, reason: `Synthetic previous incident ${i}`, status: "reviewed",
      agencyContext: { agencyId: agency._id, liveId: live._id, creatorId: creator._id, category: "other", observedRole: "host" } })));
    const result = await request().post(reportPath()).set("X-Forwarded-For", "172.31.1.9").send(body());
    expect(result.status).toBe(429); expect(result.body.code).toBe("REPORT_RATE_LIMIT"); expect(await Report.countDocuments()).toBe(30);
  });
  test("failed report persistence rolls back the guard transaction and permits retry", async () => {
    const original = Report.create;
    const spy = jest.spyOn(Report, "create").mockRejectedValueOnce(new Error("Synthetic insert failure"));
    try { expect((await request().post(reportPath()).send(body())).status).toBe(503); } finally { spy.mockRestore(); }
    expect(Report.create).toBe(original); expect(await Report.countDocuments()).toBe(0); expect((await Guard.findById(agency._id)).revision).toBe(0);
    expect((await request().post(reportPath()).send(body())).status).toBe(201);
  });
  test("another agency cannot inspect or report a foreign audience", async () => {
    expect((await request(foreign).get("/api/agency/supervision/lives")).body.lives).toEqual([]);
    expect((await request(foreign).get(audiencePath())).status).toBe(404);
    expect((await request(foreign).post(reportPath()).send(body())).status).toBe(404); expect(await Report.countDocuments()).toBe(0);
  });
  test.each(["pending", "suspended", "removed", "unagreed"])("relationship %s does not grant supervision", async (status) => {
    await Link.updateOne({ parentCreator: agency._id }, status === "unagreed" ? { subCreatorAgreed: false } : { status });
    expect((await request().get("/api/agency/supervision/lives")).body.lives).toEqual([]);
    expect((await request().get(audiencePath())).status).toBe(404); expect((await request().post(reportPath()).send(body())).status).toBe(404);
  });
  test.each([{ isPrivate: true }, { isVipOnly: true }, { entryCost: 1 }, { isLive: false }])("restricted Live %j cannot be supervised", async (changes) => {
    await Live.updateOne({ _id: live._id }, changes);
    expect((await request().get("/api/agency/supervision/lives")).body.lives).toEqual([]);
    expect((await request().get(audiencePath())).status).toBe(404); expect((await request().post(reportPath()).send(body())).status).toBe(404);
  });
  test.each([{ "agencyProfile.enabled": false }, { isSuspended: true }, { creatorStatus: "pending" }, { role: "user" }])("agency access revocation %j is enforced on every endpoint", async (changes) => {
    await User.updateOne({ _id: agency._id }, changes);
    expect((await request().get("/api/agency/supervision/lives")).status).toBe(403);
    expect((await request().get(audiencePath())).status).toBe(403); expect((await request().post(reportPath()).send(body())).status).toBe(403);
  });
  test("an expired session cannot list, inspect or report", async () => {
    const expired = require("jsonwebtoken").sign({ id: String(agency._id) }, process.env.JWT_SECRET, { expiresIn: -1 });
    for (const path of ["/api/agency/supervision/lives", audiencePath()]) expect((await require("supertest")(app).get(path).set("Authorization", "Bearer " + expired)).status).toBe(401);
    expect((await require("supertest")(app).post(reportPath()).set("Authorization", "Bearer " + expired).send(body())).status).toBe(401);
  });
  test("only verified audience/active guests may be reported; arbitrary IDs and private fields never pass", async () => {
    expect((await request().post(reportPath()).send(body({ targetType: "viewer", targetId: String(foreign._id) }))).status).toBe(403);
    expect((await request().post(reportPath()).send(body({ targetType: "guest", targetId: String(guest._id) }))).status).toBe(201);
    expect((await request().post(reportPath()).send(body({ targetType: "unsupported", targetId: String(viewer._id) }))).status).toBe(400);
    await Live.updateOne({ _id: live._id }, { "guests.0.status": "disconnected" });
    expect((await request().post(reportPath()).send(body({ targetType: "guest", targetId: String(guest._id), reason: "A different observed incident on stage" }))).status).toBe(403);
  });
});
