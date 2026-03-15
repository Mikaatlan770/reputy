/**
 * Constantes SMS pour Reputy
 * 
 * Objectif: garantir 1 SMS = 1 segment = coût maîtrisé (~0,055€ HT)
 */

// ===== LIMITES SMS =====

/** Longueur maximale d'un SMS en encodage GSM-7 (1 segment) */
export const SMS_MAX_LENGTH_GSM7 = 160

/** Longueur maximale d'un SMS en encodage UCS-2/Unicode (1 segment) */
export const SMS_MAX_LENGTH_UCS2 = 70

/**
 * Caractères ajoutés automatiquement par Brevo pour le STOP opt-out
 * obligatoire en France (ex: " STOP au 36180" = ~14 chars)
 */
export const BREVO_STOP_LENGTH = 14

/**
 * Longueur max effective à utiliser pour la validation.
 * = 160 (GSM-7) - 14 (STOP Brevo ajouté automatiquement)
 * Garantit que le SMS réel envoyé tient en 1 segment.
 */
export const SMS_MAX_LENGTH = SMS_MAX_LENGTH_GSM7 - BREVO_STOP_LENGTH // 146

/** Nombre de segments autorisés (toujours 1) */
export const SMS_MAX_SEGMENTS = 1

/** Longueur maximale du lien court (40 pour dev avec localhost) */
export const SHORT_URL_MAX_LENGTH = 40

// ===== MESSAGE PAR DÉFAUT =====

/**
 * Message SMS par défaut (non modifiable en v1)
 * 87 caractères - laisse ~73 chars pour le lien et espaces
 */
export const SMS_DEFAULT_MESSAGE = `Bonjour, suite a votre visite, pouvez-vous nous laisser un avis ?
Cela nous aide beaucoup.
Merci !`

/**
 * Message complet avec placeholder pour le lien
 */
export const SMS_DEFAULT_TEMPLATE = `Bonjour, suite a votre visite, pouvez-vous nous laisser un avis ?
Cela nous aide beaucoup.
Merci !
{lien}`

/**
 * Placeholders disponibles dans les templates personnalisés
 * - {lien}    → URL de collecte d'avis (obligatoire)
 * - {cabinet} → Nom de l'établissement
 */
export const SMS_PLACEHOLDERS = [
  { key: '{lien}', description: 'Lien de collecte (obligatoire)', required: true },
  { key: '{cabinet}', description: "Nom de l'établissement", required: false },
] as const

// ===== CHARSET GSM-7 =====

/**
 * Caractères de base GSM-7 (7 bits)
 * Source: GSM 03.38 / 3GPP TS 23.038
 */
export const GSM7_BASIC_CHARSET = 
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

/**
 * Caractères GSM-7 étendus (nécessitent un escape = 2 caractères)
 * Attention: ces caractères comptent pour 2 dans le calcul de longueur
 */
export const GSM7_EXTENDED_CHARSET = '^{}\\[~]|€'

/**
 * Tous les caractères GSM-7 autorisés
 */
export const GSM7_ALL_CHARS = GSM7_BASIC_CHARSET + GSM7_EXTENDED_CHARSET

// ===== COÛTS =====

/** Coût estimé par SMS (1 segment) en euros HT */
export const SMS_COST_PER_SEGMENT = 0.055

/** Marge appliquée sur le coût SMS */
export const SMS_MARGIN_PERCENT = 0.40 // 40% de marge

/** Prix de vente par SMS */
export const SMS_SELLING_PRICE = SMS_COST_PER_SEGMENT * (1 + SMS_MARGIN_PERCENT)

// ===== MESSAGES D'ERREUR =====

export const SMS_ERRORS = {
  UNICODE_DETECTED: 'Votre message contient des caractères non compatibles SMS (Unicode). Retirez les accents spéciaux, emojis ou caractères spéciaux.',
  TOO_LONG: 'Votre message dépasse 146 caractères. Raccourcissez-le pour garantir 1 SMS (Brevo ajoute ~14 chars pour le STOP opt-out).',
  MULTI_SEGMENT: 'Ce message nécessiterait plusieurs SMS. Simplifiez-le pour rester à 1 segment.',
  URL_TOO_LONG: 'L\'URL est trop longue. Utilisez un lien court (ex: rpt.ly/abc).',
  EMPTY_MESSAGE: 'Le message ne peut pas être vide.',
} as const

// ===== DOMAINES LIENS COURTS =====

export const SHORT_URL_DOMAINS = [
  'rpt.ly',
  'rpty.io',
  'reputy.link',
  // Domaine production des shortlinks Reputy (/r/{8-char-code})
  'api.reputyapp.com',
  // Development domains
  '127.0.0.1:8787',
  'localhost:8787',
] as const

export type ShortUrlDomain = typeof SHORT_URL_DOMAINS[number]





