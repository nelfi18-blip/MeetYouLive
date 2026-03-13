const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, sparse: true },
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    avatar: { type: String, default: "" },
    provider: { type: String, default: "local" },
    role: { type: String, enum: ["user", "creator", "admin"], default: "user" },
    isBlocked: { type: Boolean, default: false },
    coins: { type: Number, default: 0, min: 0 },
    earningsCoins: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
