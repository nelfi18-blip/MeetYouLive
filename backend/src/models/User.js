const mongoose = require("mongoose");
const { calculateAge } = require("../lib/age.js");

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
    reviewDecision: { type: String, enum: ["", "approved", "rejected", "suspended", "reactivated"], default: "" },
    reviewNote: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
  },
  { _id: false }
);

const discoveryAgeRangeSchema = new mongoose.Schema(
  {
    min: { type: Number, default: null, min: 18, max: 100 },
    max: { type: Number, default: null, min: 18, max: 100 },
  },
  { _id: false }
);

const discoveryPreferencesSchema = new mongoose.Schema(
  {
    ageRange: { type: discoveryAgeRangeSchema, default: () => ({}) },
    maxDistanceKm: { type: Number, default: null, min: 1, max: 10000 },
    discoveryScope: { type: String, enum: ["nearby", "country", "global"], default: "global" },
    languages: { type: [String], default: [] },
    goals: {
      // Discovery goals are mapped to profile intent filters in backend/src/lib/discovery.js.
      type: [String],
      enum: ["serious_relationship", "friendship", "dating", "networking"],
      default: [],
    },
  },
  { _id: false }
);

const userImageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
    isPrimary: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const locationPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: {
      type: [Number],
      validate: {
        validator(value) {
          if (value === undefined || value === null) return true;
          if (!Array.isArray(value) || value.length !== 2) return false;
          const [lng, lat] = value;
          return (
            Number.isFinite(lng) &&
            Number.isFinite(lat) &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message:
          "locationPoint.coordinates must be [longitude, latitude] with longitude between -180 and 180 and latitude between -90 and 90",
      },
    },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: {
      type: [Number],
      default: undefined,
      validate: {
        validator(value) {
          if (value === undefined || value === null) return true;
          if (!Array.isArray(value) || value.length !== 2) return false;
          const [lng, lat] = value;
          return (
            Number.isFinite(lng) &&
            Number.isFinite(lat) &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message:
          "location.coordinates must be [longitude, latitude] with longitude between -180 and 180 and latitude between -90 and 90",
      },
    },
    country: { type: String, default: "" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    label: { type: String, default: "" },
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
    images: { type: [userImageSchema], default: [] },
    profilePhotos: { type: [String], default: [] },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say", "man", "woman", "nonbinary", "", null],
      default: null,
    },
    birthdate: { type: Date, default: null },
    interests: { type: [String], default: [] },
    intent: { type: String, enum: ["dating", "casual", "live", "creator", ""], default: "" },
    interestedIn: { type: String, enum: ["male", "female", "men", "women", "both", ""], default: "both" },
    discoveryPreferences: { type: discoveryPreferencesSchema, default: () => ({}) },
    location: { type: locationSchema, default: () => ({}) },
    locationPoint: { type: locationPointSchema, default: null },
    locationLabel: { type: String, default: "" },
    maxDistanceKm: { type: Number, default: null, min: 1, max: 10000 },
    discoveryScope: { type: String, enum: ["nearby", "country", "global"], default: "global" },
    onboardingComplete: { type: Boolean, default: false },
    role: { 
      type: String, 
      enum: ["user", "creator", "subCreator", "admin", "moderator", "support", "creator_manager", "finance", "content_reviewer"], 
      default: "user" 
    },
    creatorStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected", "suspended"],
      default: "none",
    },
    isVerifiedCreator: { type: Boolean, default: false },
    creatorProfile: { type: creatorProfileSchema, default: () => ({}) },
    creatorApplication: { type: creatorApplicationSchema, default: () => ({}) },
    isBlocked: { type: Boolean, default: false },
    isSuspended: { type: Boolean, default: false },
    creatorApprovedAt: { type: Date, default: null },
    coins: { type: Number, default: 0, min: 0 },
    sparks: { type: Number, default: 0, min: 0 },
    earningsCoins: { type: Number, default: 0, min: 0 },
    agencyEarningsCoins: { type: Number, default: 0, min: 0 },
    totalAgencyGeneratedCoins: { type: Number, default: 0, min: 0 },
    agencyProfile: { type: agencyProfileSchema, default: () => ({}) },
    agencyRelationship: { type: agencyRelationshipSchema, default: () => ({}) },
    isPremium: { type: Boolean, default: false },
    isVIP: { type: Boolean, default: false },
    vipTier: { type: String, enum: ["silver", "gold", "platinum", null], default: null },
    vipExpiresAt: { type: Date, default: null },
    verificationPhoto: { type: String, default: "" },
    verificationStatus: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    emailVerificationCode: { type: String, default: null },
    emailVerificationExpires: { type: Date, default: null },
    passwordResetCode: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    passwordResetRequestedAt: { type: Date, default: null },
    preferredLanguage: { type: String, enum: ["es", "en", "pt"], default: "es" },
    crushBoostUntil: { type: Date, default: null },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    followersCount: { type: Number, default: 0, min: 0 },
    lastActiveAt: { type: Date, default: null },
    reactivation: {
      type: new mongoose.Schema(
        {
          day1SentAt: { type: Date, default: null },
          day2SentAt: { type: Date, default: null },
          day3SentAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    lastDailyRewardClaimAt: { type: Date, default: null },
    dailyRewardStreak: { type: Number, default: 0, min: 0 },
    pushToken: { type: String, default: null },
    pushSettings: {
      type: new mongoose.Schema(
        {
          enabled: { type: Boolean, default: true },
          categories: {
            type: [String],
            enum: ["match", "like", "live", "reward"],
            default: ["match", "like", "live", "reward"],
          },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    pushRateLimit: {
      type: new mongoose.Schema(
        {
          date: { type: Date, default: null },
          count: { type: Number, default: 0, min: 0 },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
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
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    pendingAgencyCode: { type: String, default: null },
    referralCount: { type: Number, default: 0, min: 0 },
    referralRewardsEarned: { type: Number, default: 0, min: 0 },
    referralRewardClaimed: { type: Boolean, default: false },
    loginCount: { type: Number, default: 0, min: 0 },
    // Creator invite system
    invitedByCreator: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    creatorInviteCode: { type: String, unique: true, sparse: true },
    // Stripe Connect — for automated creator payouts
    stripeAccountId: { type: String, default: null },
    stripeAccountStatus: {
      type: String,
      enum: ["pending", "restricted", "enabled", null],
      default: null,
    },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    unlockedAchievements: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, required: true },
            unlockedAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // Profile gift stats
    totalReceivedGifts: { type: Number, default: 0, min: 0 },
    totalReceivedCoins: { type: Number, default: 0, min: 0 },
    topGifts: {
      type: [
        new mongoose.Schema(
          {
            giftId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCatalog", required: true },
            giftName: { type: String, required: true },
            giftIcon: { type: String, required: true },
            count: { type: Number, required: true, min: 1 },
            totalCoins: { type: Number, required: true, min: 0 },
            lastReceivedAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.virtual("age").get(function getAge() {
  return calculateAge(this.birthdate, new Date());
});

userSchema
  .virtual("displayName")
  .get(function getDisplayName() {
    return this.name || "";
  })
  .set(function setDisplayName(value) {
    if (typeof value === "string") this.name = value;
  });

userSchema
  .virtual("genderPreference")
  .get(function getGenderPreference() {
    return this.interestedIn;
  })
  .set(function setGenderPreference(value) {
    if (typeof value === "string") this.interestedIn = value;
  });

userSchema
  .virtual("profileImage")
  .get(function getProfileImage() {
    return this.avatar || "";
  })
  .set(function setProfileImage(value) {
    if (typeof value === "string") this.avatar = value;
  });

userSchema.index({
  role: 1,
  isBlocked: 1,
  isSuspended: 1,
  onboardingComplete: 1,
  createdAt: -1,
  _id: -1,
});
userSchema.index({ "location.country": 1, "location.city": 1, "location.region": 1 });
userSchema.index(
  { location: "2dsphere" },
  { partialFilterExpression: { "location.coordinates": { $type: "array" } } }
);
userSchema.index({ locationPoint: "2dsphere" });

const User = mongoose.model("User", userSchema);

module.exports = User;
