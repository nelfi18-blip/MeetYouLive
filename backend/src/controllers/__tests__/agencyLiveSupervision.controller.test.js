const {
  getAgencyCreatorIds, listAgencyLives, getAgencyLiveAudience, reportAgencyLiveConcern,
} = require("../agencyLiveSupervision.controller.js");
const User = require("../../models/User.js");
const Live = require("../../models/Live.js");
const Report = require("../../models/Report.js");
const AgencyRelationship = require("../../models/AgencyRelationship.js");
const { getLiveAudience } = require("../../lib/socket.js");

jest.mock("../../models/User.js", () => ({ findById: jest.fn() }));
jest.mock("../../models/Live.js", () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock("../../models/Report.js", () => ({ exists: jest.fn(), create: jest.fn() }));
jest.mock("../../models/AgencyRelationship.js", () => ({ find: jest.fn() }));
jest.mock("../../lib/socket.js", () => ({ getLiveAudience: jest.fn() }));

const A = "507f1f77bcf86cd799439011";
const CREATOR = "507f1f77bcf86cd799439012";
const VIEWER = "507f1f77bcf86cd799439013";
const OTHER = "507f1f77bcf86cd799439014";
const LIVE = "507f1f77bcf86cd799439015";
const live = { _id: LIVE, user: CREATOR, title: "Safe public live", guests: [
  { userId: OTHER, status: "active" },
] };
const chain = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn(async () => value),
    populate: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn(async () => value) })) })) })),
  })),
});
function res() {
  return { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    set() { return this; },
    json(value) { this.body = value; return this; } };
}
beforeEach(() => {
  jest.resetAllMocks();
  User.findById.mockReturnValue(chain({ role: "creator", creatorStatus: "approved", agencyProfile: { enabled: true } }));
  AgencyRelationship.find.mockReturnValue(chain([{ subCreator: CREATOR }]));
  Live.findOne.mockReturnValue(chain(live));
  getLiveAudience.mockReturnValue([{ userId: VIEWER, username: "visitor", name: "Private!", avatar: "private.jpg" }]);
  Report.exists.mockResolvedValue(null);
  Report.create.mockResolvedValue({ _id: OTHER });
});
test("only an approved agency can inspect supervised lives", async () => {
  User.findById.mockReturnValue(chain({ role: "user", agencyProfile: { enabled: true } }));
  const response = res();
  await listAgencyLives({ userId: A }, response);
  expect(response.statusCode).toBe(403);
  expect(Live.find).not.toHaveBeenCalled();
});
test("scope requires an active agreed relationship, not client-provided creator ids", async () => {
  await getAgencyCreatorIds(A);
  expect(AgencyRelationship.find).toHaveBeenCalledWith({
    parentCreator: A, status: "active", subCreatorAgreed: true,
  });
});
test("agency audience access is restricted to free public lives of linked creators", async () => {
  const response = res();
  await getAgencyLiveAudience({ userId: A, params: { liveId: LIVE } }, response);
  expect(response.statusCode).toBe(200);
  expect(Live.findOne).toHaveBeenCalledWith(expect.objectContaining({
    _id: LIVE, user: { $in: [CREATOR] }, isLive: true, isPrivate: false,
    isVipOnly: false, entryCost: 0,
  }));
  expect(response.body.viewers).toEqual([{ userId: VIEWER, username: "visitor", role: "viewer" }]);
  expect(response.body.viewers[0]).not.toHaveProperty("avatar");
});
test("agency must not inspect someone else's live", async () => {
  Live.findOne.mockReturnValue(chain(null));
  const response = res();
  await getAgencyLiveAudience({ userId: A, params: { liveId: LIVE } }, response);
  expect(response.statusCode).toBe(404);
  expect(getLiveAudience).not.toHaveBeenCalled();
});
test("agency cannot report random audience member ID", async () => {
  const response = res();
  await reportAgencyLiveConcern({ userId: A, params: { liveId: LIVE },
    body: { targetType: "viewer", targetId: OTHER, category: "harassment", reason: "Threatened another guest" } }, response);
  expect(response.statusCode).toBe(403);
  expect(Report.create).not.toHaveBeenCalled();
});
test("agency can report verified viewer into staff Report queue with audit context", async () => {
  const response = res();
  await reportAgencyLiveConcern({ userId: A, params: { liveId: LIVE },
    body: { targetType: "viewer", targetId: VIEWER, category: "off_platform", reason: "Repeated external payment attempts" } }, response);
  expect(response.statusCode).toBe(201);
  expect(Report.create).toHaveBeenCalledWith(expect.objectContaining({
    reporter: A, targetType: "user", targetId: VIEWER,
    agencyContext: expect.objectContaining({ agencyId: A, liveId: LIVE, creatorId: CREATOR, observedRole: "viewer" }),
  }));
});
test("a report about active on-stage guest is allowed without private messages", async () => {
  const response = res();
  await reportAgencyLiveConcern({ userId: A, params: { liveId: LIVE },
    body: { targetType: "guest", targetId: OTHER, category: "commercial_sex", reason: "Commercial sexual solicitation observed on stage" } }, response);
  expect(response.statusCode).toBe(201);
});
test("duplicate agency reports are blocked within the cooldown", async () => {
  Report.exists.mockResolvedValue({ _id: OTHER });
  const response = res();
  await reportAgencyLiveConcern({ userId: A, params: { liveId: LIVE },
    body: { targetType: "live", category: "fraud", reason: "Host urged off platform transfer" } }, response);
  expect(response.statusCode).toBe(409);
  expect(Report.create).not.toHaveBeenCalled();
});
