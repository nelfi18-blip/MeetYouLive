"use strict";

const crypto = require("crypto");

const BCRYPT_PASSWORD_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const ADMIN_ROLES = new Set(["admin"]);
const USER_AUDIT_FIELDS = [
  "_id",
  "email",
  "role",
  "authProvider",
  "googleId",
  "password",
  "emailVerified",
  "emailVerificationCode",
  "emailVerificationExpires",
  "emailVerificationSentAt",
  "createdAt",
  "updatedAt",
  "images.source",
].join(" ");

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

const hasGoogleId = (user = {}) => hasValue(user.googleId);

const hasGoogleImageEvidence = (user = {}) =>
  Array.isArray(user.images) && user.images.some((image) => image?.source === "google");

const normalizeIdSet = (ids = []) =>
  new Set(ids.filter((id) => id !== null && id !== undefined).map((id) => String(id)));

const hasNextAuthGoogleEvidence = (user = {}, nextAuthGoogleUserIds = new Set()) =>
  nextAuthGoogleUserIds.has(String(user._id));

const hasGoogleEvidence = (user = {}, nextAuthGoogleUserIds = new Set()) =>
  user.authProvider === "google" ||
  hasGoogleId(user) ||
  hasGoogleImageEvidence(user) ||
  hasNextAuthGoogleEvidence(user, nextAuthGoogleUserIds);

const hasPasswordPresent = (user = {}) => hasValue(user.password);

const hasBcryptPassword = (user = {}) =>
  typeof user.password === "string" && BCRYPT_PASSWORD_PATTERN.test(user.password);

const hasOtpState = (user = {}) =>
  hasValue(user.emailVerificationCode) ||
  user.emailVerificationExpires != null ||
  user.emailVerificationSentAt != null;

const isAdmin = (user = {}) => ADMIN_ROLES.has(user.role);

function maskEmail(email) {
  if (!hasValue(email)) return null;
  const normalized = String(email).trim().toLowerCase();
  const [local, domain = ""] = normalized.split("@");
  const safeLocal =
    local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  const safeDomain = domain ? `@${domain.replace(/^[^.]*/, "***")}` : "";
  return `${safeLocal}${safeDomain}`;
}

function emailFingerprint(email) {
  if (!hasValue(email)) return null;
  return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex").slice(0, 12);
}

function partialId(id) {
  if (!hasValue(id)) return null;
  const value = String(id);
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function dateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function getEvidence(user = {}, nextAuthGoogleUserIds = new Set()) {
  const evidence = [];
  if (user.authProvider === "google") evidence.push("authProvider=google");
  if (hasGoogleId(user)) evidence.push("googleId presente");
  if (hasGoogleImageEvidence(user)) evidence.push("metadata images.source=google");
  if (hasNextAuthGoogleEvidence(user, nextAuthGoogleUserIds)) evidence.push("cuenta NextAuth provider=google");
  if (user.authProvider === "local") evidence.push("authProvider=local");
  if (hasBcryptPassword(user)) evidence.push("password bcrypt presente");
  else if (hasPasswordPresent(user)) evidence.push("password presente no-bcrypt");
  return evidence;
}

function getContradictions(user = {}, nextAuthGoogleUserIds = new Set()) {
  const contradictions = [];
  const googleEvidence = hasGoogleEvidence(user, nextAuthGoogleUserIds);
  const bcryptPassword = hasBcryptPassword(user);

  if (googleEvidence && user.authProvider && user.authProvider !== "google") {
    contradictions.push("evidencia Google con authProvider distinto de google");
  }
  if (googleEvidence && user.emailVerified !== true) {
    contradictions.push("cuenta Google con emailVerified distinto de true");
  }
  if (googleEvidence && hasOtpState(user)) {
    contradictions.push("cuenta Google conserva estado OTP");
  }
  if (!googleEvidence && bcryptPassword && user.authProvider && user.authProvider !== "local") {
    contradictions.push("cuenta local con authProvider distinto de local");
  }
  if (user.authProvider === "google" && !hasGoogleId(user) && !hasGoogleImageEvidence(user) && !hasNextAuthGoogleEvidence(user, nextAuthGoogleUserIds)) {
    contradictions.push("authProvider google sin evidencia Google adicional");
  }
  if (user.authProvider === "local" && !bcryptPassword && !googleEvidence) {
    contradictions.push("authProvider local sin hash bcrypt verificable");
  }
  if (isAdmin(user) && (user.emailVerified !== true || hasOtpState(user))) {
    contradictions.push("admin conserva estado de flujo OTP");
  }

  return contradictions;
}

function classifyUser(user = {}, options = {}) {
  const nextAuthGoogleUserIds = normalizeIdSet(options.nextAuthGoogleUserIds || []);
  const googleEvidence = hasGoogleEvidence(user, nextAuthGoogleUserIds);
  const bcryptPassword = hasBcryptPassword(user);
  const contradictions = getContradictions(user, nextAuthGoogleUserIds);
  const evidence = getEvidence(user, nextAuthGoogleUserIds);

  if (isAdmin(user)) {
    return {
      classification: "admin",
      reason: evidence.length ? evidence : ["role=admin"],
      recommendedAction:
        user.emailVerified !== true || hasOtpState(user)
          ? "Excluir del flujo OTP; una migración posterior puede limpiar estado de verificación de admin."
          : "Sin acción de datos; mantener fuera del flujo OTP.",
      contradictions,
    };
  }

  if (googleEvidence) {
    return {
      classification: user.emailVerified === true ? "google_confirmada" : "google_con_emailVerified_incorrecto",
      reason: evidence,
      recommendedAction:
        user.emailVerified === true && !hasOtpState(user)
          ? "Sin acción."
          : "Corregible automáticamente después: authProvider=google, emailVerified=true y limpiar campos OTP.",
      contradictions,
    };
  }

  if (bcryptPassword) {
    return {
      classification: "local_confirmada",
      reason: evidence,
      recommendedAction:
        user.authProvider === "local"
          ? "Sin acción de proveedor; respetar emailVerified actual."
          : "Corregible automáticamente después: authProvider=local si no aparece evidencia Google.",
      contradictions,
    };
  }

  return {
    classification: "legacy_ambigua",
    reason: evidence.length ? evidence : ["sin evidencia persistida suficiente"],
    recommendedAction: "Mantener como “Sin información”; requiere revisión manual o nueva evidencia persistida.",
    contradictions,
  };
}

function summarizeAuditRows(rows) {
  const counts = {
    totalUsers: rows.length,
    googleConfirmed: 0,
    localConfirmed: 0,
    admins: 0,
    legacyAmbiguous: 0,
    emailVerified: 0,
    emailUnverified: 0,
    googleWithEmailVerifiedFalse: 0,
    localWithIncorrectAuthProvider: 0,
    adminWithIncorrectOtpState: 0,
    contradictoryAccounts: 0,
    automaticallyCorrectable: 0,
    mustRemainUnknown: 0,
  };

  for (const row of rows) {
    if (row.emailVerified === true) counts.emailVerified += 1;
    else if (row.classification !== "admin") counts.emailUnverified += 1;

    if (row.classification === "google_confirmada") counts.googleConfirmed += 1;
    if (row.classification === "local_confirmada") counts.localConfirmed += 1;
    if (row.classification === "admin") counts.admins += 1;
    if (row.classification === "legacy_ambigua") {
      counts.legacyAmbiguous += 1;
      counts.mustRemainUnknown += 1;
    }
    if (row.classification === "google_con_emailVerified_incorrecto") {
      counts.googleWithEmailVerifiedFalse += 1;
      counts.automaticallyCorrectable += 1;
    }
    if (row.localWithIncorrectAuthProvider) {
      counts.localWithIncorrectAuthProvider += 1;
      counts.automaticallyCorrectable += 1;
    }
    if (row.adminWithIncorrectOtpState) counts.adminWithIncorrectOtpState += 1;
    if (row.contradictions.length) counts.contradictoryAccounts += 1;
  }

  return counts;
}

function buildAuditReport(users = [], options = {}) {
  const nextAuthGoogleUserIds = normalizeIdSet(options.nextAuthGoogleUserIds || []);
  const rows = users.map((user) => {
    const classification = classifyUser(user, { nextAuthGoogleUserIds });
    const localWithIncorrectAuthProvider =
      classification.classification === "local_confirmada" && user.authProvider !== "local";
    const adminWithIncorrectOtpState = isAdmin(user) && (user.emailVerified !== true || hasOtpState(user));

    return {
      userId: partialId(user._id),
      email: maskEmail(user.email),
      emailFingerprint: emailFingerprint(user.email),
      role: user.role || null,
      authProvider: user.authProvider || null,
      googleId: hasGoogleId(user) ? "presente" : "ausente",
      password: hasPasswordPresent(user) ? "presente" : "ausente",
      passwordHashType: hasBcryptPassword(user) ? "bcrypt" : hasPasswordPresent(user) ? "otro" : "ausente",
      emailVerified: user.emailVerified === true ? true : user.emailVerified === false ? false : null,
      emailVerificationCode: hasValue(user.emailVerificationCode) ? "presente" : "ausente",
      emailVerificationExpires: user.emailVerificationExpires ? "presente" : "ausente",
      emailVerificationSentAt: user.emailVerificationSentAt ? "presente" : "ausente",
      createdAt: dateOnly(user.createdAt),
      updatedAt: dateOnly(user.updatedAt),
      classification: classification.classification,
      reason: classification.reason,
      recommendedAction: classification.recommendedAction,
      contradictions: classification.contradictions,
      localWithIncorrectAuthProvider,
      adminWithIncorrectOtpState,
    };
  });

  return {
    ok: true,
    dryRun: true,
    generatedAt: new Date().toISOString(),
    rootCause:
      "La clasificación incorrecta ocurre cuando la UI o scripts infieren proveedor por email o valores por defecto, en vez de usar evidencia persistida: authProvider, googleId, metadata Google, cuentas NextAuth y hash bcrypt.",
    counts: summarizeAuditRows(rows),
    migrationRecommendation:
      "Después de revisar esta auditoría, ejecutar una migración separada que solo normalice cuentas con evidencia inequívoca: Google => authProvider=google, emailVerified=true y OTP limpio; Local => authProvider=local solo con hash bcrypt y sin evidencia Google; Admin => fuera de OTP. Las legacy ambiguas deben permanecer como “Sin información”.",
    users: rows,
  };
}

async function getNextAuthGoogleUserIds(User, accountCollection) {
  const accounts = accountCollection || User?.db?.collection?.("accounts");
  if (!accounts?.distinct) return [];
  return accounts.distinct("userId", { provider: "google", userId: { $exists: true, $nin: [null, ""] } });
}

async function runUserClassificationAudit(User, options = {}) {
  const [users, nextAuthGoogleUserIds] = await Promise.all([
    User.find({}).select(USER_AUDIT_FIELDS).lean(),
    getNextAuthGoogleUserIds(User, options.accountCollection),
  ]);
  return buildAuditReport(users, { nextAuthGoogleUserIds });
}

module.exports = {
  ADMIN_ROLES,
  USER_AUDIT_FIELDS,
  buildAuditReport,
  classifyUser,
  getContradictions,
  hasBcryptPassword,
  hasGoogleEvidence,
  runUserClassificationAudit,
};
