const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const crypto = require("crypto");
const User = require("../models/User.js");
const { makePrimaryUserPhotoFields } = require("../lib/photoFields.js");
const { AUTH_PROVIDERS } = require("../lib/authProvider.js");
const { generateUniqueUsername } = require("../services/username.service.js");

const getGoogleUserPhotoFields = (profile = {}) =>
  makePrimaryUserPhotoFields(profile.photos?.[0]?.value, "google");

async function findOrCreateGoogleUser(profile = {}) {
  if (!profile.emails || profile.emails.length === 0) {
    throw new Error("No email found in Google profile");
  }
  const email = profile.emails[0].value;

  let user = await User.findOne({ email });

  if (!user) {
    const username = await generateUniqueUsername(email);
    user = await User.create({
      name: profile.displayName,
      username,
      email,
      password: crypto.randomBytes(32).toString("hex"),
      authProvider: AUTH_PROVIDERS.GOOGLE,
      googleId: profile.id || null,
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpires: null,
      emailVerificationSentAt: null,
      ...getGoogleUserPhotoFields(profile),
    });
  } else {
    let changed = false;
    if (!user.username) {
      user.username = await generateUniqueUsername(email, user._id);
      changed = true;
    }
    if (user.authProvider !== AUTH_PROVIDERS.GOOGLE) {
      user.authProvider = AUTH_PROVIDERS.GOOGLE;
      changed = true;
    }
    if (profile.id && user.googleId !== profile.id) {
      user.googleId = profile.id;
      changed = true;
    }
    if (user.emailVerified !== true) {
      user.emailVerified = true;
      user.emailVerificationCode = null;
      user.emailVerificationExpires = null;
      user.emailVerificationSentAt = null;
      changed = true;
    }
    if (changed) await user.save();
  }

  return user;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateGoogleUser(profile);
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

module.exports = passport;
module.exports.getGoogleUserPhotoFields = getGoogleUserPhotoFields;
module.exports.findOrCreateGoogleUser = findOrCreateGoogleUser;
