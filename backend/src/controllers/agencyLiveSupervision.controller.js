"use strict";
const mongoose = require("mongoose");
const User = require("../models/User.js");
const Live = require("../models/Live.js");
const Report = require("../models/Report.js");
const AgencyRelationship = require("../models/AgencyRelationship.js");
const { getLiveAudience } = require("../lib/socket.js");

// Agency access is intentionally narrower than staff moderation permissions.
// An agency may review a free public Live belonging to an active, consenting
// subcreator. It may not open paywalled rooms, private chats, payment data or
// other agencies' audiences.
const PUBLIC_LIVE = Object.freeze({
  isLive: true, isPrivate: false, isVipOnly: false, entryCost: 0,
});
const CATEGORIES = Object.freeze([
  "commercial_sex", "grooming", "off_platform", "external_payment",
  "harassment", "fraud", "other",
]);
const ID_PATTERN = /^[a-f0-9]{24}$/i;
const validId = (v) => typeof v === "string" && ID_PATTERN.test(v);

async function getAgencyCreatorIds(userId) {
  const agency = await User.findById(userId)
    .select("role creatorStatus agencyProfile.enabled isBlocked isSuspended").lean();
  if (!agency || agency.role !== "creator" || agency.creatorStatus !== "approved" ||
      !agency.agencyProfile?.enabled || agency.isBlocked || agency.isSuspended) return null;
  const links = await AgencyRelationship.find({
    parentCreator: userId, status: "active", subCreatorAgreed: true,
  }).select("subCreator").lean();
  return [...new Set((links || []).map((link) => String(link.subCreator))
    .filter(validId))];
}

async function requireLive(req, res) {
  const creatorIds = await getAgencyCreatorIds(req.userId);
  if (creatorIds === null) {
    res.status(403).json({ ok: false, code: "AGENCY_REQUIRED" });
    return null;
  }
  if (!validId(req.params.liveId) || !creatorIds.length) {
    res.status(404).json({ ok: false, code: "LIVE_NOT_FOUND" });
    return null;
  }
  const live = await Live.findOne({
    _id: req.params.liveId, user: { $in: creatorIds }, ...PUBLIC_LIVE,
  }).select("_id user title guests chatEnabled").lean();
  if (!live) {
    res.status(404).json({ ok: false, code: "LIVE_NOT_FOUND" });
    return null;
  }
  return live;
}

async function listAgencyLives(req, res) {
  try {
    const creatorIds = await getAgencyCreatorIds(req.userId);
    if (creatorIds === null) return res.status(403).json({ ok: false, code: "AGENCY_REQUIRED" });
    if (!creatorIds.length) return res.json({ ok: true, lives: [] });
    const lives = await Live.find({ user: { $in: creatorIds }, ...PUBLIC_LIVE })
      .select("_id user title createdAt viewerCount chatEnabled")
      .populate("user", "username name")
      .sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ ok: true, lives: (lives || []).map((live) => ({
      id: String(live._id),
      title: String(live.title || "").slice(0, 160),
      creator: String(live.user?.username || live.user?.name || "").slice(0, 70),
      creatorId: String(live.user?._id || live.user || ""),
      startedAt: live.createdAt,
      chatEnabled: live.chatEnabled !== false,
      // Live.viewerCount is a stored informational figure, not a claim
      // that we can inspect all viewers across multiple Socket.IO workers.
      viewerCount: Math.max(0, Number(live.viewerCount) || 0),
    })) });
  } catch {
    return res.status(503).json({ ok: false, code: "SUPERVISION_UNAVAILABLE" });
  }
}

function currentAudience(live) {
  const seen = new Set();
  const guestIds = new Set((live.guests || [])
    .filter((g) => g.status === "active").map((g) => String(g.userId)));
  const raw = getLiveAudience(String(live._id));
  const viewers = [];
  for (const entry of raw) {
    const id = String(entry.userId || "");
    if (!validId(id) || seen.has(id)) continue;
    seen.add(id);
    viewers.push({
      userId: id,
      username: String(entry.username || "").slice(0, 70),
      role: guestIds.has(id) ? "guest" : "viewer",
    });
  }
  // Guests can be on stage but not appear in this worker's audience cache.
  return { viewers, totalLocal: viewers.length, guestIds };
}

async function getAgencyLiveAudience(req, res) {
  try {
    const live = await requireLive(req, res);
    if (!live) return;
    const audience = currentAudience(live);
    const requestedPage = Number.parseInt(String(req.query?.page || "1"), 10);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000) : 1;
    const pageSize = 40;
    return res.set("Cache-Control", "no-store").json({
      ok: true, liveId: String(live._id),
      viewers: audience.viewers.slice((page - 1) * pageSize, page * pageSize),
      totalLocal: audience.totalLocal, page, pageSize,
      scope: "this_server_only",
    });
  } catch {
    return res.status(503).json({ ok: false, code: "AUDIENCE_UNAVAILABLE" });
  }
}

async function reportAgencyLiveConcern(req, res) {
  try {
    const live = await requireLive(req, res);
    if (!live) return;
    const targetType = req.body?.targetType === "live" ? "live" : "user";
    const role = req.body?.targetType === "guest" ? "guest" : "viewer";
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : null;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!category || reason.length < 10 || reason.length > 500) {
      return res.status(400).json({ ok: false, code: "INVALID_REASON" });
    }
    let targetId = String(live._id);
    if (targetType === "user") {
      const candidate = req.body?.targetId;
      if (!validId(candidate) || candidate === String(live.user)) {
        return res.status(400).json({ ok: false, code: "INVALID_TARGET" });
      }
      // A supervisor may not use this endpoint to report arbitrary account IDs.
      // The user must be in this worker's public audience or an active guest.
      const audience = currentAudience(live);
      const activeViewer = audience.viewers.some((v) => v.userId === candidate);
      const activeGuest = audience.guestIds.has(candidate);
      if (!(role === "guest" ? activeGuest : activeViewer)) {
        return res.status(403).json({ ok: false, code: "TARGET_NOT_IN_LIVE" });
      }
      targetId = candidate;
    }
    const duplicate = await Report.exists({
      reporter: req.userId, targetType, targetId,
      "agencyContext.liveId": live._id,
      status: "pending", createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });
    if (duplicate) return res.status(409).json({ ok: false, code: "ALREADY_REPORTED" });
    const report = await Report.create({
      reporter: req.userId, targetType, targetId, reason,
      agencyContext: {
        liveId: live._id, agencyId: req.userId,
        creatorId: live.user, category, observedRole: targetType === "live" ? "host" : role,
      },
    });
    return res.status(201).json({ ok: true, reportId: String(report._id), status: "pending" });
  } catch {
    return res.status(503).json({ ok: false, code: "REPORT_UNAVAILABLE" });
  }
}

module.exports = { getAgencyCreatorIds, listAgencyLives, getAgencyLiveAudience, reportAgencyLiveConcern };
