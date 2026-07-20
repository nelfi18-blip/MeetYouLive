const User = require("../../models/User.js");
const { requireAdmin } = require("../admin.middleware.js");

jest.mock("../../models/User.js", () => ({
  findById: jest.fn(),
}));

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(),
  };
  return res;
};

describe("admin middleware", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("administrator can still access admin routes", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ role: "admin" }),
    });
    const req = { userId: "admin-user-id" };
    const res = makeRes();
    const next = jest.fn();

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userRole).toBe("admin");
    expect(res.status).not.toHaveBeenCalled();
  });
});
