const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const Live = require("../models/Live.js");
const VideoCall = require("../models/VideoCall.js");

const CALL_TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
const LIVE_TOKEN_EXPIRY_SECONDS = 60;

// FNV-1a 32-bit hash — converts a MongoDB ObjectId string to a stable uint32 UID
function fnv1aHash(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1; // ensure non-zero
}

// GET /api/agora/token
const getToken = async (req, res) => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return res.status(503).json({ message: "Agora no configurado en el servidor" });
  }

  const { channelName, role: roleParam } = req.query;

  if (!channelName || !/^[a-f0-9]{24}$/i.test(String(channelName))) {
    return res.status(400).json({ message: "channelName es requerido y debe ser un ObjectId válido" });
  }

  try {
    let role = RtcRole.SUBSCRIBER;
    let tokenExpirySeconds = CALL_TOKEN_EXPIRY_SECONDS;

    const liveAccess = await Live.findOne({ _id: channelName, isLive: true })
      .select("user bannedUsers guests")
      .lean();

    if (liveAccess) {
      tokenExpirySeconds = LIVE_TOKEN_EXPIRY_SECONDS;
      const isLiveCreator = String(liveAccess.user) === String(req.userId);
      const isBanned = (liveAccess.bannedUsers || []).some((userId) => String(userId) === String(req.userId));
      if (!isLiveCreator && isBanned) {
        return res.status(403).json({ message: "No puedes entrar a este directo" });
      }

      const isApprovedGuest = (liveAccess.guests || []).some(
        (guest) => String(guest.userId) === String(req.userId) && guest.status === "active"
      );
      if (roleParam !== "subscriber" && (isLiveCreator || isApprovedGuest)) {
        role = RtcRole.PUBLISHER;
      }
    } else {
      const isCallParticipant = await VideoCall.exists({
        _id: channelName,
        $or: [{ caller: req.userId }, { recipient: req.userId }],
        status: { $in: ["pending", "accepted"] },
      });
      if (!isCallParticipant) {
        return res.status(404).json({ message: "Canal no encontrado o sin permisos" });
      }
      if (roleParam === "publisher" || roleParam === undefined) {
        role = RtcRole.PUBLISHER;
      }
    }

    const uid = fnv1aHash(String(req.userId));
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + tokenExpirySeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      expirationTimeInSeconds
    );

    res.json({ token, uid, appId, channelName, expiresIn: tokenExpirySeconds });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getToken };
