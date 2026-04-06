const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const Live = require("../models/Live.js");
const VideoCall = require("../models/VideoCall.js");

const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

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

  if (!channelName) {
    return res.status(400).json({ message: "channelName es requerido" });
  }

  try {
    // Determine role: publisher for creator/call participant, subscriber for viewer
    let role = RtcRole.SUBSCRIBER;

    if (roleParam !== "subscriber") {
      // Check once whether the requester is the live creator or a call participant
      const [isLiveCreator, isCallParticipant] = await Promise.all([
        Live.exists({ _id: channelName, user: req.userId, isLive: true }),
        VideoCall.exists({
          _id: channelName,
          $or: [{ caller: req.userId }, { recipient: req.userId }],
          status: { $in: ["pending", "accepted"] },
        }),
      ]);

      if (roleParam === "publisher" || roleParam === undefined) {
        if (isLiveCreator || isCallParticipant) {
          role = RtcRole.PUBLISHER;
        }
      }
    }

    const uid = fnv1aHash(String(req.userId));
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      expirationTimeInSeconds
    );

    res.json({ token, uid, appId, channelName });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getToken };
