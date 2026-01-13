/**
 * Module de validation complète des SMS
 * 
 * Combine les vérifications d'encodage, de longueur et de format
 * pour garantir 1 SMS = 1 segment
 */

import { 
  detectEncoding, 
  calculateSmsLength, 
  describeInvalidChars,
  type EncodingResult,
  type LengthResult,
} from './encoding'
import {
  SMS_MAX_LENGTH,
  SMS_MAX_SEGMENTS,
  SHORT_URL_MAX_LENGTH,
  SMS_ERRORS,
  SMS_DEFAULT_MESSAGE,
  SHORT_URL_DOMAINS,
} from './constants'

// ===== TYPES =====

export interface ValidationError {
  code: keyof typeof SMS_ERRORS
  message: string
  details?: string
}

export interface SmsValidationResult {
  /** Le message est-il valide ? */
  isValid: boolean
  /** Erreurs de validation */
  errors: ValidationError[]
  /** Avertissements (non bloquants) */
  warnings: string[]
  /** Résultat de détection d'encodage */
  encoding: EncodingResult
  /** Résultat de calcul de longueur */
  length: LengthResult
  /** Message nettoyé (si applicable) */
  sanitizedMessage?: string
}

export interface SmsPreviewData {
  /** Message tel qu'il sera envoyé */
  finalMessage: string
  /** Nombre de caractères */
  charCount: number
  /** Nombre de segments */
  segments: number
  /** Caractères restants */
  remaining: number
  /** Coût estimé */
  estimatedCost: number
  /** Le message est-il valide pour envoi ? */
  canSend: boolean
}

// ===== FONCTIONS DE VALIDATION =====

/**
 * Vérifie si une URL est un lien court valide
 */
export function isShortUrl(url: string): boolean {
  // Vérifier la longueur
  if (url.length > SHORT_URL_MAX_LENGTH) return false
  
  // Vérifier le domaine
  const lowerUrl = url.toLowerCase()
  return SHORT_URL_DOMAINS.some(domain => 
    lowerUrl.startsWith(`https://${domain}/`) ||
    lowerUrl.startsWith(`http://${domain}/`) ||
    lowerUrl.startsWith(`${domain}/`)
  )
}

/**
 * Extrait les URLs d'un message
 */
export function extractUrls(message: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+|[a-z0-9-]+\.[a-z]{2,}\/[^\s]*)/gi
  return message.match(urlRegex) || []
}

/**
 * Valide un message SMS complet
 */
export function validateSms(message: string): SmsValidationResult {
  const errors: ValidationError[] = []
  const warnings: string[] = []

  // Message vide
  if (!message || message.trim().length === 0) {
    errors.push({
      code: 'EMPTY_MESSAGE',
      message: SMS_ERRORS.EMPTY_MESSAGE,
    })
    return {
      isValid: false,
      errors,
      warnings,
      encoding: detectEncoding(''),
      length: calculateSmsLength(''),
    }
  }

  // Détection d'encodage
  const encoding = detectEncoding(message)

  // Vérification Unicode
  if (!encoding.isGsm7) {
    errors.push({
      code: 'UNICODE_DETECTED',
      message: SMS_ERRORS.UNICODE_DETECTED,
      details: describeInvalidChars(encoding.invalidChars),
    })
  }

  // Calcul de longueur
  const length = calculateSmsLength(message)

  // Vérification longueur
  if (length.smsLength > SMS_MAX_LENGTH) {
    errors.push({
      code: 'TOO_LONG',
      message: SMS_ERRORS.TOO_LONG,
      details: `${length.smsLength} caractères sur ${SMS_MAX_LENGTH} max`,
    })
  }

  // Vérification segments
  if (length.segments > SMS_MAX_SEGMENTS) {
    errors.push({
      code: 'MULTI_SEGMENT',
      message: SMS_ERRORS.MULTI_SEGMENT,
      details: `${length.segments} segments détectés`,
    })
  }

  // Vérification des URLs
  const urls = extractUrls(message)
  for (const url of urls) {
    if (!isShortUrl(url)) {
      errors.push({
        code: 'URL_TOO_LONG',
        message: SMS_ERRORS.URL_TOO_LONG,
        details: `URL détectée: "${url}"`,
      })
      break // Une seule erreur URL suffit
    }
  }

  // Avertissements
  if (encoding.extendedCount > 0) {
    warnings.push(
      `${encoding.extendedCount} caractère(s) étendu(s) détecté(s) (€, [, ], etc.). ` +
      `Ils comptent pour 2 caractères chacun.`
    )
  }

  if (length.smsLength > SMS_MAX_LENGTH * 0.9 && length.smsLength <= SMS_MAX_LENGTH) {
    warnings.push(
      `Attention : ${length.remaining} caractère(s) restant(s) avant dépassement.`
    )
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    encoding,
    length,
  }
}

/**
 * Valide et prépare un SMS pour l'aperçu
 */
export function prepareSmsPreview(
  message: string,
  shortUrl?: string
): SmsPreviewData {
  // Construire le message final
  let finalMessage = message
  if (shortUrl) {
    finalMessage = message.includes('{lien}')
      ? message.replace('{lien}', shortUrl)
      : `${message}\n${shortUrl}`
  }

  const validation = validateSms(finalMessage)
  const { length } = validation

  // Coût estimé (toujours 1 segment si valide)
  const estimatedCost = validation.isValid ? 0.055 : length.segments * 0.055

  return {
    finalMessage,
    charCount: length.charCount,
    segments: length.segments,
    remaining: length.remaining,
    estimatedCost,
    canSend: validation.isValid,
  }
}

/**
 * Génère un message SMS par défaut avec lien
 */
export function generateDefaultSms(shortUrl: string): string {
  return `${SMS_DEFAULT_MESSAGE}\n${shortUrl}`
}

/**
 * Vérifie si un message utilise le template par défaut
 */
export function isDefaultTemplate(message: string): boolean {
  // Normaliser les sauts de ligne pour la comparaison
  const normalizedMessage = message.replace(/\r\n/g, '\n').trim()
  const normalizedDefault = SMS_DEFAULT_MESSAGE.replace(/\r\n/g, '\n').trim()
  
  return normalizedMessage.startsWith(normalizedDefault)
}

/**
 * Calcule le nombre de caractères disponibles pour le lien
 * dans le message par défaut
 */
export function getAvailableCharsForLink(): number {
  const defaultLength = calculateSmsLength(SMS_DEFAULT_MESSAGE + '\n').smsLength
  return SMS_MAX_LENGTH - defaultLength
}





