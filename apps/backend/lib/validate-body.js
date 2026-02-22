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
    smsTemplate: z.string().max(300, 'Template SMS trop long (max 300 caractères)').optional(),
  }).passthrough(), // Allow extra fields (legacy compat)

  // ============ PR-8b: Multi-establishment schemas ============

  /**
   * POST /auth/select-org (multi-org login flow)
   */
  selectOrg: z.object({
    pendingToken: z.string({ required_error: 'Token requis' }).min(1, 'Token requis'),
    orgId: z.string({ required_error: 'orgId requis' }).min(1, 'orgId requis'),
  }),

  /**
   * POST /client/orgs/switch
   */
  switchOrg: z.object({
    orgId: z.string({ required_error: 'orgId requis' }).min(1, 'orgId requis'),
  }),

  /**
   * POST /client/orgs (create establishment)
   */
  createOrg: z.object({
    name: z.string({ required_error: 'Nom requis' })
      .min(2, 'Nom requis (min 2 caractères)')
      .max(200, 'Nom trop long (max 200 caractères)'),
    email: z.string().email('Email invalide').optional(),
    vertical: z.enum(['health', 'beauty', 'legal', 'restaurant', 'other']).optional().default('health'),
  }),

  /**
   * POST /client/team/invite
   */
  teamInvite: z.object({
    email: z.string({ required_error: 'Email requis' }).email('Email invalide'),
    role: z.enum(['admin', 'agent'], {
      required_error: 'Rôle requis',
      invalid_type_error: 'Rôle invalide (admin ou agent)',
    }),
    name: z.string().max(100, 'Nom trop long').optional(),
    permissions: z.object({
      reviews: z.boolean().optional(),
      stats: z.boolean().optional(),
      campaigns: z.boolean().optional(),
      billing: z.boolean().optional(),
      team: z.boolean().optional(),
      settings: z.boolean().optional(),
      ai: z.boolean().optional(),
    }).optional(),
  }),

  /**
   * PUT /client/team/:membershipId
   */
  teamUpdateRole: z.object({
    role: z.enum(['admin', 'agent'], {
      required_error: 'Rôle requis',
      invalid_type_error: 'Rôle invalide (admin ou agent)',
    }).optional(),
    permissions: z.object({
      reviews: z.boolean().optional(),
      stats: z.boolean().optional(),
      campaigns: z.boolean().optional(),
      billing: z.boolean().optional(),
      team: z.boolean().optional(),
      settings: z.boolean().optional(),
      ai: z.boolean().optional(),
    }).optional(),
  }).refine(data => data.role || data.permissions, {
    message: 'Rôle ou permissions requis',
  }),

  // ============ PR-8e: Accept invite ============

  /**
   * POST /auth/accept-invite
   */
  acceptInvite: z.object({
    token: z.string({ required_error: 'Token requis' }).min(1, 'Token requis'),
    newPassword: z.string().min(8, 'Mot de passe min 8 caractères').optional(),
  }),

  // ============ Campaigns & Contacts ============

  /**
   * POST /client/contacts
   */
  contactCreate: z.object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    email: z.string().email('Email invalide').optional(),
    phone: z.string().max(30).optional(),
    tags: z.array(z.string()).optional(),
  }).refine(data => data.email || data.phone, {
    message: 'Email ou téléphone requis',
  }),

  /**
   * POST /client/contacts/import
   */
  contactImport: z.object({
    contacts: z.array(z.object({
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(30).optional(),
    })).min(1, 'Au moins 1 contact requis').max(5000, 'Maximum 5000 contacts par import'),
    source: z.enum(['import_csv', 'import_excel']).optional().default('import_csv'),
  }),

  /**
   * POST /client/campaigns
   */
  campaignCreate: z.object({
    name: z.string({ required_error: 'Nom requis' })
      .min(2, 'Nom trop court (min 2)')
      .max(200, 'Nom trop long (max 200)'),
    type: z.enum(['review', 'marketing']).optional().default('review'),
    channel: z.enum(['sms', 'email'], { required_error: 'Canal requis (sms ou email)' }),
    template: z.string().max(2000).optional(),
    subject: z.string().max(200).optional(),
    scheduledAt: z.string().optional(),
    spamThreshold: z.number().int().min(1).max(10).optional().default(3),
  }),

  /**
   * PUT /client/campaigns/:id
   */
  campaignUpdate: z.object({
    name: z.string().min(2).max(200).optional(),
    template: z.string().max(2000).optional(),
    subject: z.string().max(200).optional(),
    scheduledAt: z.string().nullable().optional(),
    spamThreshold: z.number().int().min(1).max(10).optional(),
    status: z.enum(['draft', 'paused']).optional(),
  }),

  /**
   * POST /client/campaigns/:id/send
   */
  campaignSend: z.object({
    contactIds: z.array(z.string()).min(1, 'Au moins 1 destinataire requis').optional(),
    sendAll: z.boolean().optional(),
  }).refine(data => data.sendAll || (data.contactIds && data.contactIds.length > 0), {
    message: 'contactIds ou sendAll requis',
  }),
};

// ============ EXPORTS ============

module.exports = {
  validateBody,
  schemas,
  z, // Re-export for ad-hoc schemas if needed
};
