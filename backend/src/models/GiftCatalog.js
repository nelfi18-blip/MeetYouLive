const mongoose = require("mongoose");

const giftCatalogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true },
    icon: { type: String, required: true, trim: true },
    coinCost: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
    rarity: {
      type: String,
      enum: ["common", "uncommon", "rare", "epic", "legendary", "mythic"],
      default: "common",
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GiftCatalog", giftCatalogSchema);
