const { z } = require("zod");

// ─── Schemas ──────────────────────────────────────────────────────────────────

const coinPurchaseSchema = z.object({
  packageId: z
    .number({ invalid_type_error: "packageId debe ser un número entero positivo" })
    .int("packageId debe ser un número entero")
    .positive("packageId debe ser un número positivo"),
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
);

const payoutRequestSchema = z.object({
  amount: z
    .number({ invalid_type_error: "amount debe ser un número" })
    .positive("amount debe ser un valor positivo")
    .optional(),
  method: z
    .enum(["bank_transfer", "paypal", "crypto", "stripe"], {
      errorMap: () => ({ message: "Método de pago inválido. Valores permitidos: bank_transfer, paypal, crypto, stripe" }),
    })
    .optional(),
  details: z
    .string({ invalid_type_error: "details debe ser texto" })
    .min(5, "details debe tener al menos 5 caracteres")
    .optional(),
});

const registerSchema = z.object({
  username: z
    .string({ required_error: "username es requerido" })
    .min(2, "username debe tener al menos 2 caracteres")
    .max(50, "username no puede superar 50 caracteres"),
  email: z
    .string({ required_error: "email es requerido" })
    .email("El formato del email no es válido"),
  password: z
    .string({ required_error: "password es requerido" })
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
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
  sparkBoostSchema,
  giftSendSchema,
  payoutRequestSchema,
  registerSchema,
  loginSchema,
  exclusiveContentSchema,
  reportSchema,
};
