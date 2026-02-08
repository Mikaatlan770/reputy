/**
 * Reputy Structured Errors Module
 * 
 * Provides categorized errors with:
 * - errorCategory: machine-readable category
 * - errorCode: technical code (for logging)
 * - message: human-readable message (FR)
 * - action: suggested action for UI
 * - httpStatus: HTTP status code
 */

// ============================================================
// Error Categories
// ============================================================

const ERROR_CATEGORIES = {
  // Quota errors
  QUOTA_SMS_EXCEEDED: {
    category: 'QUOTA_SMS_EXCEEDED',
    code: 'QUOTA_EXCEEDED',
    message: 'Vos crédits SMS sont épuisés',
    action: 'BUY_PACK_SMS',
    httpStatus: 402
  },
  QUOTA_EMAIL_EXCEEDED: {
    category: 'QUOTA_EMAIL_EXCEEDED',
    code: 'QUOTA_EXCEEDED',
    message: 'Vos crédits Email sont épuisés',
    action: 'BUY_PACK_EMAIL',
    httpStatus: 402
  },
  QUOTA_AI_EXCEEDED: {
    category: 'QUOTA_AI_EXCEEDED',
    code: 'QUOTA_EXCEEDED',
    message: 'Vos crédits IA sont épuisés',
    action: 'BUY_PACK_AI',
    httpStatus: 402
  },
  QUOTA_QR_EXCEEDED: {
    category: 'QUOTA_QR_EXCEEDED',
    code: 'QUOTA_EXCEEDED',
    message: 'Limite de QR codes atteinte',
    action: 'UPGRADE_PLAN',
    httpStatus: 402
  },
  QUOTA_NFC_EXCEEDED: {
    category: 'QUOTA_NFC_EXCEEDED',
    code: 'QUOTA_EXCEEDED',
    message: 'Limite de tags NFC atteinte',
    action: 'UPGRADE_PLAN',
    httpStatus: 402
  },

  // Subscription errors
  SUBSCRIPTION_INACTIVE: {
    category: 'SUBSCRIPTION_INACTIVE',
    code: 'SUBSCRIPTION_INACTIVE',
    message: 'Votre abonnement est inactif',
    action: 'REACTIVATE',
    httpStatus: 403
  },
  SUBSCRIPTION_PAST_DUE: {
    category: 'SUBSCRIPTION_PAST_DUE',
    code: 'SUBSCRIPTION_PAST_DUE',
    message: 'Paiement en attente',
    action: 'UPDATE_PAYMENT',
    httpStatus: 402
  },
  SUBSCRIPTION_SUSPENDED: {
    category: 'SUBSCRIPTION_SUSPENDED',
    code: 'SUBSCRIPTION_SUSPENDED',
    message: 'Compte suspendu - Contactez le support',
    action: 'CONTACT_SUPPORT',
    httpStatus: 403
  },
  SUBSCRIPTION_CANCELLED: {
    category: 'SUBSCRIPTION_CANCELLED',
    code: 'SUBSCRIPTION_CANCELLED',
    message: 'Abonnement résilié',
    action: 'RESUBSCRIBE',
    httpStatus: 403
  },
  SUBSCRIPTION_READ_ONLY: {
    category: 'SUBSCRIPTION_READ_ONLY',
    code: 'SUBSCRIPTION_READ_ONLY',
    message: 'Compte en lecture seule - Régularisez votre situation',
    action: 'UPDATE_PAYMENT',
    httpStatus: 403
  },

  // Authentication errors
  INVALID_TOKEN: {
    category: 'INVALID_TOKEN',
    code: 'UNAUTHORIZED',
    message: 'Token invalide ou expiré',
    action: 'CHECK_CONFIG',
    httpStatus: 401
  },
  INVALID_CREDENTIALS: {
    category: 'INVALID_CREDENTIALS',
    code: 'INVALID_CREDENTIALS',
    message: 'Email ou mot de passe incorrect',
    action: 'RETRY',
    httpStatus: 401
  },
  SESSION_EXPIRED: {
    category: 'SESSION_EXPIRED',
    code: 'SESSION_EXPIRED',
    message: 'Session expirée, veuillez vous reconnecter',
    action: 'LOGIN',
    httpStatus: 401
  },
  EMAIL_NOT_VERIFIED: {
    category: 'EMAIL_NOT_VERIFIED',
    code: 'EMAIL_NOT_VERIFIED',
    message: 'Veuillez vérifier votre adresse email',
    action: 'VERIFY_EMAIL',
    httpStatus: 403
  },

  // Installation errors
  INSTALLATION_REVOKED: {
    category: 'INSTALLATION_REVOKED',
    code: 'INSTALLATION_REVOKED',
    message: 'Cette installation a été révoquée',
    action: 'NEW_INSTALLATION',
    httpStatus: 401
  },
  INSTALLATION_NOT_FOUND: {
    category: 'INSTALLATION_NOT_FOUND',
    code: 'NOT_FOUND',
    message: 'Installation introuvable',
    action: 'CHECK_CONFIG',
    httpStatus: 404
  },

  // Rate limiting
  RATE_LIMITED: {
    category: 'RATE_LIMITED',
    code: 'RATE_LIMITED',
    message: 'Trop de tentatives, veuillez patienter',
    action: 'WAIT',
    httpStatus: 429
  },

  // Resource errors
  NOT_FOUND: {
    category: 'NOT_FOUND',
    code: 'NOT_FOUND',
    message: 'Ressource introuvable',
    action: 'CHECK_URL',
    httpStatus: 404
  },
  ALREADY_EXISTS: {
    category: 'ALREADY_EXISTS',
    code: 'CONFLICT',
    message: 'Cette ressource existe déjà',
    action: 'UPDATE',
    httpStatus: 409
  },

  // Validation errors
  VALIDATION_ERROR: {
    category: 'VALIDATION_ERROR',
    code: 'VALIDATION_ERROR',
    message: 'Données invalides',
    action: 'FIX_INPUT',
    httpStatus: 400
  },
  MISSING_FIELD: {
    category: 'MISSING_FIELD',
    code: 'VALIDATION_ERROR',
    message: 'Champ requis manquant',
    action: 'FIX_INPUT',
    httpStatus: 400
  },

  // Server errors
  INTERNAL_ERROR: {
    category: 'INTERNAL_ERROR',
    code: 'INTERNAL_ERROR',
    message: 'Erreur interne, veuillez réessayer',
    action: 'RETRY',
    httpStatus: 500
  },
  SERVICE_UNAVAILABLE: {
    category: 'SERVICE_UNAVAILABLE',
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service temporairement indisponible',
    action: 'RETRY_LATER',
    httpStatus: 503
  }
};

// ============================================================
// Error Builder Functions
// ============================================================

/**
 * Create a structured error response
 * @param {string} categoryKey - Key from ERROR_CATEGORIES
 * @param {object} options - Additional options
 * @param {string} options.message - Override default message
 * @param {object} options.details - Additional details
 * @param {string} options.field - Field name for validation errors
 * @returns {object} Structured error object
 */
function createError(categoryKey, options = {}) {
  const template = ERROR_CATEGORIES[categoryKey];
  
  if (!template) {
    console.error(`[ERRORS] Unknown error category: ${categoryKey}`);
    return {
      ok: false,
      errorCategory: 'INTERNAL_ERROR',
      errorCode: 'INTERNAL_ERROR',
      message: 'Erreur interne',
      action: 'RETRY',
      httpStatus: 500
    };
  }
  
  return {
    ok: false,
    errorCategory: template.category,
    errorCode: template.code,
    message: options.message || template.message,
    action: template.action,
    httpStatus: template.httpStatus,
    ...(options.details && { details: options.details }),
    ...(options.field && { field: options.field })
  };
}

/**
 * Create a quota exceeded error with details
 * @param {string} type - 'sms' | 'email' | 'ai' | 'qr' | 'nfc'
 * @param {object} details - Quota details
 * @returns {object} Structured error
 */
function quotaExceededError(type, details = {}) {
  const categoryMap = {
    sms: 'QUOTA_SMS_EXCEEDED',
    email: 'QUOTA_EMAIL_EXCEEDED',
    ai: 'QUOTA_AI_EXCEEDED',
    qr: 'QUOTA_QR_EXCEEDED',
    nfc: 'QUOTA_NFC_EXCEEDED'
  };
  
  const category = categoryMap[type] || 'QUOTA_SMS_EXCEEDED';
  return createError(category, { details });
}

/**
 * Create a subscription state error
 * @param {string} status - Subscription status
 * @param {object} details - Additional details
 * @returns {object} Structured error
 */
function subscriptionError(status, details = {}) {
  const statusMap = {
    inactive: 'SUBSCRIPTION_INACTIVE',
    past_due: 'SUBSCRIPTION_PAST_DUE',
    suspended: 'SUBSCRIPTION_SUSPENDED',
    cancelled: 'SUBSCRIPTION_CANCELLED',
    read_only: 'SUBSCRIPTION_READ_ONLY'
  };
  
  const category = statusMap[status] || 'SUBSCRIPTION_INACTIVE';
  return createError(category, { details });
}

/**
 * Create a validation error
 * @param {string} field - Field name
 * @param {string} message - Error message
 * @returns {object} Structured error
 */
function validationError(field, message) {
  return createError('VALIDATION_ERROR', {
    field,
    message: message || `Le champ "${field}" est invalide`
  });
}

/**
 * Create a missing field error
 * @param {string} field - Field name
 * @returns {object} Structured error
 */
function missingFieldError(field) {
  return createError('MISSING_FIELD', {
    field,
    message: `Le champ "${field}" est requis`
  });
}

// ============================================================
// HTTP Response Helper
// ============================================================

/**
 * Send a structured error response
 * @param {object} res - HTTP response object
 * @param {string} categoryKey - Error category key
 * @param {object} options - Additional options
 */
function sendErrorResponse(res, categoryKey, options = {}) {
  const error = createError(categoryKey, options);
  const { httpStatus, ...body } = error;
  
  res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Categories reference
  ERROR_CATEGORIES,
  
  // Builder functions
  createError,
  quotaExceededError,
  subscriptionError,
  validationError,
  missingFieldError,
  
  // HTTP helper
  sendErrorResponse
};
