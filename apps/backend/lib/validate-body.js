/**
 * Zod-based body validation helper for Reputy backend.
 *
 * Returns objects compatible with sendJson() — does NOT throw.
 * Uses the same error shape as the rest of server.js:
 *   { ok:false, error:'VALIDATION_ERROR', message:'...', details:[...] }
 *
 * Usage in a handler:
 *   const { validateBody, schemas } = require('./lib/validate-body');
 *   const v = validateBody(schemas.login, body);
 *   if (!v.ok) return sendJson(res, 400, v.payload);
 *   const { email, password } = v.data;
 */

const { z } = require('zod');

// ============ HELPER ============

/**
 * Validate a body object against a Zod schema.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {any} body - The parsed request body
 * @returns {{ ok:true, data:any } | { ok:false, payload:object }}
 */
function validateBody(schema, body) {
  const result = schema.safeParse(body);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  // Build details array from Zod issues
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

  // First issue message for the top-level message
  const firstMessage = details[0]?.message || 'Données invalides';

  return {
    ok: false,
    payload: {
      ok: false,
      error: 'VALIDATION_ERROR',
      message: firstMessage,
      action: 'FIX_INPUT',
      details,
    },
  };
}

// ============ SCHEMAS ============

const schemas = {
  /**
   * POST /auth/login
   */
  login: z.object({
    email: z.string({ required_error: 'Email requis' })
      .min(1, 'Email requis')
      .email('Format email invalide'),
    password: z.string({ required_error: 'Mot de passe requis' })
      .min(1, 'Mot de passe requis'),
  }),

  /**
   * POST /client/ai/suggest-reply
   */
  aiSuggestReply: z.object({
    reviewText: z.string({ required_error: 'reviewText requis' })
      .min(5, 'reviewText requis (min 5 caractères)')
      .max(5000, 'reviewText trop long (max 5000 caractères)'),
    tone: z.enum(['professional', 'warm', 'short', 'empathetic']).optional().default('professional'),
    language: z.string().optional().default('fr'),
    instructions: z.string().max(500).optional(),
    healthMode: z.boolean().optional().default(false),
  }),

  /**
   * POST /client/billing/checkout
   */
  billingCheckout: z.object({
    planId: z.enum(['argent', 'or', 'platinum'], {
      required_error: 'planId requis',
      invalid_type_error: 'planId invalide',
    }),
    provider: z.string().optional().default('stripe'),
    billingDetails: z.any().optional(),
  }),

  /**
   * POST /client/installations (create)
   */
  installationCreate: z.object({
    label: z.string().max(100, 'Label trop long (max 100 caractères)').optional().default('Nouvelle installation'),
    metadata: z.record(z.any()).optional().default({}),
  }),

  /**
   * POST /api/settings (session auth branch only)
   */
  settingsUpdate: z.object({
    googleReviewUrl: z.string().max(500, 'URL trop longue').optional(),
    cabinetName: z.string().max(200, 'Nom trop long (max 200 caractères)').optional(),
  }).passthrough(), // Allow extra fields (legacy compat)
};

// ============ EXPORTS ============

module.exports = {
  validateBody,
  schemas,
  z, // Re-export for ad-hoc schemas if needed
};
