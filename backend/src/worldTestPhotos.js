"use strict";

// Deliberately illustrative placeholders used ONLY by the isolated World Test
// server. These are NOT profile photos, generated likenesses, or real people.
// Public images are safe to cache and view; protected photo *authorization*
// remains on the authenticated /api/user/:id/public route.
const WORLD_TEST_PUBLIC_ORIGIN = "https://meetyoulive-world-test.onrender.com";
const ALLOWED_VARIANTS = Object.freeze(["a", "b"]);

function worldTestPhotoUrl(variant) {
  if (!ALLOWED_VARIANTS.includes(variant)) return null;
  return `${WORLD_TEST_PUBLIC_ORIGIN}/world-test-photos/${variant}.svg`;
}

function worldTestPhotoSvg(variant) {
  if (!ALLOWED_VARIANTS.includes(variant)) return null;
  const color = variant === "a" ? "#7248ca" : "#0d819c";
  const light = variant === "a" ? "#c8b7ff" : "#b3f0fc";
  const letter = variant.toUpperCase();
  // Fully static SVG, no external images, font requests, scripts, or user input.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" role="img" aria-label="World synthetic test identity ${letter}">
    <rect width="240" height="300" fill="#101221"/>
    <rect x="8" y="8" width="224" height="284" rx="20" fill="${color}"/>
    <circle cx="120" cy="106" r="48" fill="${light}"/>
    <path d="M28 240c0-56 38-91 92-91s92 35 92 91v16H28z" fill="${light}"/>
    <rect x="17" y="265" width="206" height="25" rx="6" fill="#101221"/>
    <text x="120" y="283" fill="white" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle">TEST ${letter} · FICTICIO</text>
  </svg>`;
}

module.exports = { ALLOWED_VARIANTS, worldTestPhotoUrl, worldTestPhotoSvg };
