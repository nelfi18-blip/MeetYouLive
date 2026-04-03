const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const Live = require("../models/Live.js");
const VideoCall = require("../models/VideoCall.js");

const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

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
    // Determine role: publisher for creator, subscriber for viewer
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

    // Use userId as uid (converted to numeric hash for Agora compatibility)
    // Agora uid must be a 32-bit unsigned integer; we use FNV-1a hash of the full ObjectId string
    // to minimise collision probability while staying within uint32 range.
    const uidStr = req.userId.toString();
    let hash = 2166136261; // FNV-1a 32-bit offset basis
    for (let i = 0; i < uidStr.length; i++) {
      hash ^= uidStr.charCodeAt(i);
      hash = (hash * 16777619) >>> 0; // FNV prime, keep as uint32
    }
    const uid = hash;

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
