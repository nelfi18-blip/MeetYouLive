const mongoose = require("mongoose");

const agencyProfileSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    agencyName: { type: String, default: "" },
    agencyCode: { type: String, default: "", sparse: true },
    subCreatorPercentageDefault: { type: Number, default: 10, min: 5, max: 30 },
    subCreatorsCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const agencyRelationshipSchema = new mongoose.Schema(
  {
    parentCreatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    parentCreatorPercentage: { type: Number, default: 0, min: 0, max: 30 },
    joinedAt: { type: Date, default: null },
    status: { type: String, enum: ["none", "pending", "active", "suspended", "removed"], default: "none" },
  },
  { _id: false }
);

const creatorProfileSchema = new mongoose.Schema(
  {
    displayName: { type: String, default: "" },
    bio: { type: String, default: "" },
    category: { type: String, default: "" },
    pricePerMinute: { type: Number, default: 0, min: 0 },
    privateCallEnabled: { type: Boolean, default: false },
    giftsEnabled: { type: Boolean, default: true },
    exclusiveContentEnabled: { type: Boolean, default: false },
    liveEnabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const creatorApplicationSchema = new mongoose.Schema(
  {
    displayName: { type: String, default: "" },
    bio: { type: String, default: "" },
    category: { type: String, default: "" },
    country: { type: String, default: "" },
    languages: { type: [String], default: [] },
    socialLinks: {
      twitter: { type: String, default: "" },
      instagram: { type: String, default: "" },
      tiktok: { type: String, default: "" },
      youtube: { type: String, default: "" },
    },
    submittedAt: { type: Date, default: null },
  },
  { _id: false }
);

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
    intent: { type: String, enum: ["dating", "casual", "live", "creator", ""], default: "" },
    location: { type: String, default: "" },
    onboardingComplete: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "creator", "admin"], default: "user" },
    creatorStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected", "suspended"],
      default: "none",
    },
    isVerifiedCreator: { type: Boolean, default: false },
    creatorProfile: { type: creatorProfileSchema, default: () => ({}) },
    creatorApplication: { type: creatorApplicationSchema, default: () => ({}) },
    isBlocked: { type: Boolean, default: false },
    creatorApprovedAt: { type: Date, default: null },
    coins: { type: Number, default: 0, min: 0 },
    sparks: { type: Number, default: 0, min: 0 },
    earningsCoins: { type: Number, default: 0, min: 0 },
    agencyEarningsCoins: { type: Number, default: 0, min: 0 },
    totalAgencyGeneratedCoins: { type: Number, default: 0, min: 0 },
    agencyProfile: { type: agencyProfileSchema, default: () => ({}) },
    agencyRelationship: { type: agencyRelationshipSchema, default: () => ({}) },
    isPremium: { type: Boolean, default: false },
    verificationPhoto: { type: String, default: "" },
    verificationStatus: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    emailVerificationCode: { type: String, default: null },
    emailVerificationExpires: { type: Date, default: null },
    preferredLanguage: { type: String, enum: ["es", "en", "pt"], default: "es" },
    crushBoostUntil: { type: Date, default: null },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    followersCount: { type: Number, default: 0, min: 0 },
    lastDailyRewardClaimAt: { type: Date, default: null },
    dailyRewardStreak: { type: Number, default: 0, min: 0 },
    storedBoosts: { type: Number, default: 0, min: 0 },
    boostSession: {
      type: new mongoose.Schema(
        {
          startedAt: { type: Date, default: null },
          matchesBefore: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
