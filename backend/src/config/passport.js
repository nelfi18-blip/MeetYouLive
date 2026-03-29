const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const crypto = require("crypto");
const User = require("../models/User.js");
const { generateUniqueUsername } = require("../services/username.service.js");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        if (!profile.emails || profile.emails.length === 0) {
          return done(new Error("No email found in Google profile"), null);
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
          });
        } else if (!user.username) {
          user.username = await generateUniqueUsername(email, user._id);
          await user.save();
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

module.exports = passport;
