const crypto = require("crypto");
const User = require("../models/User.js");
const { VERSION, DESTINATIONS, OUTFITS, validPosition, zones } = require("./vcrWorldRules.cjs");

// Only the member's PUBLIC primary profile photo may be used, and only after
// explicit per-World-session consent. The signature is never sent over Socket.IO.
const photoSignature = (profile) => {
  const photo = profile?.primaryPhoto || profile?.images?.[0]?.url || profile?.avatar || profile?.profilePhotos?.[0];
  if (typeof photo !== "string" || !photo.trim()) return null;
  return crypto.createHash("sha256").update(photo.trim()).digest("hex");
};

// Pilot: authoritative membership is local to ONE process. Instances never merge
// implicitly across workers. No Redis/global population claims or NPC presence.
function createVcrWorld(namespace, { users = User, now = Date.now, capacity = 16, totalCapacity = 64 } = {}) {
  const members = new Map();
  let publishing = false;
  const publicMember = (member, profile) => ({ userId: member.userId, name: String(profile.username || "").slice(0, 40),
    position: member.position, outfit: member.outfit,
    // Never transmit raw photos, profile URLs, selfies or biometric data in snapshots.
    photoConsent: member.sharePhoto === true });
  const leave = (socket) => { members.delete(socket.id); };
  const restricted = (profile) => !profile || profile.isBlocked || ["admin", "moderator", "support"].includes(profile.role);

  async function publish() {
    if (publishing || !members.size) return;
    publishing = true;
    try {
      const batch = [...members.values()];
      const profiles = await users.find({ _id: { $in: [...new Set(batch.map((m) => m.userId))] } })
        .select("_id username role isBlocked blockedUsers primaryPhoto avatar images profilePhotos").lean();
      const byId = new Map(profiles.map((p) => [String(p._id), p]));
      const stamp = now();
      for (const member of batch) {
        const socketId = member.socket.id;
        if (members.get(socketId) !== member) continue;
        const profile = byId.get(member.userId);
        // A changed main photo revokes consent until this member joins again.
        if (member.sharePhoto && photoSignature(profile) !== member.photoFingerprint) {
          member.sharePhoto = false;
          member.photoFingerprint = null;
        }
        if (restricted(profile) || member.expiresAt <= stamp || member.socket.connected === false) {
          members.delete(socketId);
          member.socket.emit("vcr:closed", { code: "SESSION_ENDED" });
        }
      }
      for (const member of batch) {
        if (members.get(member.socket.id) !== member) continue;
        const profile = byId.get(member.userId);
        const blocked = new Set((profile.blockedUsers || []).map(String));
        const peers = batch.filter((other) => {
          if (members.get(other.socket.id) !== other) return false;
          const otherProfile = byId.get(other.userId);
          return other.instanceId === member.instanceId && other.userId !== member.userId && !blocked.has(other.userId) &&
            !(otherProfile.blockedUsers || []).some((id) => String(id) === member.userId);
        }).map((other) => publicMember(other, byId.get(other.userId)));
        // Per-recipient snapshots are essential: namespace/room broadcasts would
        // leak presence and coordinates between mutually blocked accounts.
        member.socket.emit("vcr:snapshot", { version: VERSION, membership: member.membership,
          country: member.country, instanceId: member.instanceId, peers });
      }
    } catch {
      // Fail closed: never preserve a visible cached audience after a DB failure.
      for (const member of members.values()) member.socket.emit("vcr:closed", { code: "PRIVACY_UNAVAILABLE" });
      members.clear();
    } finally { publishing = false; }
  }

  function attach(socket) {
    let revision = 0, lastJoin = -Infinity, lastMove = -Infinity;
    socket.on("vcr:join", async (payload, ack = () => {}) => {
      if (typeof ack !== "function") ack = () => {};
      const attempt = ++revision;
      leave(socket); // changing country removes the previous membership first
      if (!socket._userId || !payload || payload.version !== VERSION || !Object.hasOwn(DESTINATIONS, payload.country)) return ack({ ok: false, code: "INVALID_JOIN" });
      if (now() - lastJoin < 750) return ack({ ok: false, code: "RATE_LIMIT" });
      lastJoin = now();
      try {
        const profile = await users.findById(socket._userId).select("_id username role isBlocked blockedUsers primaryPhoto avatar images profilePhotos").lean();
        if (revision !== attempt || socket.connected === false) return ack({ ok: false, code: "STALE_JOIN" });
        if (restricted(profile)) return ack({ ok: false, code: "FORBIDDEN" });
        // One visible avatar per account, even across tabs on this worker.
        for (const old of members.values()) if (old.userId === socket._userId) {
          old.socket.emit("vcr:closed", { code: "OTHER_SESSION" }); members.delete(old.socket.id);
        }
        if (members.size >= totalCapacity) return ack({ ok: false, code: "FULL" });
        const available = [...members.values()].find((m) => m.country === payload.country &&
          [...members.values()].filter((other) => other.instanceId === m.instanceId).length < capacity);
        const instanceId = available?.instanceId || `${payload.country}:${crypto.randomUUID()}`;
        const membership = crypto.randomUUID();
        const entry = { socket, userId: socket._userId, country: payload.country, instanceId, membership,
          position: { x: 0, z: 0, yaw: 0 }, outfit: OUTFITS.includes(payload.outfit) ? payload.outfit : "violet", movedAt: now(),
          expiresAt: Number(socket.data?.vcrTokenExpiresAt) || now(),
          sharePhoto: payload.sharePhoto === true && Boolean(photoSignature(profile)),
          photoFingerprint: payload.sharePhoto === true ? photoSignature(profile) : null };
        if (entry.expiresAt <= now()) return ack({ ok: false, code: "SESSION_ENDED" });
        members.set(socket.id, entry);
        ack({ ok: true, version: VERSION, country: entry.country, instanceId, membership, position: entry.position });
        await publish();
      } catch { ack({ ok: false, code: "UNAVAILABLE" }); }
    });
    socket.on("vcr:move", (payload) => {
      const member = members.get(socket.id);
      if (!member || payload?.membership !== member.membership || now() - lastMove < 65) return;
      lastMove = now();
      if (!validPosition(member.country, payload.position, member.position, (now() - member.movedAt) / 1000)) {
        return socket.emit("vcr:correct", { membership: member.membership, position: member.position });
      }
      member.position = { x: payload.position.x, z: payload.position.z, yaw: payload.position.yaw };
      member.movedAt = now();
      if (OUTFITS.includes(payload.outfit)) member.outfit = payload.outfit;
    });
    socket.on("vcr:travel", (payload, ack = () => {}) => {
      if (typeof ack !== "function") return;
      const member = members.get(socket.id);
      const zone = Object.hasOwn(zones, payload?.zone || "") ? zones[payload.zone] : null;
      if (!member || member.membership !== payload?.membership || !zone || now() - lastMove < 250) return ack({ ok: false });
      member.position = { ...zone, yaw: 0 }; member.movedAt = now(); lastMove = now();
      ack({ ok: true, membership: member.membership, position: member.position });
    });
    socket.on("vcr:leave", () => { revision += 1; leave(socket); });
    socket.on("disconnect", () => { revision += 1; leave(socket); });
  }
  namespace.on("connection", attach);
  const timer = setInterval(publish, 200);
  timer.unref?.();
  namespace.server.httpServer?.once("close", () => { clearInterval(timer); members.clear(); });
  return { publish, close() { clearInterval(timer); members.clear(); }, members };
}

function initVcrWorld(io, authenticateSocket) {
  const namespace = io.of("/vcr");
  namespace.use(authenticateSocket);
  namespace.use((socket, next) => {
    if (!socket._userId) return next(new Error("Authentication required"));
    // Existing JWT verification ran immediately above; verify exp for membership
    // lifetime without changing the authentication behavior of other modules.
    const jwt = require("jsonwebtoken");
    const token = socket.handshake.auth?.token;
    let claims;
    try { claims = jwt.verify(token, process.env.JWT_SECRET); } catch { return next(new Error("Invalid session")); }
    if (!Number.isFinite(claims.exp)) return next(new Error("Expiring session required"));
    socket.data.vcrTokenExpiresAt = claims.exp * 1000;
    return next();
  });
  return createVcrWorld(namespace);
}
module.exports = { initVcrWorld, createVcrWorld };
