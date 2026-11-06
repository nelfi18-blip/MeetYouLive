const mongoose = require("mongoose");

// One serialization point per reporting agency. No TTL: expiring a lock must
// never split a transaction or let concurrent identical reports both commit.
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  revision: { type: Number, default: 0 },
});
module.exports = mongoose.model("AgencyReportGuard", schema);
