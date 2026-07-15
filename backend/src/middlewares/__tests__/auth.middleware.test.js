jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

const User = require("../../models/User.js");
const { blockAdminSocialAccess } = require("../auth.middleware.js");

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(),
  };
  return res;
};

const makeRoleQuery = (role) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue({ role }),
  })),
});

describe("blockAdminSocialAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("blocks admin users from social endpoints", async () => {
    const req = { userId: "507f1f77bcf86cd799439011", userRole: "admin" };
    const res = makeRes();
    const next = jest.fn();

    await blockAdminSocialAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Los administradores deben usar el panel /admin" });
    expect(next).not.toHaveBeenCalled();
  });

  test("allows regular users through", async () => {
    const req = { userId: "507f1f77bcf86cd799439011", userRole: "user" };
    const res = makeRes();
    const next = jest.fn();

    await blockAdminSocialAccess(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("looks up role when verifyToken did not populate it", async () => {
    User.findById.mockReturnValue(makeRoleQuery("admin"));
    const req = { userId: "507f1f77bcf86cd799439011" };
    const res = makeRes();
    const next = jest.fn();

    await blockAdminSocialAccess(req, res, next);

    expect(User.findById).toHaveBeenCalledWith(req.userId);
    expect(req.userRole).toBe("admin");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
