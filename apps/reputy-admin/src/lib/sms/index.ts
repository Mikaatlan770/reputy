/**
 * Module SMS Reputy
 * 
 * Gestion de l'encodage, validation et envoi SMS
 * Garantit 1 SMS = 1 segment pour une rentabilité maximale
 */

// Constantes
export {
  SMS_MAX_LENGTH,
  SMS_MAX_LENGTH_GSM7,
  SMS_MAX_LENGTH_UCS2,
  SMS_MAX_SEGMENTS,
  SMS_DEFAULT_MESSAGE,
  SMS_DEFAULT_TEMPLATE,
  SMS_ERRORS,
  SMS_COST_PER_SEGMENT,
  SMS_SELLING_PRICE,
  SHORT_URL_DOMAINS,
  SHORT_URL_MAX_LENGTH,
  GSM7_BASIC_CHARSET,
  GSM7_EXTENDED_CHARSET,
  GSM7_ALL_CHARS,
} from './constants'

// Encodage
export {
  detectEncoding,
  calculateSmsLength,
  isGsm7Compatible,
  isGsm7Char,
  isGsm7BasicChar,
  isGsm7ExtendedChar,
  sanitizeToGsm7,
  describeInvalidChars,
  type SmsEncoding,
  type EncodingResult,
  type LengthResult,
} from './encoding'

// Validation
export {
  validateSms,
  prepareSmsPreview,
  generateDefaultSms,
  isDefaultTemplate,
  isShortUrl,
  extractUrls,
  getAvailableCharsForLink,
  type ValidationError,
  type SmsValidationResult,
  type SmsPreviewData,
} from './validator'





