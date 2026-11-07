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

  test("public profile location strips precise coordinates and unexpected fields", () => {
    const { toPublicLocation } = require("../location.js");
    expect(toPublicLocation({
      type: "Point", coordinates: [-71.06, 42.36],
      country: "Estados Unidos", city: "Boston", region: "Massachusetts",
      label: "Boston, Massachusetts", hidden: "must never leak",
    })).toEqual({
      country: "Estados Unidos", city: "Boston",
      region: "Massachusetts", label: "Boston, Massachusetts",
    });
  });

  test("Discover serializes GPS only after internal nearby filtering", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "../../routes/user.routes.js"), "utf8");
    const start = source.indexOf('router.get("/discover"');
    const finish = source.indexOf('router.post("/me/creator-request"', start);
    expect(start).toBeGreaterThan(-1);
    expect(finish).toBeGreaterThan(start);
    const discover = source.slice(start, finish);
    expect(discover).toContain("applyDiscoveryLocationFilter");
    expect(discover).toContain("u.location = toPublicLocation(u.location)");
    expect(discover.indexOf("applyDiscoveryLocationFilter")).toBeLessThan(discover.indexOf("u.location = toPublicLocation(u.location)"));
  });
});
