jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock("../../models/Gift", () => ({}));
jest.mock("../../models/Payout", () => ({}));
jest.mock("../../models/Live", () => ({}));
jest.mock("../../models/VideoCall", () => ({}));
jest.mock("../../models/CoinTransaction", () => ({}));
jest.mock("../../models/AgencyRelationship", () => ({}));

const User = require("../../models/User.js");
const { submitCreatorRequest } = require("../creator.controller.js");
const { CREATOR_BIRTHDATE_REQUIRED, CREATOR_AGE_RESTRICTED, CREATOR_ELIGIBILITY_CONSENT_REQUIRED } =
  require("../../lib/creatorEligibility.js");

const makeResponse = () => {
  const res = {
    statusCode: 200,
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn(() => res),
  };
  return res;
};

const yearsAgo = (years) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
};

const validBody = {
  displayName: "Creator Name",
  bio: "About me",
  category: "Música",
  country: "México",
  languages: ["es"],
  eligibilityAccepted: true,
  creatorRulesAccepted: true,
};

const makeUser = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  role: "user",
  creatorStatus: "none",
  birthdate: yearsAgo(25),
  save: jest.fn(async function save() {
    return this;
  }),
  ...overrides,
});

describe("submitCreatorRequest — 18+ eligibility gateway", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects with CREATOR_BIRTHDATE_REQUIRED when birthdate is missing", async () => {
    const user = makeUser({ birthdate: null });
    User.findById.mockResolvedValue(user);

    const req = { userId: user._id, body: validBody };
    const res = makeResponse();

    await submitCreatorRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, code: CREATOR_BIRTHDATE_REQUIRED }));
    expect(user.save).not.toHaveBeenCalled();
  });

  test("rejects with CREATOR_AGE_RESTRICTED when the user is under 18", async () => {
    const user = makeUser({ birthdate: yearsAgo(16) });
    User.findById.mockResolvedValue(user);

    const req = { userId: user._id, body: validBody };
    const res = makeResponse();

    await submitCreatorRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, code: CREATOR_AGE_RESTRICTED }));
    expect(user.save).not.toHaveBeenCalled();
  });

  test("rejects with CREATOR_ELIGIBILITY_CONSENT_REQUIRED when consent flags are absent", async () => {
    const user = makeUser();
    User.findById.mockResolvedValue(user);

    const req = { userId: user._id, body: { ...validBody, eligibilityAccepted: undefined, creatorRulesAccepted: undefined } };
    const res = makeResponse();

    await submitCreatorRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, code: CREATOR_ELIGIBILITY_CONSENT_REQUIRED })
    );
    expect(user.save).not.toHaveBeenCalled();
  });

  test("does not trust a client-submitted flag without a valid stored birthdate", async () => {
    const user = makeUser({ birthdate: null });
    User.findById.mockResolvedValue(user);

    const req = { userId: user._id, body: { ...validBody, isAdult: true, age: 30 } };
    const res = makeResponse();

    await submitCreatorRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: CREATOR_BIRTHDATE_REQUIRED }));
  });

  test("accepts an eligible adult who explicitly confirms both consents", async () => {
    const user = makeUser();
    User.findById.mockResolvedValue(user);

    const req = { userId: user._id, body: validBody };
    const res = makeResponse();

    await submitCreatorRequest(req, res);

    expect(user.save).toHaveBeenCalled();
    expect(user.creatorStatus).toBe("pending");
    expect(user.creatorApplication.eligibilityAcceptedAt).toBeInstanceOf(Date);
    expect(user.creatorApplication.eligibilityVersion).toEqual(expect.any(String));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, creatorStatus: "pending" }));
  });
});
