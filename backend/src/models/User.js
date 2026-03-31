const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, sparse: true },
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    bio: { type: String, default: "" },
    avatar: { type: String, default: "" },
    gender: { type: String, enum: ["man", "woman", "nonbinary", "other", ""], default: "" },
    birthdate: { type: Date, default: null },
    interests: { type: [String], default: [] },
    location: { type: String, default: "" },
    onboardingComplete: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "creator_pending", "creator", "admin"], default: "user" },
    isBlocked: { type: Boolean, default: false },
    creatorRequest: { type: Boolean, default: false },
    creatorApprovedAt: { type: Date, default: null },
    coins: { type: Number, default: 0, min: 0 },
    earningsCoins: { type: Number, default: 0, min: 0 },
    isPremium: { type: Boolean, default: false },
    verificationPhoto: { type: String, default: "" },
    verificationStatus: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    emailVerificationCode: { type: String, default: null },
    emailVerificationExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
