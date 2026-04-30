const mongoose = require("mongoose");

const giftCatalogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true },
    icon: { type: String, required: true, trim: true },
    coinCost: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
    category: {
      type: String,
      enum: ["luxury", "energy", "emotional", "show", "exclusive"],
      default: "emotional",
    },
    // New 3-tier system: basic, premium, super
    type: {
      type: String,
      enum: ["basic", "premium", "super"],
      default: "basic",
    },
    // Animation type for different visual impacts
    animationType: {
      type: String,
      enum: ["small", "medium", "fullscreen"],
      default: "small",
    },
    // Legacy field for backward compatibility - will be derived from type
    isSuper: { type: Boolean, default: false },
    rarity: {
      type: String,
      enum: ["common", "uncommon", "rare", "epic", "legendary", "mythic"],
      default: "common",
    },
    animationUrl: { type: String, trim: true, default: "" },
    iconUrl: { type: String, trim: true, default: "" },
    soundUrl: { type: String, trim: true, default: "" },
    sound: { type: String, trim: true, default: "" }, // Alternative sound field
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GiftCatalog", giftCatalogSchema);
