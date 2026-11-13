// Presentation-only clothing choices. This module never modifies photos,
// face characteristics, age, skin tone or body shape. No AI is invoked here.
export const WORLD_CLOTHING_STYLES = Object.freeze([
  "original",
  "casual",
  "elegant",
  "sport",
  "urban",
]);

// Non-negotiable acceptance criteria for a future consented AI renderer.
// A generated picture must still be reviewed by its owner for resemblance.
// The renderer MUST NOT expose body-shaping controls.
export const WORLD_IDENTITY_INTEGRITY = Object.freeze({
  preserveFace: true,
  preserveBodyProportions: true,
  preserveSkinTone: true,
  preserveApparentAge: true,
  allowBodyReshaping: false,
  allowFaceReshaping: false,
  requireOwnerApproval: true,
  discloseAIGeneration: true,
});

export function chooseWorldClothingStyle(value) {
  return WORLD_CLOTHING_STYLES.includes(value) ? value : "original";
}
