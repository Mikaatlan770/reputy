import { NextRequest, NextResponse } from 'next/server'
import {
  validateSms,
  calculateSmsLength,
  isGsm7Compatible,
  SMS_MAX_LENGTH,
  SMS_COST_PER_SEGMENT,
} from '@/lib/sms'

/**
 * API de validation SMS côté serveur
 * 
 * Vérifie qu'un message respecte les contraintes:
 * - Encodage GSM-7 uniquement
 * - Maximum 160 caractères
 * - 1 seul segment
 * - Liens courts uniquement
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, shortUrl } = body as { message?: string; shortUrl?: string }

    if (!message) {
      return NextResponse.json(
        { error: 'Le paramètre "message" est requis.' },
        { status: 400 }
      )
    }

    // Construire le message final avec le lien
    let finalMessage = message
    if (shortUrl) {
      finalMessage = message.includes('{lien}')
        ? message.replace('{lien}', shortUrl)
        : `${message}\n${shortUrl}`
    }

    // Valider le message
    const validation = validateSms(finalMessage)
    const length = calculateSmsLength(finalMessage)

    return NextResponse.json({
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      encoding: {
        type: validation.encoding.encoding,
        isGsm7: validation.encoding.isGsm7,
        invalidChars: validation.encoding.invalidChars,
      },
      length: {
        charCount: length.charCount,
        smsLength: length.smsLength,
        maxLength: SMS_MAX_LENGTH,
        segments: length.segments,
        remaining: length.remaining,
        isOneSegment: length.isOneSegment,
      },
      cost: {
        segments: length.segments,
        unitCost: SMS_COST_PER_SEGMENT,
        totalCost: length.segments * SMS_COST_PER_SEGMENT,
        credits: length.segments,
      },
      finalMessage,
    })
  } catch (error) {
    console.error('[SMS] Erreur validation:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la validation du message.' },
      { status: 500 }
    )
  }
}

/**
 * GET: Retourne les informations sur les contraintes SMS
 */
export async function GET() {
  return NextResponse.json({
    constraints: {
      encoding: 'GSM-7',
      maxLength: SMS_MAX_LENGTH,
      maxSegments: 1,
      unicodeAllowed: false,
      emojisAllowed: false,
    },
    cost: {
      perSegment: SMS_COST_PER_SEGMENT,
      currency: 'EUR',
    },
    shortUrlDomains: ['rpt.ly', 'rpty.io', 'reputy.link'],
    defaultMessage: {
      text: `Bonjour, suite a votre visite, pouvez-vous nous laisser un avis ?\nCela nous aide beaucoup.\nMerci !`,
      charCount: 87,
    },
  })
}





