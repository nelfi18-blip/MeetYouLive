const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

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
const getToken = (req, res) => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return res.status(503).json({ message: "Agora no configurado en el servidor" });
  }

  const { channelName, role } = req.query;

  if (!channelName) {
    return res.status(400).json({ message: "channelName es requerido" });
  }

  const rtcRole = role === "subscriber" ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const uid = fnv1aHash(String(req.userId));
  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    rtcRole,
    privilegeExpiredTs
  );

  return res.json({ appId, token, channelName, uid });
};

module.exports = { getToken };
