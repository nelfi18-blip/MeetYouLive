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
    // Legacy field for backward compatibility - kept for existing code that reads it
    // NOTE: This field is automatically synced from type field via pre-save hook
    isSuper: { type: Boolean, default: false },
    rarity: {
      type: String,
      enum: ["common", "uncommon", "rare", "epic", "legendary", "mythic"],
      default: "common",
    },
    animationUrl: { type: String, trim: true, default: "" },
    iconUrl: { type: String, trim: true, default: "" },
    // Sound file URL for gift animations (optional)
    soundUrl: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Pre-save hook: automatically sync isSuper field from type field for backward compatibility
giftCatalogSchema.pre("save", function (next) {
  this.isSuper = this.type === "super";
  next();
});

module.exports = mongoose.model("GiftCatalog", giftCatalogSchema);
