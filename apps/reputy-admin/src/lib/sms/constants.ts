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

/** Longueur max autorisée (on force GSM-7 = 160) */
export const SMS_MAX_LENGTH = SMS_MAX_LENGTH_GSM7

/** Nombre de segments autorisés (toujours 1) */
export const SMS_MAX_SEGMENTS = 1

/** Longueur maximale du lien court */
export const SHORT_URL_MAX_LENGTH = 20

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
  TOO_LONG: 'Votre message dépasse 160 caractères. Raccourcissez-le pour garantir 1 SMS.',
  MULTI_SEGMENT: 'Ce message nécessiterait plusieurs SMS. Simplifiez-le pour rester à 1 segment.',
  URL_TOO_LONG: 'L\'URL est trop longue. Utilisez un lien court (ex: rpt.ly/abc).',
  EMPTY_MESSAGE: 'Le message ne peut pas être vide.',
} as const

// ===== DOMAINES LIENS COURTS =====

export const SHORT_URL_DOMAINS = [
  'rpt.ly',
  'rpty.io',
  'reputy.link',
] as const

export type ShortUrlDomain = typeof SHORT_URL_DOMAINS[number]





