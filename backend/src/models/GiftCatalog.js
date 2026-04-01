const mongoose = require("mongoose");

const giftCatalogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    icon: { type: String, required: true, trim: true },
    coinCost: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GiftCatalog", giftCatalogSchema);
