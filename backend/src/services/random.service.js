const mongoose = require("mongoose");
const RandomQueueEntry = require("../models/RandomQueueEntry.js");
const RandomSession = require("../models/RandomSession.js");
const User = require("../models/User.js");
const { hasUserBlockBetween } = require("./callRules.service.js");
const { getIO } = require("../lib/socket.js");

// How many waiting candidates to scan per join/next attempt. Keeps a single
// request bounded even if the queue grows large; unmatched candidates remain
// queued for the next attempt (by themselves or by someone else).
const MAX_CANDIDATE_SCAN = 25;

const sortPair = (a, b) => [String(a), String(b)].sort();

const publicPeer = (user) => {
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.name || "",
    username: user.username || "",
  };
};

async function findActiveSession(userId) {
  return RandomSession.findOne({ participants: userId, status: "matched" });
}

async function isQueued(userId) {
  return Boolean(await RandomQueueEntry.exists({ user: userId }));
}

async function enqueue(userId) {
  await RandomQueueEntry.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, createdAt: new Date() } },
    { upsert: true }
  );
}

async function dequeue(userId) {
  await RandomQueueEntry.deleteOne({ user: userId });
}

function notifyMatched(session) {
  const io = getIO();
  if (!io) return;
  (session.participants || []).forEach((participantId) => {
    io.to(String(participantId)).emit("random_matched", {
      sessionId: String(session._id),
    });
  });
}

function notifyEnded(session, endedBy) {
  const io = getIO();
  if (!io) return;
  (session.participants || []).forEach((participantId) => {
    io.to(String(participantId)).emit("random_ended", {
      sessionId: String(session._id),
      endReason: session.endReason,
      endedBy: String(endedBy),
    });
  });
}

// Attempts to pair `userId` (who must already be enqueued) with the oldest
// eligible, non-blocked waiting candidate. The actual claim+create is wrapped
// in a Mongo transaction so that, whatever happens concurrently on other
// backend instances, we never end up with one user in two sessions or a
// "half claimed" queue: if any step fails the whole transaction rolls back
// automatically, restoring both queue entries exactly as they were.
async function attemptMatch(userId) {
  const candidateEntries = await RandomQueueEntry.find({ user: { $ne: userId } })
    .sort({ createdAt: 1 })
    .limit(MAX_CANDIDATE_SCAN)
    .lean();

  if (!candidateEntries.length) return null;

  const candidateIds = candidateEntries.map((entry) => entry.user);
  const candidateUsers = await User.find({ _id: { $in: candidateIds } })
    .select("_id role isBlocked isSuspended")
    .lean();
  const candidateUsersById = new Map(candidateUsers.map((u) => [String(u._id), u]));

  for (const entry of candidateEntries) {
    const candidateId = String(entry.user);
    if (candidateId === String(userId)) continue; // never self-match

    const candidateUser = candidateUsersById.get(candidateId);
    if (!candidateUser || candidateUser.role === "admin" || candidateUser.isBlocked === true || candidateUser.isSuspended === true) {
      // Stale/ineligible queue entry (e.g. suspended after joining) — drop it
      // so it stops being scanned, and move on to the next candidate.
      dequeue(candidateId).catch(() => {});
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    if (await hasUserBlockBetween(userId, candidateId)) continue;

    const dbSession = await mongoose.startSession();
    let matchedSession = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      await dbSession.withTransaction(async () => {
        const claimedOther = await RandomQueueEntry.findOneAndDelete(
          { user: candidateId },
          { session: dbSession }
        );
        if (!claimedOther) return; // another process already claimed this candidate

        const claimedSelf = await RandomQueueEntry.findOneAndDelete(
          { user: userId },
          { session: dbSession }
        );
        if (!claimedSelf) {
          // Self was already removed by a concurrent request on this same
          // user — abort so the candidate delete rolls back too.
          throw new Error("RANDOM_SELF_NOT_QUEUED");
        }

        const participants = sortPair(userId, candidateId);
        const created = await RandomSession.create(
          [{ participants, status: "matched", startedAt: new Date() }],
          { session: dbSession }
        );
        matchedSession = created[0];
      });
    } catch (err) {
      matchedSession = null;
      // Duplicate key (partial unique index) or a lost write race are both
      // expected outcomes of concurrent matching attempts: the transaction
      // is rolled back automatically, so both queue entries are safely
      // restored and we simply try the next candidate (or give up).
      if (err?.message !== "RANDOM_SELF_NOT_QUEUED" && err?.code !== 11000) {
        console.error("[random.service] match attempt failed", err);
      }
    } finally {
      dbSession.endSession();
    }

    if (matchedSession) return matchedSession;
  }

  return null;
}

async function buildMatchedResult(session, userId) {
  const peerId = session.participants.find((p) => String(p) !== String(userId));
  const peerUser = peerId ? await User.findById(peerId).select("_id name username").lean() : null;
  return {
    state: "matched",
    sessionId: String(session._id),
    peer: publicPeer(peerUser),
  };
}

async function join(userId) {
  const activeSession = await findActiveSession(userId);
  if (activeSession) {
    return buildMatchedResult(activeSession, userId);
  }

  await enqueue(userId);

  const matchedSession = await attemptMatch(userId);
  if (matchedSession) {
    notifyMatched(matchedSession);
    return buildMatchedResult(matchedSession, userId);
  }

  return { state: "waiting" };
}

async function endSession(sessionId, { endedBy, endReason }) {
  return RandomSession.findOneAndUpdate(
    { _id: sessionId, status: "matched" },
    { $set: { status: "ended", endedAt: new Date(), endedBy, endReason } },
    { new: true }
  );
}

async function leave(userId) {
  const activeSession = await findActiveSession(userId);
  if (activeSession) {
    const ended = await endSession(activeSession._id, { endedBy: userId, endReason: "leave" });
    if (ended) notifyEnded(ended, userId);
  }
  await dequeue(userId);
  return { state: "idle" };
}

async function next(userId) {
  const activeSession = await findActiveSession(userId);
  if (activeSession) {
    const ended = await endSession(activeSession._id, { endedBy: userId, endReason: "next" });
    if (ended) notifyEnded(ended, userId);
  }
  return join(userId);
}

async function getStatus(userId) {
  const activeSession = await findActiveSession(userId);
  if (activeSession) {
    return buildMatchedResult(activeSession, userId);
  }

  if (await isQueued(userId)) {
    return { state: "waiting" };
  }

  return { state: "idle" };
}

module.exports = {
  join,
  leave,
  next,
  getStatus,
  findActiveSession,
  isQueued,
};
