const mockExists = jest.fn();
const mockFind = jest.fn();
jest.mock("../../models/User.js", () => ({
  exists: mockExists,
  find: mockFind,
}));
const { normalizeAgencyName, isAgencyNameAvailable, isAgencyNameDuplicateError } = require("../agencyName.service.js");

const findResult = (records) => ({ select: () => ({ lean: async () => records }) });

describe("agency name reservations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExists.mockResolvedValue(null);
    mockFind.mockReturnValue(findResult([]));
  });

  test.each([
    ["  Agencia   Estrellas  ", "agenciaestrellas", "Agencia Estrellas"],
    ["AGÉNCIA-ESTRELLAS", "agenciaestrellas", "AGÉNCIA-ESTRELLAS"],
    ["Agençia Estrellas!", "agenciaestrellas", "Agençia Estrellas!"],
    ["Agencia  123", "agencia123", "Agencia 123"],
    ["東京 会社", "東京会社", "東京 会社"],
  ])("canonicalization prevents equivalent agency names", (input, key, displayName) => {
    expect(normalizeAgencyName(input)).toEqual({ key, displayName });
  });

  test.each(["", "  ", "ab", "<iframe>", "Great\nAgency", 42, null, "?!*"])("rejects invalid agency names", (name) => {
    expect(normalizeAgencyName(name)).toBeNull();
  });

  test("nameKey reservation blocks duplicate without scanning legacy users", async () => {
    mockExists.mockResolvedValue({ _id: "previous-applicant" });
    const result = await isAgencyNameAvailable("  ÁGENCIA  Sol  ");
    expect(result.available).toBe(false);
    expect(mockExists).toHaveBeenCalledWith({ "agencyProfile.nameKey": "agenciasol" });
    expect(mockFind).not.toHaveBeenCalled();
  });

  test("legacy active agency blocks the same name even without a reservation key", async () => {
    mockFind.mockReturnValue(findResult([
      { agencyProfile: { enabled: true, agencyName: "Agéncia Estrellas" } },
    ]));
    const result = await isAgencyNameAvailable("Agencia-Estrellas");
    expect(result.available).toBe(false);
    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
      "agencyProfile.nameKey": { $exists: false },
    }));
  });

  test("legacy pending request also reserves a name", async () => {
    mockFind.mockReturnValue(findResult([
      { agencyProfile: { enabled: false, requestStatus: "pending", requestedName: "Mi Estudio" } },
    ]));
    expect((await isAgencyNameAvailable("mi-estudio")).available).toBe(false);
  });

  test("rejected legacy request does not reserve a name", async () => {
    mockFind.mockReturnValue(findResult([
      { agencyProfile: { enabled: false, requestStatus: "rejected", requestedName: "Mi Estudio" } },
    ]));
    expect((await isAgencyNameAvailable("mi-estudio")).available).toBe(true);
  });

  test("can exclude own user while checking a name", async () => {
    await isAgencyNameAvailable("Agencia Sol", { excludeUserId: "my-user-id" });
    expect(mockExists).toHaveBeenCalledWith({
      "agencyProfile.nameKey": "agenciasol", _id: { $ne: "my-user-id" },
    });
  });

  test("duplicate key errors are specific to agency names", () => {
    expect(isAgencyNameDuplicateError({
      code: 11000, keyPattern: { "agencyProfile.nameKey": 1 },
    })).toBe(true);
    expect(isAgencyNameDuplicateError({
      code: 11000, keyPattern: { email: 1 }, message: "duplicate email",
    })).toBe(false);
  });
});
