const { isInterestedInConfirmed } = require("../discovery.js");

describe("isInterestedInConfirmed", () => {
  test("a brand new user (no interestedIn, no flag) is never considered confirmed", () => {
    expect(isInterestedInConfirmed({})).toBe(false);
    expect(isInterestedInConfirmed({ interestedIn: "" })).toBe(false);
    expect(isInterestedInConfirmed({ interestedIn: null })).toBe(false);
  });

  test("a stored default 'both' without the confirmation flag is NOT assumed explicit", () => {
    expect(isInterestedInConfirmed({ interestedIn: "both" })).toBe(false);
    expect(isInterestedInConfirmed({ interestedIn: "both", interestedInConfirmed: false })).toBe(false);
  });

  test("an explicit 'both' selection IS confirmed once the flag is set", () => {
    expect(isInterestedInConfirmed({ interestedIn: "both", interestedInConfirmed: true })).toBe(true);
  });

  test("legacy non-'both' values are treated as implicitly confirmed (no destructive migration needed)", () => {
    expect(isInterestedInConfirmed({ interestedIn: "men" })).toBe(true);
    expect(isInterestedInConfirmed({ interestedIn: "women" })).toBe(true);
    expect(isInterestedInConfirmed({ interestedIn: "male" })).toBe(true);
    expect(isInterestedInConfirmed({ interestedIn: "female" })).toBe(true);
  });

  test("explicit men/women selections remain confirmed even without the flag set", () => {
    expect(isInterestedInConfirmed({ interestedIn: "men", interestedInConfirmed: undefined })).toBe(true);
  });
});


describe("manual country selection and GPS-based Discovery", () => {
  const { buildDiscoveryLocationMatch, applyDiscoveryLocationFilter, getLocationCoordinates } = require("../discovery.js");
  const home = { country: "Estados Unidos", city: "Boston", coordinates: [-71.06, 42.36] };

  test("selected foreign country is searched without changing physical location", () => {
    const viewer = { discoveryScope: "country", location: home, discoveryPreferences: { searchCountry: "México" } };
    const savedGps = JSON.stringify(viewer.location);
    const query = buildDiscoveryLocationMatch(viewer);
    expect(Object.keys(query)).toEqual(["location.country"]);
    expect(query["location.country"].test("México")).toBe(true);
    expect(query["location.country"].test("Estados Unidos")).toBe(false);
    expect(JSON.stringify(viewer.location)).toBe(savedGps);
  });

  test("legacy manual country and city matching remains when no search destination chosen", () => {
    const query = buildDiscoveryLocationMatch({
      discoveryScope: "country", location: home, discoveryPreferences: { searchCountry: "" },
    });
    expect(query.$and).toHaveLength(2);
    expect(query.$and[0]["location.country"].test("Estados Unidos")).toBe(true);
    expect(query.$and[1]["location.city"].test("Boston")).toBe(true);
  });

  test("nearby Discovery uses the actual GPS position and ignores any saved remote country", () => {
    const viewer = {
      discoveryScope: "nearby", maxDistanceKm: 25,
      location: home, discoveryPreferences: { searchCountry: "México" },
    };
    const candidates = [
      { location: { coordinates: [-71.07, 42.37] } },
      { location: { coordinates: [-99.13, 19.43] } },
    ];
    const matches = applyDiscoveryLocationFilter(viewer, candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].distanceKm).toBeLessThan(25);
  });

  test("global Discovery still ignores selected country", () => {
    const viewer = { discoveryScope: "global", location: home, discoveryPreferences: { searchCountry: "México" } };
    expect(buildDiscoveryLocationMatch(viewer)).toBeNull();
  });

  test("invalid or empty GPS coordinates are never treated as location 0,0", () => {
    expect(getLocationCoordinates({ location: { coordinates: [null, null] } })).toBeNull();
    expect(getLocationCoordinates({ location: { coordinates: ["", ""] } })).toBeNull();
    expect(getLocationCoordinates({ location: {} })).toBeNull();
  });

  test("country text is escaped in the database filter", () => {
    const query = buildDiscoveryLocationMatch({
      discoveryScope: "country", discoveryPreferences: { searchCountry: "México.*" },
    });
    expect(query["location.country"].test("México")).toBe(false);
    expect(query["location.country"].test("México.*")).toBe(true);
  });
});
