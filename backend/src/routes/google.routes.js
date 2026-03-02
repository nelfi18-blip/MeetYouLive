const { Router } = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");

const router = Router();

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET not configured" });
    }

    try {
      const token = jwt.sign(
        { id: req.user._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.redirect(
        `${process.env.FRONTEND_URL}/auth/success?token=${token}`
      );
    } catch (err) {
      res.status(500).json({ message: "Error generating token" });
    }
  }
);

module.exports = router;
