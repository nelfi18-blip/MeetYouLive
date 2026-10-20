"use client";

import { getToken } from "./token.js";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Photo verification client ("Verificar mi foto" — Amazon Rekognition Face
 * Liveness + CompareFaces against the user's persisted primary photo).
 *
 * The feature is gated by NEXT_PUBLIC_PHOTO_VERIFICATION_ENABLED on the
 * frontend AND by PHOTO_VERIFICATION_ENABLED on the backend. Both must be on
 * for the flow to run; the backend is still the sole authority on the result
 * — nothing here can mark a user as verified.
 */
export const isPhotoVerificationFeatureEnabled = () =>
  String(process.env.NEXT_PUBLIC_PHOTO_VERIFICATION_ENABLED || "").trim().toLowerCase() === "true";

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: "Bearer " + token } : {};
};

const parseJsonSafe = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

/** Reads the server-authoritative verification status for the current user. */
export async function getPhotoVerificationStatus() {
  const res = await fetch(`${API_URL}/api/photo-verification/status`, {
    headers: { ...authHeaders() },
    cache: "no-store",
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(body?.message || "No se pudo consultar el estado de verificación.");
  }
  return body;
}

/** Starts a new verification session. Requires explicit consent.
 * `keepReferenceConsent` is a SEPARATE, independent opt-in (default false)
 * to additionally keep a protected, encrypted facial reference for future
 * photo changes — never implied by the required `consent` for the selfie
 * itself. */
export async function startPhotoVerificationSession(consent, keepReferenceConsent = false) {
  const res = await fetch(`${API_URL}/api/photo-verification/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ consent: consent === true, keepReferenceConsent: keepReferenceConsent === true }),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const error = new Error(body?.message || "No se pudo iniciar la verificación.");
    error.code = body?.code;
    error.status = res.status;
    throw error;
  }
  return body;
}

/**
 * Completes a verification session. The backend fetches and validates the
 * Rekognition result itself — this call never sends (or can send) a result.
 */
export async function completePhotoVerificationSession(sessionId) {
  const res = await fetch(`${API_URL}/api/photo-verification/${encodeURIComponent(sessionId)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({}),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const error = new Error(body?.message || "No se pudo completar la verificación.");
    error.code = body?.code;
    error.status = res.status;
    throw error;
  }
  return body;
}

/**
 * Reads the status of the user's persisted facial reference (metadata only
 * — never biometric data) used for "Perfil Auténtico" photo-change reuse.
 */
export async function getFaceReferenceStatus() {
  const res = await fetch(`${API_URL}/api/photo-verification/reference`, {
    headers: { ...authHeaders() },
    cache: "no-store",
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(body?.message || "No se pudo consultar la referencia facial.");
  }
  return body;
}

/**
 * Withdraws consent and requests deletion of the user's facial reference.
 * The backend schedules the AWS-side deletion and never reuses the
 * reference again, even before AWS confirms the deletion.
 */
export async function deleteFaceReference() {
  const res = await fetch(`${API_URL}/api/photo-verification/reference`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(body?.message || "No se pudo eliminar la referencia facial.");
  }
  return body;
}
