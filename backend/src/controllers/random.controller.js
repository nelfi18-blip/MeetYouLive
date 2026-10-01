const User = require("../models/User.js");
const randomService = require("../services/random.service.js");

// Requester eligibility: must exist, must not be blocked/suspended. Admin
// exclusion is handled upstream by the existing blockAdminSocialAccess
// route middleware (same as Match/Live/Gift/VideoCall), so it is not
// re-checked here to avoid a duplicate role lookup.
async function loadEligibleUser(userId) {
  const user = await User.findById(userId).select("_id isBlocked isSuspended").lean();
  if (!user || user.isBlocked === true || user.isSuspended === true) return null;
  return user;
}

exports.join = async (req, res) => {
  try {
    const user = await loadEligibleUser(req.userId);
    if (!user) {
      return res.status(403).json({ ok: false, message: "Usuario no elegible para Random" });
    }

    const result = await randomService.join(req.userId);
    return res.json({ ok: true, ...serializeResult(result) });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Error interno del servidor" });
  }
};

exports.status = async (req, res) => {
  try {
    const result = await randomService.getStatus(req.userId);
    return res.json({ ok: true, ...serializeResult(result) });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Error interno del servidor" });
  }
};

exports.leave = async (req, res) => {
  try {
    const result = await randomService.leave(req.userId);
    return res.json({ ok: true, ...serializeResult(result) });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Error interno del servidor" });
  }
};

exports.next = async (req, res) => {
  try {
    const user = await loadEligibleUser(req.userId);
    if (!user) {
      return res.status(403).json({ ok: false, message: "Usuario no elegible para Random" });
    }

    const result = await randomService.next(req.userId);
    return res.json({ ok: true, ...serializeResult(result) });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Error interno del servidor" });
  }
};

// Shapes the service result into the exact public response contract: never
// leak anything beyond status/sessionId/peer{id,name,username}.
function serializeResult(result) {
  if (!result) return { status: "idle" };
  if (result.state === "matched") {
    return { status: "matched", sessionId: result.sessionId, peer: result.peer || null };
  }
  if (result.state === "waiting") return { status: "waiting" };
  return { status: "idle" };
}
