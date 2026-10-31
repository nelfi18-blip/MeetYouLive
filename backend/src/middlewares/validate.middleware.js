const { z } = require("zod");
const { SPARK_PACKAGE_IDS } = require("../config/spark-packages.js");

// ─── Schemas ──────────────────────────────────────────────────────────────────

const coinPurchaseSchema = z.object({
  packageId: z
    .number({ required_error: "packageId es requerido", invalid_type_error: "packageId debe ser un número" })
    .int("packageId debe ser un número entero")
    .positive("packageId debe ser un número positivo"),
});

const sparkPurchaseSchema = z.object({
  package: z
    .number({ required_error: "package es requerido", invalid_type_error: "package debe ser un número" })
    .int("package debe ser un número entero")
    .positive("package debe ser un número positivo")
    .refine(
      (value) => SPARK_PACKAGE_IDS.includes(value),
      `Paquete de sparks inválido. Usa ${SPARK_PACKAGE_IDS.join(", ")}`
    ),
});

const googlePlayCoinsPurchaseSchema = z.object({
  productId: z
    .string({ required_error: "productId es requerido", invalid_type_error: "productId debe ser una cadena" })
    .min(1, "productId es requerido")
    .max(100, "productId inválido"),
  purchaseToken: z
    .string({ required_error: "purchaseToken es requerido", invalid_type_error: "purchaseToken debe ser una cadena" })
    .min(1, "purchaseToken es requerido")
    .max(4096, "purchaseToken inválido"),
});

const sparkBoostSchema = z.object({
  boostType: z.enum(
    ["visibility_boost", "super_interest", "speed_dating", "room_entry"],
    { errorMap: () => ({ message: "Tipo de boost inválido. Valores permitidos: visibility_boost, super_interest, speed_dating, room_entry" }) }
  ),
});

const giftSendSchema = z.object({
  giftId: z.string().optional(),
  giftSlug: z.string().optional(),
  recipientId: z.string().optional(),
  receiverId: z.string().optional(),
  liveId: z.string().optional(),
  context: z.enum(["live", "profile", "private_call"]).optional(),
  contextId: z.string().optional().nullable(),
  message: z.string().max(500, "message no puede superar 500 caracteres").optional(),
  quantity: z
    .number({ invalid_type_error: "quantity debe ser un número" })
    .int("quantity debe ser un entero")
    .min(1, "quantity mínimo es 1")
    .max(50, "quantity máximo es 50")
    .optional(),
}).refine(
  (data) => data.giftId || data.giftSlug,
  { message: "Se requiere giftId o giftSlug", path: ["giftId"] }
).refine(
  (data) => data.recipientId || data.receiverId,
  { message: "Se requiere recipientId o receiverId", path: ["recipientId"] }
).transform((data) => ({
  ...data,
  receiverId: data.receiverId || data.recipientId,
}));

// Deliberately conservative: just enough to catch missing "@"/domain typos
// before a creator's payout request is persisted with an unusable PayPal
// destination. Not a full RFC 5322 validator — PayPal's own signup already
// enforces the stricter rules; this is only a cheap guard against obviously
// wrong input (e.g. a username instead of an email).
const PAYPAL_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const payoutRequestSchema = z
  .object({
    amount: z
      .number({ invalid_type_error: "amount debe ser un número" })
      .positive("amount debe ser un valor positivo")
      .optional(),
    // No default here, intentionally: every new payout request must name its
    // method explicitly (see requestPayout in creator.controller.js). An
    // omitted/invalid method is rejected below rather than silently
    // defaulting to "stripe".
    method: z
      .enum(["zelle", "paypal", "bank", "stripe", "other"], {
        errorMap: () => ({ message: "Debes indicar un método de pago explícito. Valores permitidos: zelle, paypal, bank, stripe, other." }),
      }),
    paymentDetails: z.string().trim().optional().default(""),
  })
  // PayPal payouts are always manual (see requestPayout/markWithdrawalPaid):
  // without a destination email on file an admin has nothing to pay out to,
  // so a "paypal" request without a valid-looking email must be rejected
  // here rather than silently accepted with an empty paymentDetails.
  .superRefine((data, ctx) => {
    if (data.method === "paypal" && !PAYPAL_EMAIL_PATTERN.test(data.paymentDetails)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentDetails"],
        message: "Debes indicar un correo de PayPal válido para solicitar el retiro.",
      });
    }
  });

// ISO 3166-1 alpha-2 shape (e.g. "US", "MX"); see COUNTRY_CODE_PATTERN in
// lib/creatorPayoutProfile.js (the backend completeness-gate helper reuses
// the same shape, duplicated there to stay require()-free).
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

// Partial-update schema for the creator payout profile (GET/PATCH
// /api/creator/payout-profile). Every field is optional so a client can
// save step 1 (beneficiary) and step 2 (destination) independently, but at
// least one recognized field must be present — an empty PATCH body is
// rejected rather than silently accepted as a no-op.
const payoutProfileUpdateSchema = z
  .object({
    legalName: z
      .string({ invalid_type_error: "legalName debe ser una cadena" })
      .trim()
      .min(2, "El nombre legal debe tener al menos 2 caracteres")
      .max(120, "El nombre legal no puede superar 120 caracteres")
      .optional(),
    residenceCountry: z
      .string({ invalid_type_error: "residenceCountry debe ser una cadena" })
      .trim()
      .toUpperCase()
      .regex(COUNTRY_CODE_PATTERN, "País de residencia inválido (código ISO de 2 letras)")
      .optional(),
    taxResidenceCountry: z
      .string({ invalid_type_error: "taxResidenceCountry debe ser una cadena" })
      .trim()
      .toUpperCase()
      .regex(COUNTRY_CODE_PATTERN, "País de residencia fiscal inválido (código ISO de 2 letras)")
      .optional(),
    beneficiaryType: z.enum(["individual", "company"], {
      errorMap: () => ({ message: "Tipo de beneficiario inválido. Valores permitidos: individual, company." }),
    }).optional(),
    destinationMethod: z.enum(["paypal"], {
      errorMap: () => ({ message: "Método de destino inválido. Solo se admite PayPal por ahora." }),
    }).optional(),
    paypalEmail: z
      .string({ invalid_type_error: "paypalEmail debe ser una cadena" })
      .trim()
      .max(254, "El correo de PayPal no puede superar 254 caracteres")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paypalEmail !== undefined && !PAYPAL_EMAIL_PATTERN.test(data.paypalEmail)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paypalEmail"],
        message: "Debes indicar un correo de PayPal válido.",
      });
    }
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se recibieron campos para actualizar.",
  });

const registerSchema = z.object({
  username: z
    .string({ required_error: "username es requerido" })
    .min(2, "username debe tener al menos 2 caracteres")
    .max(50, "username no puede superar 50 caracteres"),
  name: z
    .string()
    .max(80, "name no puede superar 80 caracteres")
    .optional(),
  email: z
    .string({ required_error: "email es requerido" })
    .email("El formato del email no es válido"),
  password: z
    .string({ required_error: "password es requerido" })
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
  ref: z.string().optional(),
  agencyCode: z.string().optional(),
  creatorInvite: z.string().optional(),
  location: z.any().optional(),
  locationLabel: z.string().optional(),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: "email es requerido" })
    .email("El formato del email no es válido"),
  password: z
    .string({ required_error: "password es requerido" })
    .min(1, "password es requerido"),
});

const exclusiveContentSchema = z.object({
  title: z
    .string({ required_error: "title es requerido" })
    .min(1, "title es requerido"),
  price: z
    .number({ invalid_type_error: "price debe ser un número" })
    .min(1, "price mínimo es 1")
    .max(10000, "price máximo es 10000"),
});

const reportSchema = z.object({
  targetId: z
    .string({ required_error: "targetId es requerido" }),
  targetType: z.enum(
    ["user", "live", "message", "gift", "video"],
    { errorMap: () => ({ message: "targetType inválido. Valores permitidos: user, live, message, gift, video" }) }
  ),
  reason: z
    .string({ required_error: "reason es requerido" })
    .min(5, "reason debe tener al menos 5 caracteres")
    .max(500, "reason no puede superar 500 caracteres"),
});

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * Middleware factory that validates req.body against the given Zod schema.
 * Returns 400 with error details on failure.
 * Replaces req.body with the validated (and coerced) data on success.
 *
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      return res.status(400).json({
        message: errors[0]?.message || "Datos de entrada inválidos",
        errors,
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validate,
  coinPurchaseSchema,
  googlePlayCoinsPurchaseSchema,
  sparkPurchaseSchema,
  sparkBoostSchema,
  giftSendSchema,
  payoutRequestSchema,
  payoutProfileUpdateSchema,
  PAYPAL_EMAIL_PATTERN,
  registerSchema,
  loginSchema,
  exclusiveContentSchema,
  reportSchema,
};
