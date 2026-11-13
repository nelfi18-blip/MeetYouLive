const User = require("../../models/User.js");
const { getInviteInfo } = require("../agency.controller.js");

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

describe("GET /api/agency/invite-info public-identity privacy", () => {
  afterEach(() => jest.restoreAllMocks());

  it("retains the invite-code/response contract without disclosing an email-derived username or surname", async () => {
    jest.spyOn(User, "findOne").mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439012",
        username: "ana.surname1988",
        name: "Ana Rodriguez",
        role: "creator",
        publicName: "Luna Latina",
        avatar: "https://example.com/avatar.png",
        agencyProfile: { agencyName: "Luna Studio" },
      }),
    });
    const res = makeRes();
    await getInviteInfo({ query: { code: "ABCD1234" } }, res);
    expect(res.json).toHaveBeenCalledWith({
      valid: true,
      creator: expect.objectContaining({
        name: "Luna Latina",
        username: "Luna Latina",
        publicName: "Luna Latina",
        agencyName: "Luna Studio",
        agencyCode: "ABCD1234",
      }),
    });
    const body = JSON.stringify(res.json.mock.calls[0][0]);
    expect(body).not.toMatch(/ana\.surname1988|Ana Rodriguez/);
  });

  it("uses only the first name for creators who have not selected a public alias", async () => {
    jest.spyOn(User, "findOne").mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439012",
        username: "ana.surname1988",
        name: "Ana Rodriguez",
        role: "creator",
        avatar: "",
        agencyProfile: { agencyName: "Studio" },
      }),
    });
    const res = makeRes();
    await getInviteInfo({ query: { code: "ABCD1234" } }, res);
    expect(res.json.mock.calls[0][0].creator.name).toBe("Ana");
    expect(res.json.mock.calls[0][0].creator.username).toBe("Ana");
  });

  it("preserves rejection of invalid codes before database access", async () => {
    const spy = jest.spyOn(User, "findOne");
    const res = makeRes();
    await getInviteInfo({ query: { code: "invalid***" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(spy).not.toHaveBeenCalled();
  });
});
