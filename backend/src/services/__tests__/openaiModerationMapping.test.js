const {
  PROVIDER_CATEGORY_MAP, RISK_THRESHOLDS, mapProviderResult,
} = require("../openaiModerationMapping.js");
const { RISK_LEVELS, CATEGORIES } = require("../textModeration.service.js");

describe("openaiModerationMapping", () => {
  test("every mapped provider category points to a valid internal category", () => {
    for (const internalCategory of Object.values(PROVIDER_CATEGORY_MAP)) {
      expect(CATEGORIES).toContain(internalCategory);
    }
  });

  test("every threshold level is a valid internal risk level", () => {
    for (const { level } of RISK_THRESHOLDS) {
      expect(RISK_LEVELS).toContain(level);
    }
  });

  test("no flagged categories produces safe with no categories/scores", () => {
    expect(mapProviderResult({}, {})).toEqual({ riskLevel: "safe", categories: [], scores: {} });
    expect(mapProviderResult({ sexual: false, hate: false }, { sexual: 0.9 }))
      .toEqual({ riskLevel: "safe", categories: [], scores: {} });
  });

  test.each([
    ["sexual", "sexual"],
    ["harassment", "harassment"],
    ["harassment/threatening", "harassment"],
    ["hate", "hate"],
    ["hate/threatening", "hate"],
    ["violence", "violence"],
    ["violence/graphic", "violence"],
    ["self-harm", "self_harm"],
    ["self-harm/intent", "self_harm"],
    ["self-harm/instructions", "self_harm"],
    ["illicit", "other"],
    ["illicit/violent", "violence"],
  ])("maps provider category %s to internal category %s", (providerKey, internalCategory) => {
    const result = mapProviderResult({ [providerKey]: true }, { [providerKey]: 0.5 });
    expect(result.categories).toEqual([internalCategory]);
    expect(result.scores).toEqual({ [internalCategory]: 0.5 });
  });

  test("sexual/minors always maps to child_safety and forces critical regardless of score", () => {
    const result = mapProviderResult({ "sexual/minors": true }, { "sexual/minors": 0.1 });
    expect(result.categories).toEqual(["child_safety"]);
    expect(result.riskLevel).toBe("critical");
  });

  test.each([
    [0.95, "critical"],
    [0.9, "critical"],
    [0.75, "high"],
    [0.7, "high"],
    [0.5, "medium"],
    [0.4, "medium"],
    [0.3, "low"],
    [0.01, "low"],
  ])("score %s maps to risk level %s", (score, expectedLevel) => {
    const result = mapProviderResult({ hate: true }, { hate: score });
    expect(result.riskLevel).toBe(expectedLevel);
  });

  test("uses the maximum score across multiple flagged categories", () => {
    const result = mapProviderResult(
      { hate: true, violence: true },
      { hate: 0.2, violence: 0.95 }
    );
    expect(result.riskLevel).toBe("critical");
    expect(result.categories.sort()).toEqual(["hate", "violence"]);
  });

  test("deduplicates internal categories when multiple provider keys map to the same one", () => {
    const result = mapProviderResult(
      { harassment: true, "harassment/threatening": true },
      { harassment: 0.3, "harassment/threatening": 0.8 }
    );
    expect(result.categories).toEqual(["harassment"]);
    expect(result.scores).toEqual({ harassment: 0.8 });
  });

  test("clamps out-of-range or non-numeric scores into [0, 1]", () => {
    expect(mapProviderResult({ hate: true }, { hate: 5 }).scores).toEqual({ hate: 1 });
    expect(mapProviderResult({ hate: true }, { hate: -5 }).scores).toEqual({ hate: 0 });
    expect(mapProviderResult({ hate: true }, { hate: "oops" }).scores).toEqual({ hate: 0 });
    expect(mapProviderResult({ hate: true }, {}).scores).toEqual({ hate: 0 });
  });

  test("ignores provider categories without a known mapping", () => {
    const result = mapProviderResult({ "unknown-category": true }, { "unknown-category": 0.9 });
    expect(result).toEqual({ riskLevel: "safe", categories: [], scores: {} });
  });
});
