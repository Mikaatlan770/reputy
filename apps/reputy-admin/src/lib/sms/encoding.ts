/**
 * Module de détection et validation d'encodage SMS
 * 
 * Objectif: s'assurer que les messages sont en GSM-7 pour garantir 1 SMS = 1 segment
 */

import { 
  GSM7_BASIC_CHARSET, 
  GSM7_EXTENDED_CHARSET,
  SMS_MAX_LENGTH_GSM7,
  SMS_MAX_LENGTH_UCS2,
} from './constants'

// ===== TYPES =====

export type SmsEncoding = 'GSM-7' | 'UCS-2'

export interface EncodingResult {
  /** Encodage détecté */
  encoding: SmsEncoding
  /** Le message est-il en GSM-7 pur ? */
  isGsm7: boolean
  /** Caractères non-GSM-7 trouvés */
  invalidChars: string[]
  /** Position des caractères invalides */
  invalidPositions: number[]
  /** Nombre de caractères étendus GSM-7 (comptent double) */
  extendedCount: number
}

export interface LengthResult {
  /** Longueur réelle en caractères */
  charCount: number
  /** Longueur en "unités SMS" (extended chars = 2) */
  smsLength: number
  /** Longueur max selon l'encodage */
  maxLength: number
  /** Nombre de segments nécessaires */
  segments: number
  /** Caractères restants avant prochain segment */
  remaining: number
  /** Le message tient-il en 1 segment ? */
  isOneSegment: boolean
}

// ===== FONCTIONS DE DÉTECTION =====

/**
 * Vérifie si un caractère fait partie du charset GSM-7 de base
 */
export function isGsm7BasicChar(char: string): boolean {
  return GSM7_BASIC_CHARSET.includes(char)
}

/**
 * Vérifie si un caractère fait partie du charset GSM-7 étendu
 */
export function isGsm7ExtendedChar(char: string): boolean {
  return GSM7_EXTENDED_CHARSET.includes(char)
}

/**
 * Vérifie si un caractère est compatible GSM-7 (basic ou extended)
 */
export function isGsm7Char(char: string): boolean {
  return isGsm7BasicChar(char) || isGsm7ExtendedChar(char)
}

/**
 * Détecte l'encodage d'un message SMS
 * Retourne des infos détaillées sur les caractères problématiques
 */
export function detectEncoding(message: string): EncodingResult {
  const invalidChars: string[] = []
  const invalidPositions: number[] = []
  let extendedCount = 0

  for (let i = 0; i < message.length; i++) {
    const char = message[i]
    
    if (isGsm7ExtendedChar(char)) {
      extendedCount++
    } else if (!isGsm7BasicChar(char)) {
      if (!invalidChars.includes(char)) {
        invalidChars.push(char)
      }
      invalidPositions.push(i)
    }
  }

  const isGsm7 = invalidChars.length === 0

  return {
    encoding: isGsm7 ? 'GSM-7' : 'UCS-2',
    isGsm7,
    invalidChars,
    invalidPositions,
    extendedCount,
  }
}

/**
 * Calcule la longueur SMS d'un message
 * Prend en compte les caractères étendus qui comptent double
 */
export function calculateSmsLength(message: string): LengthResult {
  const { isGsm7, extendedCount } = detectEncoding(message)
  const charCount = message.length

  // En GSM-7, les caractères étendus comptent pour 2
  const smsLength = isGsm7 
    ? charCount + extendedCount  // chars normaux + 1 extra pour chaque extended
    : charCount

  const maxLength = isGsm7 ? SMS_MAX_LENGTH_GSM7 : SMS_MAX_LENGTH_UCS2

  // Calcul des segments
  // Pour simplifier, on considère 1 segment = maxLength
  // En réalité, les messages multi-segments ont des headers qui réduisent la capacité
  const segments = Math.ceil(smsLength / maxLength) || 1
  const remaining = maxLength - (smsLength % maxLength || maxLength)
  const isOneSegment = segments === 1

  return {
    charCount,
    smsLength,
    maxLength,
    segments,
    remaining,
    isOneSegment,
  }
}

/**
 * Nettoie un message en remplaçant les caractères non-GSM-7
 * par des équivalents compatibles quand possible
 */
export function sanitizeToGsm7(message: string): string {
  // Map des remplacements courants
  const replacements: Record<string, string> = {
    // Accents français problématiques
    '\u00E0': 'a', // à
    '\u00E2': 'a', // â
    '\u00EA': 'e', // ê
    '\u00EB': 'e', // ë
    '\u00EE': 'i', // î
    '\u00EF': 'i', // ï
    '\u00F4': 'o', // ô
    '\u00FB': 'u', // û
    '\u00FC': 'u', // ü
    '\u00FF': 'y', // ÿ
    '\u00E7': 'c', // ç (Note: Ç majuscule est dans GSM-7, pas ç minuscule)
    // Guillemets et apostrophes
    '\u2018': "'", // '
    '\u2019': "'", // '
    '\u201C': '"', // "
    '\u201D': '"', // "
    '\u00AB': '"', // «
    '\u00BB': '"', // »
    // Tirets
    '\u2013': '-', // –
    '\u2014': '-', // —
    // Espaces spéciaux
    '\u00A0': ' ', // espace insécable
    '\u2009': ' ', // thin space
    '\u2002': ' ', // en space
    '\u2003': ' ', // em space
    // Points de suspension
    '\u2026': '...', // …
    // Autres
    '\u2022': '-', // •
    '\u00B7': '.', // ·
    '\u00B0': 'o', // °
  }

  let result = message

  // Appliquer les remplacements
  for (const [char, replacement] of Object.entries(replacements)) {
    result = result.split(char).join(replacement)
  }

  // Supprimer les emojis et autres caractères Unicode non mappés
  // Regex pour détecter les emojis et symboles Unicode étendus
  result = result.replace(/[\u{1F000}-\u{1FFFF}]/gu, '') // Emojis
  result = result.replace(/[\u{2600}-\u{26FF}]/gu, '')   // Symboles divers
  result = result.replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats

  return result
}

/**
 * Vérifie rapidement si un message est GSM-7 compatible
 */
export function isGsm7Compatible(message: string): boolean {
  return detectEncoding(message).isGsm7
}

/**
 * Retourne une description lisible des caractères problématiques
 */
export function describeInvalidChars(invalidChars: string[]): string {
  if (invalidChars.length === 0) return ''
  
  const descriptions = invalidChars.map(char => {
    const code = char.charCodeAt(0)
    // Emojis
    if (code >= 0x1F000) return `emoji "${char}"`
    // Caractère affichable
    if (char.trim()) return `"${char}"`
    // Caractère non affichable
    return `caractère spécial (U+${code.toString(16).toUpperCase()})`
  })

  return `Caractères non autorisés : ${descriptions.join(', ')}`
}

