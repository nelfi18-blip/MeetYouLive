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
