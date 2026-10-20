const photoVerificationService = require("../services/photoVerification.service.js");
const faceReferenceService = require("../services/faceReference.service.js");

const handleServiceError = (res, err) => {
  if (err instanceof photoVerificationService.PhotoVerificationError) {
    return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
  }
  // Never log the raw error payload here with any request body content —
  // this endpoint only ever receives a sessionId/consent flag, never facial
  // data, so a generic log line is safe.
  console.error("[photo-verification] unexpected error:", err?.message || err);
  return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Error procesando la verificación." });
};

const startSession = async (req, res) => {
  try {
    const consent = req.body?.consent === true;
    const keepReferenceConsent = req.body?.keepReferenceConsent === true;
    const result = await photoVerificationService.startVerificationSession(req.userId, {
      consent,
      keepReferenceConsent,
      ip: req.ip,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    handleServiceError(res, err);
  }
};

const completeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await photoVerificationService.completeVerificationSession(req.userId, sessionId, {
      ip: req.ip,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    handleServiceError(res, err);
  }
};

const getStatus = async (req, res) => {
  try {
    const result = await photoVerificationService.getVerificationStatus(req.userId);
    res.json({ ok: true, ...result });
  } catch (err) {
    handleServiceError(res, err);
  }
};

const getReferenceStatus = async (req, res) => {
  try {
    const result = await faceReferenceService.getFaceReferenceStatus(req.userId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[photo-verification] reference status error:", err?.message || err);
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Error consultando la referencia facial." });
  }
};

const deleteReference = async (req, res) => {
  try {
    const result = await faceReferenceService.revokeFaceReference(req.userId, { ip: req.ip });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[photo-verification] reference delete error:", err?.message || err);
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Error eliminando la referencia facial." });
  }
};

module.exports = { startSession, completeSession, getStatus, getReferenceStatus, deleteReference };
