"use strict";

/**
 * Public-facing identity is deliberately separate from the account's legal/
 * Google name and unique internal username. Never infer a public handle from
 * the local part of an email address.
 */
const { calculateAge } = require("./age.js");

const MAX_PUBLIC_NAME_LENGTH = 40;
const CREATOR_ROLES = new Set(["creator", "subCreator", "agency"]);
const isCreator = (user) => CREATOR_ROLES.has(user?.role);

const cleanDisplayText = (value) => {
  if (typeof value !== "string") return "";
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text.length > MAX_PUBLIC_NAME_LENGTH || /[@<>\u0000-\u001f\u007f]/u.test(text)) return "";
  if (/\b(?:https?:\/\/|www\.)/iu.test(text)) return "";
  return text;
};

/** Validates a deliberate public nickname; never accepts an email or URL. */
const validatePublicName = (value, { creator = false } = {}) => {
  if (typeof value !== "string") return { ok: false, reason: "invalid" };
  const normalized = cleanDisplayText(value);
  if (!normalized) return { ok: false, reason: "invalid" };
  if (!creator && /\s/u.test(normalized)) return { ok: false, reason: "single_word" };
  // Letters (all languages), numbers, common nickname punctuation and spaces
  // for creators. No @-handles, emails, control characters or links.
  if (!/^[\p{L}\p{M}\p{N}_.\- ]+$/u.test(normalized)) return { ok: false, reason: "characters" };
  return { ok: true, value: normalized };
};

/** A privacy-preserving fallback for accounts created before publicName. */
const getPublicName = (user = {}) => {
  const creator = isCreator(user);
  const explicit = cleanDisplayText(user.publicName);
  if (explicit) return creator ? explicit : explicit.split(" ")[0];

  if (creator) {
    const artistName = cleanDisplayText(user.creatorProfile?.displayName);
    if (artistName) return artistName;
  }

  // Do not use username: older usernames can be generated from email.
  const legacy = typeof user.name === "string" && user.name.trim()
    ? user.name.trim()
    : (typeof user.firstName === "string" ? user.firstName.trim() : "");
  const firstName = cleanDisplayText(legacy.split(/\s+/u)[0]);
  if (firstName) return firstName;
  return creator ? "Creador" : "Usuario";
};

/**
 * A migrated Google profile can carry its original full name in the "bio"
 * field. Displaying that string under the public nickname duplicates the
 * heading and re-exposes an otherwise hidden surname. Compare only complete
 * strings; meaningful biography sentences must never be deleted.
 */
const normalizeIdentityComparison = (value) =>
  typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").replace(/[.!:,;]+$/u, "").toLocaleLowerCase()
    : "";

const getPublicBio = (user = {}) => {
  const bio = typeof user.bio === "string" ? user.bio.trim() : "";
  if (!bio) return "";
  const comparable = normalizeIdentityComparison(bio);
  const storedFullName = [user.firstName, user.lastName].filter((v) => typeof v === "string" && v.trim()).join(" ");
  const identities = [
    getPublicName(user), user.publicName, user.name, user.displayName,
    storedFullName, user.username, user.creatorProfile?.displayName,
  ];
  return identities.some((candidate) =>
    normalizeIdentityComparison(candidate) === comparable
  ) ? "" : bio;
};

/**
 * Preserve _id/roles/photo fields for existing clients, but never return the
 * stored real name, surname or email-derived username on user-facing APIs.
 */
const toPublicIdentity = (user = {}) => {
  const name = getPublicName(user);
  // Show only completed years, never the raw date of birth. A missing or
  // invalid birthday must not produce an invented age.
  const derivedAge = user.birthdate ? calculateAge(user.birthdate, new Date()) : null;
  const age = Number.isInteger(derivedAge) && derivedAge >= 18 && derivedAge <= 120
    ? derivedAge
    : (Number.isInteger(user.age) && user.age >= 18 && user.age <= 120 ? user.age : null);
  const safe = { ...user, publicName: name, name, displayName: name, age };
  if (typeof user.bio === "string") safe.bio = getPublicBio(user);
  delete safe.firstName;
  delete safe.lastName;
  delete safe.birthdate;
  delete safe.username;
  delete safe.email;
  delete safe.password;
  delete safe.blockedUsers;
  delete safe.blockedBy;
  delete safe.locationPoint;
  return safe;
};

module.exports = { MAX_PUBLIC_NAME_LENGTH, isCreator, validatePublicName, getPublicName, getPublicBio, toPublicIdentity };
