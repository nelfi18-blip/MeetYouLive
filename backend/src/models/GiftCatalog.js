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
    isSuper: { type: Boolean, default: false },
    rarity: {
      type: String,
      enum: ["common", "uncommon", "rare", "epic", "legendary", "mythic"],
      default: "common",
    },
    animationUrl: { type: String, trim: true, default: "" },
    iconUrl: { type: String, trim: true, default: "" },
    soundUrl: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
    isSuper: { type: Boolean, default: false },
    animationUrl: { type: String, trim: true },
    soundUrl: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GiftCatalog", giftCatalogSchema);
