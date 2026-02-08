/**
 * Error Messages Module
 * 
 * Maps backend error categories to user-friendly French messages with CTAs.
 * The backend returns { errorCategory, errorCode, message, action }
 * This module provides UI-friendly versions with icons, colors, and actionable buttons.
 */

// ============================================================
// Error Category Types
// ============================================================

export type ErrorCategory =
  | 'QUOTA_SMS_EXCEEDED'
  | 'QUOTA_EMAIL_EXCEEDED'
  | 'QUOTA_AI_EXCEEDED'
  | 'QUOTA_QR_EXCEEDED'
  | 'QUOTA_NFC_EXCEEDED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_READ_ONLY'
  | 'INVALID_TOKEN'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_EXPIRED'
  | 'EMAIL_NOT_VERIFIED'
  | 'INSTALLATION_REVOKED'
  | 'INSTALLATION_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'VALIDATION_ERROR'
  | 'MISSING_FIELD'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'

export type ActionType =
  | 'BUY_PACK_SMS'
  | 'BUY_PACK_EMAIL'
  | 'BUY_PACK_AI'
  | 'UPGRADE_PLAN'
  | 'REACTIVATE'
  | 'UPDATE_PAYMENT'
  | 'CONTACT_SUPPORT'
  | 'RESUBSCRIBE'
  | 'CHECK_CONFIG'
  | 'RETRY'
  | 'LOGIN'
  | 'VERIFY_EMAIL'
  | 'NEW_INSTALLATION'
  | 'WAIT'
  | 'CHECK_URL'
  | 'UPDATE'
  | 'FIX_INPUT'
  | 'RETRY_LATER'

// ============================================================
// Error Display Config
// ============================================================

export interface ErrorDisplay {
  title: string
  message: string
  icon: string // Emoji for simplicity, can be replaced with Lucide icons
  variant: 'error' | 'warning' | 'info'
  actionLabel?: string
  actionHref?: string
  actionCallback?: string // Name of callback function to trigger
}

export interface ActionConfig {
  label: string
  href?: string
  callback?: string
}

// ============================================================
// Messages FR par catégorie
// ============================================================

const ERROR_MESSAGES: Record<ErrorCategory, Omit<ErrorDisplay, 'actionLabel' | 'actionHref' | 'actionCallback'>> = {
  // Quota errors
  QUOTA_SMS_EXCEEDED: {
    title: 'Crédits SMS épuisés',
    message: 'Vous avez utilisé tous vos crédits SMS. Achetez un pack pour continuer à envoyer des SMS.',
    icon: '📱',
    variant: 'error'
  },
  QUOTA_EMAIL_EXCEEDED: {
    title: 'Crédits Email épuisés',
    message: 'Vous avez utilisé tous vos crédits email. Achetez un pack pour continuer.',
    icon: '📧',
    variant: 'error'
  },
  QUOTA_AI_EXCEEDED: {
    title: 'Crédits IA épuisés',
    message: 'Vous avez utilisé tous vos crédits IA. Achetez un pack pour continuer.',
    icon: '🤖',
    variant: 'error'
  },
  QUOTA_QR_EXCEEDED: {
    title: 'Limite QR codes atteinte',
    message: 'Vous avez atteint la limite de QR codes de votre plan. Passez à un plan supérieur.',
    icon: '📲',
    variant: 'warning'
  },
  QUOTA_NFC_EXCEEDED: {
    title: 'Limite tags NFC atteinte',
    message: 'Vous avez atteint la limite de tags NFC de votre plan. Passez à un plan supérieur.',
    icon: '📡',
    variant: 'warning'
  },

  // Subscription errors
  SUBSCRIPTION_INACTIVE: {
    title: 'Abonnement inactif',
    message: 'Votre abonnement est actuellement inactif. Réactivez-le pour continuer à utiliser Reputy.',
    icon: '⚠️',
    variant: 'warning'
  },
  SUBSCRIPTION_PAST_DUE: {
    title: 'Paiement en attente',
    message: 'Votre dernier paiement a échoué. Veuillez mettre à jour vos informations de paiement.',
    icon: '💳',
    variant: 'warning'
  },
  SUBSCRIPTION_SUSPENDED: {
    title: 'Compte suspendu',
    message: 'Votre compte a été suspendu. Contactez le support pour régulariser votre situation.',
    icon: '🚫',
    variant: 'error'
  },
  SUBSCRIPTION_CANCELLED: {
    title: 'Abonnement résilié',
    message: 'Votre abonnement a été résilié. Réabonnez-vous pour retrouver l\'accès complet.',
    icon: '❌',
    variant: 'error'
  },
  SUBSCRIPTION_READ_ONLY: {
    title: 'Mode lecture seule',
    message: 'Votre compte est en lecture seule. Vous pouvez consulter vos données mais pas effectuer d\'actions.',
    icon: '👁️',
    variant: 'warning'
  },

  // Auth errors
  INVALID_TOKEN: {
    title: 'Token invalide',
    message: 'Votre token d\'authentification est invalide ou a expiré. Vérifiez votre configuration.',
    icon: '🔑',
    variant: 'error'
  },
  INVALID_CREDENTIALS: {
    title: 'Identifiants incorrects',
    message: 'L\'email ou le mot de passe est incorrect. Veuillez réessayer.',
    icon: '🔐',
    variant: 'error'
  },
  SESSION_EXPIRED: {
    title: 'Session expirée',
    message: 'Votre session a expiré. Veuillez vous reconnecter.',
    icon: '⏰',
    variant: 'info'
  },
  EMAIL_NOT_VERIFIED: {
    title: 'Email non vérifié',
    message: 'Veuillez vérifier votre adresse email avant de continuer.',
    icon: '✉️',
    variant: 'warning'
  },

  // Installation errors
  INSTALLATION_REVOKED: {
    title: 'Installation révoquée',
    message: 'Cette installation a été révoquée. Créez une nouvelle installation pour continuer.',
    icon: '🔌',
    variant: 'error'
  },
  INSTALLATION_NOT_FOUND: {
    title: 'Installation introuvable',
    message: 'Cette installation n\'existe pas ou a été supprimée.',
    icon: '🔍',
    variant: 'error'
  },

  // Rate limiting
  RATE_LIMITED: {
    title: 'Trop de tentatives',
    message: 'Vous avez effectué trop de tentatives. Veuillez patienter quelques minutes.',
    icon: '⏳',
    variant: 'warning'
  },

  // Resource errors
  NOT_FOUND: {
    title: 'Ressource introuvable',
    message: 'La ressource demandée n\'existe pas ou a été supprimée.',
    icon: '🔍',
    variant: 'info'
  },
  ALREADY_EXISTS: {
    title: 'Ressource existante',
    message: 'Cette ressource existe déjà. Modifiez l\'existante ou utilisez un autre nom.',
    icon: '📋',
    variant: 'warning'
  },

  // Validation errors
  VALIDATION_ERROR: {
    title: 'Données invalides',
    message: 'Les données fournies sont invalides. Veuillez vérifier et réessayer.',
    icon: '⚠️',
    variant: 'warning'
  },
  MISSING_FIELD: {
    title: 'Champ requis manquant',
    message: 'Un ou plusieurs champs obligatoires n\'ont pas été remplis.',
    icon: '📝',
    variant: 'warning'
  },

  // Server errors
  INTERNAL_ERROR: {
    title: 'Erreur interne',
    message: 'Une erreur inattendue s\'est produite. Veuillez réessayer.',
    icon: '⚙️',
    variant: 'error'
  },
  SERVICE_UNAVAILABLE: {
    title: 'Service indisponible',
    message: 'Le service est temporairement indisponible. Veuillez réessayer dans quelques minutes.',
    icon: '🔧',
    variant: 'warning'
  }
}

// ============================================================
// Actions config
// ============================================================

const ACTIONS: Record<ActionType, ActionConfig> = {
  BUY_PACK_SMS: {
    label: 'Acheter des SMS',
    href: '/billing?tab=packs&type=sms'
  },
  BUY_PACK_EMAIL: {
    label: 'Acheter des emails',
    href: '/billing?tab=packs&type=email'
  },
  BUY_PACK_AI: {
    label: 'Acheter des crédits IA',
    href: '/billing?tab=packs&type=ai'
  },
  UPGRADE_PLAN: {
    label: 'Changer de plan',
    href: '/billing?tab=plan'
  },
  REACTIVATE: {
    label: 'Réactiver l\'abonnement',
    href: '/billing'
  },
  UPDATE_PAYMENT: {
    label: 'Mettre à jour le paiement',
    href: '/billing?tab=payment'
  },
  CONTACT_SUPPORT: {
    label: 'Contacter le support',
    href: 'mailto:support@reputy.fr'
  },
  RESUBSCRIBE: {
    label: 'Se réabonner',
    href: '/billing'
  },
  CHECK_CONFIG: {
    label: 'Vérifier la configuration',
    href: '/installations'
  },
  RETRY: {
    label: 'Réessayer',
    callback: 'retry'
  },
  LOGIN: {
    label: 'Se connecter',
    href: '/login'
  },
  VERIFY_EMAIL: {
    label: 'Vérifier l\'email',
    callback: 'resendVerification'
  },
  NEW_INSTALLATION: {
    label: 'Nouvelle installation',
    href: '/installations'
  },
  WAIT: {
    label: 'Patienter',
    callback: 'wait'
  },
  CHECK_URL: {
    label: 'Retour',
    callback: 'goBack'
  },
  UPDATE: {
    label: 'Modifier',
    callback: 'update'
  },
  FIX_INPUT: {
    label: 'Corriger',
    callback: 'focusField'
  },
  RETRY_LATER: {
    label: 'Réessayer plus tard',
    callback: 'dismiss'
  }
}

// ============================================================
// Main functions
// ============================================================

/**
 * Get full error display config for a given error response
 */
export function getErrorDisplay(
  errorCategory: ErrorCategory | string,
  action?: ActionType | string,
  customMessage?: string
): ErrorDisplay {
  const category = errorCategory as ErrorCategory
  const base = ERROR_MESSAGES[category] || ERROR_MESSAGES.INTERNAL_ERROR
  const actionConfig = action ? ACTIONS[action as ActionType] : undefined

  return {
    ...base,
    message: customMessage || base.message,
    actionLabel: actionConfig?.label,
    actionHref: actionConfig?.href,
    actionCallback: actionConfig?.callback
  }
}

/**
 * Parse backend error response and get display config
 */
export function parseBackendError(response: {
  errorCategory?: string
  message?: string
  action?: string
  details?: Record<string, unknown>
}): ErrorDisplay {
  return getErrorDisplay(
    response.errorCategory || 'INTERNAL_ERROR',
    response.action,
    response.message
  )
}

/**
 * Check if response is an error response
 */
export function isErrorResponse(response: unknown): response is { ok: false; errorCategory: string } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'ok' in response &&
    (response as { ok: boolean }).ok === false &&
    'errorCategory' in response
  )
}

/**
 * Get a simple error message (without CTA) for toast notifications
 */
export function getSimpleErrorMessage(errorCategory: ErrorCategory | string): string {
  const category = errorCategory as ErrorCategory
  const config = ERROR_MESSAGES[category] || ERROR_MESSAGES.INTERNAL_ERROR
  return `${config.icon} ${config.message}`
}

// ============================================================
// Exports
// ============================================================

export { ERROR_MESSAGES, ACTIONS }
