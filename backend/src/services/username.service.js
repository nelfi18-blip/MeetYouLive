const User = require("../models/User.js");

/**
 * Derive a base slug from an email address local-part.
 * Strips non-alphanumeric / non-underscore characters and limits length.
 *
 * @param {string} email
 * @returns {string} base slug, at least "user" if the local-part is empty
 */
function emailToBase(email) {
  return (
    email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) || "user"
  );
}

/**
 * Generate a username that is guaranteed to be unique in the User collection.
 * Tries the base first, then base1, base2, … until a free slot is found.
 *
 * @param {string} email  Source email address used to build the base slug.
 * @param {string|null} [excludeId]  User _id to exclude when checking uniqueness
 *                                    (pass when backfilling an existing user).
 * @returns {Promise<string>} Unique username.
 */
async function generateUniqueUsername(email, excludeId = null) {
  const base = emailToBase(email);
  let username = base;
  let attempt = 0;

  while (true) {
    const query = excludeId
      ? { username, _id: { $ne: excludeId } }
      : { username };
    const taken = await User.exists(query);
    if (!taken) break;
    attempt += 1;
    username = `${base}${attempt}`;
  }
  return username;
}

module.exports = { generateUniqueUsername };
