"use strict";
const mongoose = require("mongoose");
const Report = require("../models/Report.js");
const Guard = require("../models/AgencyReportGuard.js");

const normalizeReason = (reason) => String(reason).normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
class AgencyReportError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

async function createAgencySupervisionReport(payload) {
  // Establish the collection/row outside the transaction, including the first
  // concurrent requests for this agency. The _id index exists without migration.
  try { await Guard.updateOne({ _id: payload.reporter }, { $setOnInsert: { revision: 0 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      // Conflicting writers retry the WHOLE transaction with a fresh snapshot.
      await Guard.updateOne({ _id: payload.reporter }, { $inc: { revision: 1 } }, { session });
      const now = Date.now();
      const previous = await Report.find({ reporter: payload.reporter, targetType: payload.targetType,
        targetId: payload.targetId, "agencyContext.liveId": payload.agencyContext.liveId,
        createdAt: { $gte: new Date(now - 10 * 60 * 1000) },
      }).select("reason agencyContext.category agencyContext.observedRole").session(session).lean();
      // Also handles reports made before this service existed. Resolution does
      // not turn the same incident into a new incident during the cooldown.
      if (previous.some((report) => report.agencyContext?.category === payload.agencyContext.category &&
        report.agencyContext?.observedRole === payload.agencyContext.observedRole &&
        normalizeReason(report.reason) === normalizeReason(payload.reason))) {
        throw new AgencyReportError("ALREADY_REPORTED", 409);
      }
      // The existing per-IP route limiter stays in place. This durable per-agency
      // quota also prevents bypass by concurrent requests or changing source IP.
      const count = await Report.countDocuments({ reporter: payload.reporter,
        "agencyContext.agencyId": payload.reporter,
        createdAt: { $gte: new Date(now - 15 * 60 * 1000) },
      }).session(session);
      if (count >= 30) throw new AgencyReportError("REPORT_RATE_LIMIT", 429);
      const [report] = await Report.create([payload], { session });
      return report;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally { await session.endSession(); }
}
module.exports = { createAgencySupervisionReport, normalizeReason, AgencyReportError };
