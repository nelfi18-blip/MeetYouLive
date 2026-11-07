const { normalizeLocationCoordinates, normalizeLocationForUserUpdate } = require("../location.js");

describe("GPS coordinate normalization", () => {
  test("does not turn empty UI coordinates into 0,0", () => {
    for (const input of [{ coordinates: { lat: null, lng: null } },
      { coordinates: { lat: "", lng: "" } }, { coordinates: [] }]) {
      expect(normalizeLocationCoordinates(input)).toBeUndefined();
      expect(normalizeLocationForUserUpdate(input).locationPoint).toBeNull();
    }
  });
  test("preserves valid zero, negative and positive positions", () => {
    expect(normalizeLocationCoordinates({ coordinates: [0, 0] })).toEqual([0, 0]);
    expect(normalizeLocationCoordinates({ lat: 42.36, lng: -71.06 })).toEqual([-71.06, 42.36]);
  });
  test("rejects out-of-range coordinates", () => {
    expect(normalizeLocationCoordinates({ lat: 91, lng: 0 })).toBeUndefined();
    expect(normalizeLocationCoordinates({ lat: 0, lng: -181 })).toBeUndefined();
  });
});
